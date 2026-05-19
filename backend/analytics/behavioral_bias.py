"""
Behavioral Bias Analyzer — Disposition Effect, Overtrading, Recency Bias.

Quantifies the monetary cost of each behavioral bias vs a passive buy-and-hold strategy,
turning transaction history into a personal financial therapy report.
"""
import pandas as pd
import numpy as np
from typing import List, Dict, Optional


def _get_nav_on_date(nav_df: pd.DataFrame, target_date: pd.Timestamp) -> Optional[float]:
    """Closest NAV on or before target_date."""
    slice_ = nav_df[nav_df["date"] <= target_date]
    if slice_.empty:
        return None
    return float(slice_.iloc[-1]["nav"])


def _get_nav_after_date(nav_df: pd.DataFrame, target_date: pd.Timestamp, months: int) -> Optional[float]:
    """NAV approximately `months` months after target_date; falls back to latest if no future data."""
    future_date = target_date + pd.DateOffset(months=months)
    slice_ = nav_df[nav_df["date"] >= future_date]
    if slice_.empty:
        return float(nav_df.iloc[-1]["nav"]) if not nav_df.empty else None
    return float(slice_.iloc[0]["nav"])


# ── Disposition Effect ────────────────────────────────────────────────────────

def analyze_disposition_effect(nav_df: pd.DataFrame, transactions: List[Dict], fund_name: str) -> Dict:
    """
    Disposition Effect: investors sell winners too early and hold losers too long.

    For each SELL transaction:
    1. Compare sell NAV vs average buy NAV (gain or loss?)
    2. Check NAV 6 months after sell — did the fund keep rising after we sold?
    3. For current holdings in loss: flag if held > 6 months underwater.

    Disposition Ratio = PGR - PLR  (Proportion of Gains Realized minus Proportion of Losses Realized)
    Positive ratio = classic disposition effect (selling more winners than losers).
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    txns = sorted(transactions, key=lambda x: x["date"])

    units_held = 0.0
    total_buy_cost = 0.0
    avg_buy_nav = 0.0
    sells_analysis = []
    total_winner_missed = 0.0

    for txn in txns:
        txn_date = pd.to_datetime(txn["date"])
        amount = float(txn["amount"])
        txn_type = txn.get("type", "buy").lower()

        nav_at_txn = _get_nav_on_date(df, txn_date)
        if nav_at_txn is None:
            continue

        if txn_type in ("buy", "sip"):
            units = amount / nav_at_txn
            units_held += units
            total_buy_cost += amount
            avg_buy_nav = total_buy_cost / units_held if units_held > 0 else nav_at_txn

        elif txn_type == "sell":
            is_gain = nav_at_txn > avg_buy_nav if avg_buy_nav > 0 else False
            gain_pct = (nav_at_txn / avg_buy_nav - 1) * 100 if avg_buy_nav > 0 else 0

            nav_6m = _get_nav_after_date(df, txn_date, 6)
            nav_12m = _get_nav_after_date(df, txn_date, 12)

            missed_gain = 0.0
            pct_after_6m = None
            if nav_6m:
                pct_after_6m = (nav_6m / nav_at_txn - 1) * 100
                if is_gain and pct_after_6m > 0:
                    missed_gain = (pct_after_6m / 100) * amount
                    total_winner_missed += missed_gain

            sells_analysis.append({
                "date": txn_date.strftime("%Y-%m-%d"),
                "amount": round(amount, 2),
                "nav_at_sell": round(nav_at_txn, 4),
                "avg_buy_nav": round(avg_buy_nav, 4),
                "was_gain": is_gain,
                "gain_pct": round(gain_pct, 2),
                "nav_6m_after": round(nav_6m, 4) if nav_6m else None,
                "nav_12m_after": round(nav_12m, 4) if nav_12m else None,
                "pct_change_after_6m": round(pct_after_6m, 2) if pct_after_6m is not None else None,
                "missed_gain": round(missed_gain, 2),
            })

            units_sold = min(amount / nav_at_txn, units_held)
            # Reduce total_buy_cost proportionally so avg_buy_nav stays correct
            if units_held > 0:
                total_buy_cost *= max(0.0, (units_held - units_sold) / units_held)
            units_held = max(0.0, units_held - units_sold)

    # Current holding — holding a loser?
    holding_loser = False
    holding_loser_months = 0
    holding_loss_amount = 0.0

    if units_held > 0 and avg_buy_nav > 0:
        current_nav = float(df.iloc[-1]["nav"])
        if current_nav < avg_buy_nav:
            buy_txns = [t for t in txns if t.get("type", "buy").lower() in ("buy", "sip")]
            if buy_txns:
                first_buy_date = pd.to_datetime(sorted(buy_txns, key=lambda x: x["date"])[0]["date"])
                days_held = (df.iloc[-1]["date"] - first_buy_date).days
                holding_loser_months = days_held // 30
                holding_loser = holding_loser_months >= 6
                loss_pct = abs((current_nav - avg_buy_nav) / avg_buy_nav)
                holding_loss_amount = loss_pct * units_held * avg_buy_nav

    gains_realized = len([s for s in sells_analysis if s["was_gain"]])
    losses_realized = len([s for s in sells_analysis if not s["was_gain"]])
    total_sells = len(sells_analysis)

    pgr = gains_realized / total_sells if total_sells > 0 else 0.0
    plr = losses_realized / total_sells if total_sells > 0 else 0.0
    disposition_ratio = pgr - plr

    total_cost = total_winner_missed + holding_loss_amount
    has_bias = total_winner_missed > 1000 or holding_loser

    sold_winners_early = [s for s in sells_analysis if s["was_gain"] and (s.get("pct_change_after_6m") or 0) > 0]
    short_name = fund_name.split(" - ")[0]

    narrative_parts = []
    if sold_winners_early and total_winner_missed > 0:
        best = max(sold_winners_early, key=lambda x: x.get("missed_gain", 0))
        narrative_parts.append(
            f"Selling winners early in {short_name} cost ₹{total_winner_missed:,.0f} in missed gains — "
            f"the fund rose {best.get('pct_change_after_6m', 0):.1f}% in the 6 months after you sold on {best['date']}."
        )
    if holding_loser:
        narrative_parts.append(
            f"You've held {short_name} at a loss for {holding_loser_months} months "
            f"(unrealised loss: ₹{holding_loss_amount:,.0f}). "
            f"Classic disposition effect — anchoring to the buy price instead of evaluating the fund on its merits."
        )
    if disposition_ratio > 0.1:
        narrative_parts.append(
            f"Disposition ratio {disposition_ratio:+.2f}: "
            f"you're {disposition_ratio * 100:.0f}% more likely to realise gains than losses."
        )
    if not narrative_parts:
        narrative_parts.append(f"No significant disposition effect detected in {short_name}.")

    return {
        "bias_name": "Disposition Effect",
        "detected": has_bias,
        "severity": "High" if total_cost > 50000 else "Medium" if total_cost > 10000 else "Low",
        "cost_inr": round(total_cost, 2),
        "winner_missed_inr": round(total_winner_missed, 2),
        "holding_loser_inr": round(holding_loss_amount, 2),
        "disposition_ratio": round(disposition_ratio, 3),
        "pgr": round(pgr, 3),
        "plr": round(plr, 3),
        "sells_analysis": sells_analysis,
        "holding_loser": holding_loser,
        "holding_loser_months": holding_loser_months,
        "sold_winners_early_count": len(sold_winners_early),
        "narrative": " ".join(narrative_parts),
    }


# ── Overtrading ───────────────────────────────────────────────────────────────

def analyze_overtrading(transactions: List[Dict], fund_name: str) -> Dict:
    """
    Overtrading: excessive buy-sell activity that erodes returns via
    exit loads, short-term capital gains tax, and missed compounding.

    Threshold: > 4 non-SIP buy-sell round trips/year = overtrading.
    """
    if not transactions:
        return {
            "bias_name": "Overtrading",
            "detected": False,
            "cost_inr": 0,
            "narrative": "No transactions to analyse.",
        }

    txns = sorted(transactions, key=lambda x: x["date"])
    first_date = pd.to_datetime(txns[0]["date"])
    last_date = pd.to_datetime(txns[-1]["date"])
    years = max((last_date - first_date).days / 365.25, 0.1)

    buys = [t for t in txns if t.get("type", "buy").lower() in ("buy", "sip")]
    sells = [t for t in txns if t.get("type", "buy").lower() == "sell"]
    non_sip_buys = [t for t in txns if t.get("type", "buy").lower() == "buy"]

    sells_per_year = len(sells) / years
    non_sip_per_year = len(non_sip_buys) / years

    is_overtrading = non_sip_per_year > 4 or sells_per_year > 3

    sell_volume = sum(float(t["amount"]) for t in sells) if sells else 0
    buy_volume = sum(float(t["amount"]) for t in buys) if buys else 0

    # Exit load: 1% within 1 year (estimate 50% of sells trigger it)
    exit_load_cost = sell_volume * 0.005
    # Short-term CG tax drag: 20% on short-term gains (assume 10% avg gain, 50% short-term)
    stcg_cost = sell_volume * 0.10 * 0.20 * 0.5
    # Opportunity cost of churning (2% performance drag from mistimed trades)
    opportunity_cost = len(sells) * 0.02 * (sell_volume / max(len(sells), 1))

    total_cost = exit_load_cost + stcg_cost + opportunity_cost

    short_name = fund_name.split(" - ")[0]

    if is_overtrading:
        narrative = (
            f"You made {len(sells)} sell transactions in {short_name} over {years:.1f} years "
            f"({sells_per_year:.1f}/year). "
            f"Estimated friction costs: ₹{exit_load_cost:,.0f} exit loads + "
            f"₹{stcg_cost:,.0f} STCG tax + ₹{opportunity_cost:,.0f} timing drag = ₹{total_cost:,.0f} total. "
            f"A disciplined buy-and-hold investor would keep these costs at zero."
        )
    else:
        narrative = (
            f"Trading frequency in {short_name} is reasonable "
            f"({sells_per_year:.1f} sell/year over {years:.1f} years) — no overtrading detected."
        )

    return {
        "bias_name": "Overtrading",
        "detected": is_overtrading,
        "severity": "High" if sells_per_year > 6 else "Medium" if sells_per_year > 3 else "Low",
        "cost_inr": round(total_cost, 2),
        "exit_load_cost": round(exit_load_cost, 2),
        "stcg_cost": round(stcg_cost, 2),
        "opportunity_cost": round(opportunity_cost, 2),
        "total_transactions": len(txns),
        "sell_count": len(sells),
        "buy_count": len(buys),
        "sells_per_year": round(sells_per_year, 2),
        "holding_years": round(years, 1),
        "narrative": narrative,
    }


# ── Recency Bias ──────────────────────────────────────────────────────────────

def analyze_recency_bias(nav_df: pd.DataFrame, transactions: List[Dict], fund_name: str) -> Dict:
    """
    Recency Bias: buying after recent rallies (FOMO) and panic-selling after crashes.

    For each BUY: if 3-month prior return >= 75th percentile → FOMO buy.
    For each SELL: if 3-month prior return <= 25th percentile → panic sell.

    Cost of FOMO: how much did the fund underperform in the 3 months after?
    Cost of panic sell: how much did the fund recover in the 6 months after?
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    if len(df) < 60:
        short_name = fund_name.split(" - ")[0]
        return {
            "bias_name": "Recency Bias",
            "detected": False,
            "cost_inr": 0,
            "rally_buys": [],
            "panic_sells": [],
            "narrative": f"Insufficient NAV history for recency bias analysis in {short_name}.",
        }

    # Compute 3-month rolling return for each row
    roll_3m = []
    for i in range(len(df)):
        d = df.iloc[i]["date"]
        lb = d - pd.DateOffset(months=3)
        s = df[df["date"] >= lb]
        if len(s) < 2:
            roll_3m.append(None)
            continue
        r = (float(df.iloc[i]["nav"]) / float(s.iloc[0]["nav"]) - 1) * 100
        roll_3m.append(r)
    df["roll_3m"] = roll_3m

    valid = [r for r in roll_3m if r is not None]
    p75 = float(np.percentile(valid, 75))
    p25 = float(np.percentile(valid, 25))

    rally_buys, panic_sells = [], []
    fomo_cost = 0.0
    panic_cost = 0.0

    for txn in transactions:
        txn_date = pd.to_datetime(txn["date"])
        txn_type = txn.get("type", "buy").lower()
        amount = float(txn["amount"])

        row_slice = df[df["date"] <= txn_date]
        if row_slice.empty:
            continue
        row = row_slice.iloc[-1]
        ret_3m = row.get("roll_3m")
        if ret_3m is None:
            continue

        nav_at_txn = float(row["nav"])

        if txn_type == "buy" and ret_3m >= p75:
            nav_3m_after = _get_nav_after_date(df, txn_date, 3)
            drag = 0.0
            pct_after = None
            if nav_3m_after:
                pct_after = (nav_3m_after / nav_at_txn - 1) * 100
                drag = max(0, -pct_after / 100) * amount
                fomo_cost += drag

            rally_buys.append({
                "date": txn_date.strftime("%Y-%m-%d"),
                "amount": round(amount, 2),
                "prior_3m_return": round(ret_3m, 2),
                "p75_threshold": round(p75, 2),
                "pct_3m_after": round(pct_after, 2) if pct_after is not None else None,
                "drag_cost": round(drag, 2),
            })

        elif txn_type == "sell" and ret_3m <= p25:
            nav_6m_after = _get_nav_after_date(df, txn_date, 6)
            recovery = 0.0
            pct_recovery = None
            if nav_6m_after:
                pct_recovery = (nav_6m_after / nav_at_txn - 1) * 100
                recovery = max(0, pct_recovery / 100) * amount
                panic_cost += recovery

            panic_sells.append({
                "date": txn_date.strftime("%Y-%m-%d"),
                "amount": round(amount, 2),
                "prior_3m_return": round(ret_3m, 2),
                "p25_threshold": round(p25, 2),
                "pct_6m_recovery": round(pct_recovery, 2) if pct_recovery is not None else None,
                "missed_recovery": round(recovery, 2),
            })

    total_cost = fomo_cost + panic_cost
    detected = bool(rally_buys or panic_sells)
    short_name = fund_name.split(" - ")[0]

    parts = []
    if rally_buys:
        parts.append(
            f"FOMO detected: {len(rally_buys)} buy(s) in {short_name} came after top-quartile rallies. "
            f"Buying high after momentum typically leads to below-average returns. "
            f"Estimated FOMO drag: ₹{fomo_cost:,.0f}."
        )
    if panic_sells:
        parts.append(
            f"Panic selling detected: {len(panic_sells)} sell(s) came after bottom-quartile crashes. "
            f"The fund recovered in the months after — missing ₹{panic_cost:,.0f} in recovery gains."
        )
    if not parts:
        parts.append(
            f"No recency bias detected in {short_name} — "
            f"your transaction timing was not driven by recent market momentum."
        )

    return {
        "bias_name": "Recency Bias",
        "detected": detected,
        "severity": "High" if total_cost > 30000 else "Medium" if total_cost > 5000 else "Low",
        "cost_inr": round(total_cost, 2),
        "fomo_cost": round(fomo_cost, 2),
        "panic_sell_cost": round(panic_cost, 2),
        "rally_buys": rally_buys,
        "panic_sells": panic_sells,
        "p75_rally_threshold": round(p75, 2),
        "p25_crash_threshold": round(p25, 2),
        "narrative": " ".join(parts),
    }


