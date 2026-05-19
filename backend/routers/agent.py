"""
AI Agent Router — LLM-powered portfolio analysis chatbot.
Uses Groq (free tier) with Llama 3.3 70B and function/tool calling.

Agent loop:
  1. User sends message + portfolio context
  2. Groq picks tools to call
  3. Backend executes tools (calls internal analytics functions)
  4. Results returned to Groq → plain-English answer
"""
import os, json, sys, threading
from collections import defaultdict
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetcher import fetch_nav_history, search_schemes, fetch_multiple_navs
from data.preprocessor import clean_nav_data
from analytics.performance import simulate_sip_growth, simulate_lumpsum_growth, calculate_cagr
from analytics.risk import calculate_risk_score
from analytics.tax_harvesting import compute_tax_harvest
from analytics.overlap import compute_overlap
from analytics.factor_attribution import run_factor_attribution, FACTOR_CODES
from analytics.optimizer import optimize_portfolio

router = APIRouter(prefix="/api/agent", tags=["Agent"])

# ── Rate Limiting ─────────────────────────────────────────────────────────────
_rate_store: Dict[str, List[datetime]] = defaultdict(list)
_rate_lock = threading.Lock()
RATE_LIMIT        = 5      # max requests
RATE_WINDOW_SEC   = 3600   # per hour


def _check_rate_limit(ip: str) -> tuple:
    """Returns (allowed: bool, remaining: int)."""
    now = datetime.now()
    with _rate_lock:
        _rate_store[ip] = [
            ts for ts in _rate_store[ip]
            if (now - ts).total_seconds() < RATE_WINDOW_SEC
        ]
        count = len(_rate_store[ip])
        if count == 0:
            # Pruned to empty — clean up stale key, re-create with new request
            del _rate_store[ip]
        if count >= RATE_LIMIT:
            return False, 0
        _rate_store[ip].append(now)
        return True, RATE_LIMIT - count - 1


# ── Groq Client ───────────────────────────────────────────────────────────────
try:
    from groq import Groq as _GroqClient
    _GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
    groq_client = _GroqClient(api_key=_GROQ_KEY) if _GROQ_KEY else None
except Exception:
    groq_client = None

GROQ_MODEL = "llama-3.3-70b-versatile"

# ── System Prompt ─────────────────────────────────────────────────────────────
_SYSTEM = """\
You are Folio Klarity, an intelligent financial analysis assistant for Indian mutual fund investors.
You have live tools that can fetch real portfolio data, compute risk/return metrics, run ML NAV
forecasts, analyse tax, detect behavioural biases, and optimise allocations.

Rules:
- ALWAYS call tools before answering quantitative questions — never guess numbers.
- Quote ₹ values and percentages from tool results directly.
- Be concise but data-driven; the user is looking at a financial dashboard.
- This is analysis, NOT investment advice. Clarify this for any recommendation.
- Use Indian financial context (SEBI, LTCG/STCG, Budget 2024 tax rates).
- Chain multiple tools when needed (e.g., performance + risk for a full picture).
"""

