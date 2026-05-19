"""
Insight Generator — Produces intelligent, actionable portfolio insights.

Rule-based engine that analyzes portfolio composition, risk-return dynamics,
and diversification to generate categorized recommendations.
"""
from typing import Dict, List


def generate_insights(
    portfolio: List[Dict],
    risk_data: Dict = None,
    performance_data: List[Dict] = None,
) -> List[Dict]:
    """
    Generate insights based on portfolio composition and analytics.

    Args:
        portfolio: List of {scheme_code, name, category, weight, invested, current_value}
        risk_data: {risk_score, volatility_pct, max_drawdown, sharpe_ratio}
        performance_data: [{scheme_code, cagr, absolute_return}]

    Returns:
        List of {severity, title, description, category}
    """
    insights = []

    if not portfolio:
        return [{"severity": "warning", "title": "Empty Portfolio",
                 "description": "Add funds to your portfolio to receive insights.",
                 "category": "general"}]

    # ── 1. Concentration Risk ──
    for fund in portfolio:
        weight = fund.get("weight", 0)
        if weight > 0.4:
            insights.append({
                "severity": "warning",
                "title": "High Concentration Risk",
                "description": f"{fund['name']} makes up {round(weight*100,1)}% of your portfolio. "
                               f"Consider reducing exposure below 40% to limit single-fund risk.",
                "category": "diversification",
            })

    # ── 2. Category Overlap ──
    categories = {}
    for fund in portfolio:
        cat = fund.get("category", "Unknown")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(fund)

    for cat, funds in categories.items():
        if len(funds) > 2:
            fund_names = ", ".join(f["name"][:30] for f in funds[:3])
            insights.append({
                "severity": "info",
                "title": f"Multiple {cat} Funds Detected",
                "description": f"You hold {len(funds)} funds in the {cat} category ({fund_names}...). "
                               f"This may lead to portfolio overlap. Consider consolidating.",
                "category": "diversification",
            })

    # ── 3. Small/Mid Cap Overexposure ──
    risky_weight = sum(
        f.get("weight", 0) for f in portfolio
        if f.get("category") in ["Small Cap", "Mid Cap"]
    )
    if risky_weight > 0.6:
        insights.append({
            "severity": "critical",
            "title": "High Small/Mid Cap Exposure",
            "description": f"{round(risky_weight*100,1)}% of your portfolio is in Small & Mid Cap funds. "
                           f"This increases volatility significantly. Consider adding Large Cap or Hybrid funds "
                           f"for stability, especially if your investment horizon is < 5 years.",
            "category": "risk",
        })
    elif risky_weight > 0.4:
        insights.append({
            "severity": "info",
            "title": "Moderate Small/Mid Cap Tilt",
            "description": f"{round(risky_weight*100,1)}% allocation to Small & Mid Caps. "
                           f"This is aggressive but acceptable for a 7+ year horizon.",
            "category": "risk",
        })

    # ── 4. No Debt / Stability Component ──
    has_debt = any(f.get("category") in ["Debt", "Hybrid"] for f in portfolio)
    if not has_debt and len(portfolio) >= 3:
        insights.append({
            "severity": "info",
            "title": "No Stability Component",
            "description": "Your portfolio has no Debt or Hybrid funds. Adding one (10-20% allocation) "
                           "can reduce drawdowns during crashes while only marginally impacting long-term returns.",
            "category": "allocation",
        })

    # ── 5. Risk-Return Mismatch ──
    if risk_data and performance_data:
        risk_score = risk_data.get("risk_score", 5)
        sharpe = risk_data.get("sharpe_ratio", 0)

        if risk_score > 6 and sharpe < 0.5:
            insights.append({
                "severity": "warning",
                "title": "Poor Risk-Adjusted Returns",
                "description": f"Your portfolio has a high risk score ({risk_score}/10) "
                               f"but a low Sharpe ratio ({sharpe}). You're taking on significant risk "
                               f"without proportional returns. Consider rebalancing toward better-performing funds.",
                "category": "performance",
            })

        if risk_score < 3 and sharpe > 1.5:
            insights.append({
                "severity": "info",
                "title": "Excellent Risk-Adjusted Returns",
                "description": f"Your portfolio achieves a Sharpe ratio of {sharpe} with low risk ({risk_score}/10). "
                               f"This is an efficient allocation — well done!",
                "category": "performance",
            })

    # ── 6. Underperforming Funds ──
    if performance_data:
        for perf in performance_data:
            cagr = perf.get("cagr", 0)
            if cagr < 5 and perf.get("period_years", 0) >= 3:
                insights.append({
                    "severity": "warning",
                    "title": f"Underperforming Fund",
                    "description": f"Fund {perf.get('scheme_code', '')} has a {cagr}% CAGR over "
                                   f"{perf.get('period_years', 0)} years. This is below the risk-free rate. "
                                   f"Consider switching to a better-performing fund in the same category.",
                    "category": "performance",
                })

    # ── 7. Rebalancing Suggestion ──
    if len(portfolio) >= 3:
        weights = [f.get("weight", 0) for f in portfolio]
        max_w = max(weights)
        min_w = min(weights)
        if max_w - min_w > 0.3:
            insights.append({
                "severity": "info",
                "title": "Portfolio Drift Detected",
                "description": "Your fund weights have drifted significantly from equal allocation. "
                               "Consider annual rebalancing to maintain your target asset mix.",
                "category": "allocation",
            })

    # ── 8. SIP Power Tip ──
    if len(insights) < 3:
        insights.append({
            "severity": "tip",
            "title": "SIP Step-Up Strategy",
            "description": "Increasing your SIP by 10% annually can boost your corpus by 40-60% over 10 years "
                           "compared to a flat SIP, thanks to compounding on larger contributions.",
            "category": "general",
        })

    return insights