# ── Passive Hold Comparison ────────────────────────────────────────────────────

def passive_hold_comparison(nav_df: pd.DataFrame, transactions: List[Dict]) -> Dict:
    """
    Compare actual behaviour vs passive buy-and-hold from first purchase date.
    Passive strategy: invest total capital at the first NAV and hold to today.
    """
    df = nav_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    buys = sorted(
        [t for t in transactions if t.get("type", "buy").lower() in ("buy", "sip")],
        key=lambda x: x["date"],
    )
    if not buys:
        return {}

    total_invested = sum(float(t["amount"]) for t in buys)
    first_date = pd.to_datetime(buys[0]["date"])

    first_nav = _get_nav_on_date(df, first_date)
    if not first_nav or first_nav <= 0:
        return {}

    current_nav = float(df.iloc[-1]["nav"])
    passive_units = total_invested / first_nav
    passive_value = passive_units * current_nav

    years = max((df.iloc[-1]["date"] - first_date).days / 365.25, 0.01)
    passive_cagr = ((passive_value / total_invested) ** (1 / years) - 1) * 100

    return {
        "total_invested": round(total_invested, 2),
        "passive_current_value": round(passive_value, 2),
        "passive_cagr": round(passive_cagr, 2),
        "passive_return_pct": round((passive_value - total_invested) / total_invested * 100, 2),
        "first_purchase_date": first_date.strftime("%Y-%m-%d"),
        "years_held": round(years, 1),
    }