# ── Tool Definitions (OpenAI-compatible format) ───────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "analyze_portfolio_performance",
            "description": (
                "Fetch current performance metrics for all funds in the user's portfolio: "
                "invested amount, current value, absolute return %, CAGR %, and total P&L. "
                "Use this for questions about returns, portfolio value, gains/losses, growth."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_portfolio_risk",
            "description": (
                "Get risk metrics for each portfolio fund: annualised volatility, Sharpe ratio, "
                "max drawdown, Sortino ratio, Value at Risk (VaR 95%), and overall risk score (1-10). "
                "Use for risk, volatility, drawdown, or safety questions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "tax_harvest_analysis",
            "description": (
                "Identify tax loss harvesting opportunities. Shows funds at an unrealised loss, "
                "potential tax saved by harvesting under Budget 2024 rules (STCG 20%, LTCG 12.5%), "
                "and the recommended harvest plan. Use for tax-related questions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "portfolio_overlap",
            "description": (
                "Compute pairwise NAV correlation between all portfolio funds. Returns a diversification "
                "score (0-100), concentration risk level, and high-overlap fund pairs (>85% correlation). "
                "Use for overlap, diversification, or redundancy questions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "factor_attribution",
            "description": (
                "Run Fama-French 3-factor OLS regression to decompose each fund's return into: "
                "market beta (Nifty 50 exposure), SMB (small-cap tilt), MMB (mid-cap tilt), and "
                "true alpha (manager skill beyond factor exposure). Use to evaluate active vs passive value."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "optimize_portfolio",
            "description": (
                "Run Modern Portfolio Theory optimisation to find the best allocation weights across "
                "portfolio funds. Returns optimal weights, expected return, volatility, and Sharpe ratio."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "objective": {
                        "type": "string",
                        "enum": ["max_sharpe", "min_volatility"],
                        "description": "'max_sharpe' maximises risk-adjusted return; 'min_volatility' minimises risk.",
                    }
                },
                "required": ["objective"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "forecast_nav",
            "description": (
                "Generate an ML-based NAV forecast for a specific fund using trained models. "
                "Returns predicted NAV, expected % change, and confidence band over the horizon."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scheme_code": {
                        "type": "string",
                        "description": "The mutual fund scheme code (e.g. '120503'). "
                                       "Ask the user or use search_funds if unsure.",
                    },
                    "horizon_days": {
                        "type": "integer",
                        "description": "Days to forecast ahead (default 30).",
                        "default": 30,
                    },
                    "model": {
                        "type": "string",
                        "enum": ["random_forest", "gradient_boosting", "linear_regression"],
                        "description": "ML model to use. Default: random_forest.",
                    },
                },
                "required": ["scheme_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_funds",
            "description": "Search for mutual funds by name or keyword. Returns matching funds with scheme codes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Fund name or keyword (e.g. 'Parag Parikh flexi cap')"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fund_nav_summary",
            "description": (
                "Get key stats for a specific fund: latest NAV, 1-year return, 3-year return, "
                "5-year return, and 52-week high/low."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scheme_code": {"type": "string", "description": "The mutual fund scheme code."},
                },
                "required": ["scheme_code"],
            },
        },
    },
]

# ── Request / Response Models ─────────────────────────────────────────────────
class MsgIn(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[MsgIn]
    portfolio: Optional[List[Dict]] = None


# ── Main Chat Endpoint ────────────────────────────────────────────────────────
@router.post("/chat")
def chat(req: ChatRequest, request: Request):
    if not groq_client:
        raise HTTPException(
            status_code=503,
            detail="AI Agent not configured — GROQ_API_KEY environment variable is missing.",
        )

    ip = getattr(request.client, "host", "unknown")
    allowed, remaining = _check_rate_limit(ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached: 5 requests per hour. Please try again later.",
        )

    portfolio = req.portfolio or []

    # Build system message with portfolio context
    portfolio_ctx = _portfolio_context(portfolio)
    system_content = _SYSTEM + "\n\n" + portfolio_ctx

    messages: List[Dict] = [{"role": "system", "content": system_content}]
    for m in req.messages:
        messages.append({"role": m.role, "content": m.content})

    tools_used: List[str] = []
    MAX_ITER = 8

    for _ in range(MAX_ITER):
        resp = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1800,
            temperature=0.2,
        )

        msg = resp.choices[0].message

        # ── No more tool calls → final answer ──
        if not msg.tool_calls:
            return {
                "response": msg.content or "I wasn't able to generate a response. Please try again.",
                "tools_used": tools_used,
                "requests_remaining": remaining,
            }

        # ── Append assistant message with tool_calls ──
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ],
        })

        # ── Execute each tool and append results ──
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments or "{}")
            except Exception:
                fn_args = {}

            tools_used.append(fn_name)

            try:
                result = _run_tool(fn_name, fn_args, portfolio)
            except Exception as e:
                result = {"error": f"Tool '{fn_name}' failed: {str(e)}"}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, default=str),
            })

    # Fallback if max iterations hit
    return {
        "response": "I've run several analyses but hit the iteration limit. Try asking a more focused question.",
        "tools_used": tools_used,
        "requests_remaining": remaining,
    }


@router.get("/status")
def agent_status():
    """Check if the agent is configured and ready."""
    return {
        "configured": groq_client is not None,
        "model": GROQ_MODEL,
        "rate_limit": f"{RATE_LIMIT} requests per hour",
    }


# ── Tool Executor ─────────────────────────────────────────────────────────────
def _run_tool(name: str, args: Dict, portfolio: List[Dict]) -> Dict:
    if name == "analyze_portfolio_performance":
        return _t_performance(portfolio)
    if name == "analyze_portfolio_risk":
        return _t_risk(portfolio)
    if name == "tax_harvest_analysis":
        return _t_tax_harvest(portfolio)
    if name == "portfolio_overlap":
        return _t_overlap(portfolio)
    if name == "factor_attribution":
        return _t_factor(portfolio)
    if name == "optimize_portfolio":
        return _t_optimize(portfolio, args.get("objective", "max_sharpe"))
    if name == "forecast_nav":
        return _t_forecast(
            args.get("scheme_code", ""),
            int(args.get("horizon_days", 30)),
            args.get("model", "random_forest"),
        )
    if name == "search_funds":
        return _t_search(args.get("query", ""))
    if name == "get_fund_nav_summary":
        return _t_nav_summary(args.get("scheme_code", ""))
    return {"error": f"Unknown tool: {name}"}


# ── Individual Tool Implementations ──────────────────────────────────────────

def _t_performance(portfolio: List[Dict]) -> Dict:
    results = []
    for fund in portfolio:
        df = fetch_nav_history(fund["scheme_code"])
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        sip = fund.get("monthly_sip", 0)
        lump = fund.get("investment_amount", 0)
        pdate = fund.get("purchase_date")

        if sip > 0:
            perf = simulate_sip_growth(df, sip, pdate, None)
        elif lump > 0:
            perf = simulate_lumpsum_growth(df, lump, pdate)
        else:
            perf = simulate_lumpsum_growth(df, 10000, pdate)

        invested = perf.get("total_invested", 0)
        current  = perf.get("current_value", 0)
        results.append({
            "fund":               fund.get("name", fund["scheme_code"]),
            "scheme_code":        fund["scheme_code"],
            "invested_inr":       round(invested, 2),
            "current_value_inr":  round(current, 2),
            "gain_loss_inr":      round(current - invested, 2),
            "absolute_return_pct": round(perf.get("absolute_return", 0), 2),
            "cagr_pct":           round(perf.get("cagr", 0), 2),
        })

    total_inv = sum(r["invested_inr"] for r in results)
    total_cur = sum(r["current_value_inr"] for r in results)
    return {
        "fund_performance": results,
        "portfolio_total_invested_inr": round(total_inv, 2),
        "portfolio_current_value_inr":  round(total_cur, 2),
        "portfolio_gain_loss_inr":      round(total_cur - total_inv, 2),
        "portfolio_absolute_return_pct": round(
            (total_cur - total_inv) / max(total_inv, 1) * 100, 2
        ),
    }


def _t_risk(portfolio: List[Dict]) -> Dict:
    results = []
    for fund in portfolio:
        df = fetch_nav_history(fund["scheme_code"])
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        risk = calculate_risk_score(df)
        dd_info = risk.get("max_drawdown", {})
        results.append({
            "fund":               fund.get("name", fund["scheme_code"]),
            "scheme_code":        fund["scheme_code"],
            "risk_score_1_10":    round(risk.get("risk_score", 5), 1),
            "annual_volatility_pct": round(risk.get("volatility_pct", 0), 2),
            "sharpe_ratio":       round(risk.get("sharpe_ratio", 0), 3),
            "max_drawdown_pct":   round(dd_info.get("max_drawdown_pct", 0) if isinstance(dd_info, dict) else 0, 2),
            "sortino_ratio":      round(risk.get("sortino_ratio", 0), 3),
            "risk_category":      risk.get("risk_category", "Medium"),
        })
    results.sort(key=lambda x: x["risk_score_1_10"], reverse=True)
    return {"fund_risks": results}


def _t_tax_harvest(portfolio: List[Dict]) -> Dict:
    fund_data = []
    for fund in portfolio:
        df = fetch_nav_history(fund["scheme_code"])
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        sip  = fund.get("monthly_sip", 0)
        lump = fund.get("investment_amount", 0)
        pdate = fund.get("purchase_date")

        if sip > 0:
            perf = simulate_sip_growth(df, sip, pdate, None)
        elif lump > 0:
            perf = simulate_lumpsum_growth(df, lump, pdate)
        else:
            continue

        fund_data.append({
            "scheme_code":   fund["scheme_code"],
            "name":          fund.get("name", fund["scheme_code"]),
            "total_invested": perf.get("total_invested", 0),
            "current_value":  perf.get("current_value", 0),
            "purchase_date":  pdate,
        })

    if not fund_data:
        return {"error": "No fund data available for tax analysis"}

    result = compute_tax_harvest(fund_data)
    summary = result.get("summary", {})
    return {
        "tax_before_harvest_inr": summary.get("net_tax_before_harvest", 0),
        "tax_after_harvest_inr":  summary.get("net_tax_after_harvest", 0),
        "tax_saved_inr":          summary.get("tax_saved", 0),
        "savings_pct":            summary.get("savings_pct", 0),
        "loss_positions":         result.get("loss_positions", []),
        "gain_positions":         [{"name": p["name"], "pnl": p["pnl"], "regime": p["regime"]}
                                   for p in result.get("gain_positions", [])],
        "recommended_harvests": result.get("harvest_plan", {}).get("recommended_harvests", []),
    }