# ── Main Entry Point ─────────────────────────────────────────────────────────

def analyze_behavioral_biases(
    nav_df: pd.DataFrame,
    transactions: List[Dict],
    fund_name: str,
) -> Dict:
    """Analyse all behavioural biases for a single fund."""
    if not transactions:
        return {
            "fund_name": fund_name,
            "has_transactions": False,
            "biases": [],
            "total_bias_cost": 0,
            "detected_count": 0,
            "passive_comparison": {},
            "summary_narrative": (
                "No transaction history found. Add actual buy/sell transactions "
                "in Portfolio Builder to enable behavioral bias analysis."
            ),
        }

    disposition = analyze_disposition_effect(nav_df, transactions, fund_name)
    overtrading = analyze_overtrading(transactions, fund_name)
    recency = analyze_recency_bias(nav_df, transactions, fund_name)
    passive = passive_hold_comparison(nav_df, transactions)

    biases = [disposition, overtrading, recency]
    total_cost = sum(b.get("cost_inr", 0) for b in biases)
    detected = [b for b in biases if b.get("detected")]

    short_name = fund_name.split(" - ")[0]

    if not detected:
        summary = (
            f"Excellent! No significant behavioural biases detected in {short_name}. "
            f"Your transaction discipline is above average."
        )
    else:
        bias_list = ", ".join(b["bias_name"] for b in detected)
        passive_note = ""
        if passive.get("passive_current_value"):
            passive_note = (
                f" A passive buy-and-hold from {passive['first_purchase_date']} "
                f"would now be worth ₹{passive['passive_current_value']:,.0f} "
                f"({passive['passive_return_pct']:+.1f}%, CAGR {passive['passive_cagr']:.1f}%)."
            )
        summary = (
            f"Behavioural biases detected in {short_name}: {bias_list}. "
            f"Total estimated cost: ₹{total_cost:,.0f}.{passive_note}"
        )

    return {
        "fund_name": fund_name,
        "has_transactions": True,
        "biases": biases,
        "total_bias_cost": round(total_cost, 2),
        "detected_count": len(detected),
        "passive_comparison": passive,
        "summary_narrative": summary,
    }