def _t_overlap(portfolio: List[Dict]) -> Dict:
    if len(portfolio) < 2:
        return {"error": "Need at least 2 funds for overlap analysis"}
    codes    = [f["scheme_code"] for f in portfolio]
    name_map = {f["scheme_code"]: f.get("name", f["scheme_code"]) for f in portfolio}
    nav_dict = {}
    for code in codes:
        df = fetch_nav_history(code)
        if df is not None and not df.empty:
            nav_dict[code] = clean_nav_data(df)
    if len(nav_dict) < 2:
        return {"error": "Could not fetch enough NAV data"}
    result = compute_overlap(nav_dict, name_map)
    return {
        "diversification_score_100": result.get("diversification_score"),
        "average_correlation_pct":   result.get("average_correlation"),
        "concentration_risk":        result.get("concentration_risk"),
        "interpretation":            result.get("interpretation"),
        "high_overlap_pairs":        result.get("high_correlation_pairs", []),
    }


def _t_factor(portfolio: List[Dict]) -> Dict:
    factor_raw = fetch_multiple_navs(list(FACTOR_CODES.values()))
    factor_navs = {
        label: clean_nav_data(factor_raw[code])
        for label, code in FACTOR_CODES.items()
        if code in factor_raw
    }
    if len(factor_navs) < 3:
        return {"error": "Could not fetch factor index NAVs. Try again later."}

    results = []
    for fund in portfolio:
        df = fetch_nav_history(fund["scheme_code"])
        if df is None or df.empty:
            continue
        df = clean_nav_data(df)
        attr = run_factor_attribution(df, factor_navs, fund.get("name", fund["scheme_code"]), None)
        results.append({
            "fund":               attr.get("fund_name"),
            "alpha_annual_pct":   round(attr.get("alpha_annual_pct", 0), 2),
            "alpha_significant":  attr.get("alpha_significant", False),
            "beta_market":        round(attr.get("beta_market", 1), 3),
            "beta_smb":           round(attr.get("beta_smb", 0), 3),
            "beta_mmb":           round(attr.get("beta_mmb", 0), 3),
            "r_squared":          round(attr.get("r_squared", 0), 3),
            "interpretation":     attr.get("interpretation", ""),
        })
    results.sort(key=lambda x: x["alpha_annual_pct"], reverse=True)
    return {"factor_attributions": results}


def _t_optimize(portfolio: List[Dict], objective: str) -> Dict:
    if len(portfolio) < 2:
        return {"error": "Need at least 2 funds for optimisation"}
    codes    = [f["scheme_code"] for f in portfolio]
    name_map = {f["scheme_code"]: f.get("name", f["scheme_code"]) for f in portfolio}
    nav_dict = {}
    for code in codes:
        df = fetch_nav_history(code)
        if df is not None and not df.empty:
            nav_dict[code] = clean_nav_data(df)
    if len(nav_dict) < 2:
        return {"error": "Could not fetch enough NAV data"}
    # Approximate total invested per fund: lumpsum + (SIP × months since purchase)
    def _approx_invested(f):
        lump = f.get("investment_amount", 0) or 0
        sip = f.get("monthly_sip", 0) or 0
        pdate = f.get("purchase_date")
        months = 1
        if pdate:
            try:
                from datetime import date, datetime
                d = datetime.strptime(pdate, "%Y-%m-%d").date()
                months = max(1, (date.today() - d).days // 30)
            except Exception:
                months = 12  # default 1 year
        return lump + (sip * months) if (lump + sip) > 0 else 1

    invested = {f["scheme_code"]: _approx_invested(f) for f in portfolio}
    total = sum(invested.values())
    current_weights = {k: v / total for k, v in invested.items()}
    result = optimize_portfolio(nav_dict, current_weights, objective)
    # Translate codes to names in weights
    named = {name_map.get(k, k): round(v * 100, 1) for k, v in result.get("optimal_weights", {}).items()}
    return {
        "objective":                  objective,
        "optimal_weights_pct":        named,
        "expected_annual_return_pct": result.get("expected_return_pct", 0),
        "expected_annual_volatility_pct": result.get("expected_volatility_pct", 0),
        "sharpe_ratio":               round(result.get("sharpe_ratio", 0), 3),
    }


def _t_forecast(scheme_code: str, horizon_days: int, model_name: str) -> Dict:
    if not scheme_code:
        return {"error": "scheme_code is required"}
    try:
        from ml.trainer import load_models, train_all_models, save_models
        from ml.features import build_features, get_feature_columns, prepare_train_test
        from ml.predictor import multi_step_forecast
    except ImportError as e:
        return {"error": f"ML modules not available: {e}"}

    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        return {"error": f"No NAV data for scheme {scheme_code}"}
    df = clean_nav_data(df)

    models = load_models(scheme_code)
    if not models:
        if len(df) < 400:
            return {"error": f"Insufficient history ({len(df)} days) for ML training. Need 400+ days."}
        feat_df = build_features(df)
        if len(feat_df) < 200:
            return {"error": "Not enough data after feature engineering"}
        # For production forecasting, train on the full feature set (not the 80/20 split).
        # The train_test split is for evaluation only — production models should use all data.
        feat_cols_train = get_feature_columns(feat_df)
        X_full = feat_df[feat_cols_train].values
        y_full = feat_df["target"].values
        models = train_all_models(X_full, y_full)
        save_models(models, scheme_code, X_background=X_full)

    feat_df    = build_features(df)
    feat_cols  = get_feature_columns(feat_df)
    sel        = model_name if model_name in models else "random_forest"
    result     = multi_step_forecast(models, feat_df, feat_cols, horizon_days, sel)

    forecast   = result.get("forecast", {})
    preds      = forecast.get("predictions", [])
    last_nav   = result.get("last_actual_nav", 0)
    final_pred = preds[-1] if preds else last_nav
    change_pct = round((final_pred - last_nav) / max(last_nav, 1) * 100, 2) if last_nav else 0

    return {
        "scheme_code":      scheme_code,
        "model_used":       sel,
        "horizon_days":     horizon_days,
        "last_actual_nav":  last_nav,
        "last_actual_date": result.get("last_actual_date"),
        "predicted_nav":    round(final_pred, 2),
        "expected_change_pct": change_pct,
        "lower_bound":      round(forecast.get("lower_bound", [last_nav])[-1], 2) if forecast.get("lower_bound") else None,
        "upper_bound":      round(forecast.get("upper_bound", [last_nav])[-1], 2) if forecast.get("upper_bound") else None,
        "direction":        "up" if change_pct >= 0 else "down",
    }


def _t_search(query: str) -> Dict:
    if not query:
        return {"error": "query is required"}
    results = search_schemes(query)
    trimmed = [
        {"scheme_code": str(r.get("schemeCode", "")), "name": r.get("schemeName", "")}
        for r in results[:10]
    ]
    return {"results": trimmed, "count": len(trimmed)}


def _t_nav_summary(scheme_code: str) -> Dict:
    if not scheme_code:
        return {"error": "scheme_code is required"}
    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        return {"error": f"No data for scheme {scheme_code}"}
    df = clean_nav_data(df)
    df = df.sort_values("date").reset_index(drop=True)

    latest_nav  = float(df["nav"].iloc[-1])
    latest_date = str(df["date"].iloc[-1])[:10]
    high_52w    = float(df["nav"].tail(365).max())
    low_52w     = float(df["nav"].tail(365).min())

    def _ret(days):
        """days should be calendar days (data is forward-filled to 365/year)."""
        if len(df) <= days:
            return None
        start = float(df["nav"].iloc[-(days + 1)])
        return round((latest_nav - start) / max(start, 1) * 100, 2)

    return {
        "scheme_code":   scheme_code,
        "latest_nav":    round(latest_nav, 2),
        "latest_date":   latest_date,
        "return_1y_pct": _ret(365),
        "return_3y_pct": _ret(1095),
        "return_5y_pct": _ret(1825),
        "high_52w":      round(high_52w, 2),
        "low_52w":       round(low_52w, 2),
        "total_data_days": len(df),
    }


# ── Portfolio Context Builder ─────────────────────────────────────────────────
def _portfolio_context(portfolio: List[Dict]) -> str:
    if not portfolio:
        return "The user has no funds in their portfolio yet."
    lines = ["USER PORTFOLIO:"]
    for f in portfolio:
        name  = f.get("name", f.get("scheme_code", "Unknown"))
        code  = f.get("scheme_code", "")
        sip   = f.get("monthly_sip", 0)
        lump  = f.get("investment_amount", 0)
        pdate = f.get("purchase_date", "unknown")
        cat   = f.get("category", "")
        lines.append(
            f"  • {name} (code: {code}, category: {cat}, "
            f"monthly SIP: ₹{sip:,.0f}, lumpsum: ₹{lump:,.0f}, since: {pdate})"
        )
    return "\n".join(lines)
