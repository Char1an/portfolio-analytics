"""
Simplified Portfolio Metrics — work with composition alone, no transaction history required.

Metrics:
- Portfolio Churn / Turnover Rate
- Concentration Risk (category overlap)
- Tax Efficiency Score (based on holding periods)
- Category Timing (did you overweight high-growth categories at peaks?)
"""
import pandas as pd
from typing import List, Dict, Optional
from datetime import datetime, date


def calculate_churn_rate(funds_data: List[Dict]) -> Dict:
    """
    Portfolio Churn = estimated turnover rate based on fund ages.

    Insight: funds purchased in the last 6 months = likely to be traded soon.
    Rough estimate of portfolio trading activity.
    """
    if not funds_data:
        return {"churn_rate": 0, "narrative": "No funds in portfolio."}

    today = date.today()
    recent_count = 0

    for fund in funds_data:
        pd_str = fund.get("purchase_date")
        if not pd_str:
            continue
        try:
            pdate = datetime.strptime(pd_str, "%Y-%m-%d").date()
            days_held = (today - pdate).days
            # If held < 6 months, likely to trade soon
            if days_held < 180:
                recent_count += 1
        except (ValueError, TypeError):
            pass

    churn_rate = (recent_count / len(funds_data) * 100) if funds_data else 0

    if churn_rate >= 50:
        severity = "High"
        narrative = f"{churn_rate:.0f}% of your funds are <6 months old — potential for high turnover and STCG tax drag."
    elif churn_rate >= 25:
        severity = "Medium"
        narrative = f"{churn_rate:.0f}% of your funds are <6 months old — monitor for impulsive rebalancing."
    else:
        severity = "Low"
        narrative = "Portfolio age distribution is healthy — mostly long-held positions."

    return {
        "churn_rate": round(churn_rate, 1),
        "severity": severity,
        "narrative": narrative,
        "recent_funds": recent_count,
        "total_funds": len(funds_data),
    }


def calculate_concentration_risk(funds_data: List[Dict]) -> Dict:
    """
    Concentration Risk = overlap in fund categories.

    Alert if >2 funds in same category (lack of diversification).
    """
    if not funds_data or len(funds_data) < 2:
        return {
            "concentration_risk": "Low",
            "narrative": "Need ≥2 funds for diversification analysis.",
            "category_counts": {},
        }

    cat_map = {}
    for f in funds_data:
        cat = f.get("category") or "Unknown"
        cat_map[cat] = cat_map.get(cat, 0) + 1

    # Count overlaps
    overlapped_cats = {c: cnt for c, cnt in cat_map.items() if cnt > 1}
    overlap_count = sum(cnt - 1 for cnt in overlapped_cats.values())

    if overlap_count == 0:
        risk = "Low"
        narrative = "Good diversification — no category overlap detected."
    elif overlap_count == 1:
        risk = "Medium"
        narrative = f"Minor overlap detected in {list(overlapped_cats.keys())[0]} ({list(overlapped_cats.values())[0]} funds). Consider consolidating."
    else:
        risk = "High"
        narrative = f"Significant overlap across {len(overlapped_cats)} categories. Consolidate to reduce redundancy and fees."

    return {
        "concentration_risk": risk,
        "narrative": narrative,
        "overlapped_categories": overlapped_cats,
        "overlap_count": overlap_count,
    }


def calculate_tax_efficiency_score(funds_data: List[Dict]) -> Dict:
    """
    Tax Efficiency = estimated STCG exposure based on holding periods.

    Funds <1 year old will trigger 20% STCG on gains; estimate exposure.
    """
    if not funds_data:
        return {
            "tax_efficiency_score": 0,
            "narrative": "No funds to analyze.",
            "ltcg_funds": 0,
            "stcg_risk_funds": 0,
        }

    today = date.today()
    ltcg_count = 0
    stcg_risk_count = 0
    total_invested = 0
    stcg_risk_invested = 0

    for fund in funds_data:
        pd_str = fund.get("purchase_date")
        invested = fund.get("investment_amount", 0) or 0
        total_invested += invested

        if not pd_str:
            # Unknown date = assume STCG risk
            stcg_risk_count += 1
            stcg_risk_invested += invested
            continue

        try:
            pdate = datetime.strptime(pd_str, "%Y-%m-%d").date()
            days_held = (today - pdate).days
            if days_held >= 365:
                ltcg_count += 1
            else:
                stcg_risk_count += 1
                stcg_risk_invested += invested
        except (ValueError, TypeError):
            stcg_risk_count += 1
            stcg_risk_invested += invested

    # Score: 100 = all LTCG-eligible, 0 = all STCG
    tax_score = (ltcg_count / len(funds_data) * 100) if funds_data else 0

    # Estimate tax impact if portfolio gains 10%
    estimated_stcg_tax = 0
    if stcg_risk_invested > 0:
        # 20% STCG + 4% cess = 20.8% on 10% gain
        estimated_stcg_tax = round(stcg_risk_invested * 0.10 * 0.208, 0)

    if tax_score >= 80:
        severity = "Good"
        narrative = f"{ltcg_count}/{len(funds_data)} funds are LTCG-eligible. Tax-efficient portfolio structure."
    elif tax_score >= 50:
        severity = "Fair"
        narrative = f"{stcg_risk_count} funds at STCG risk (held <1 year). If gains 10%, ~₹{estimated_stcg_tax:,.0f} in extra STCG tax."
    else:
        severity = "Poor"
        narrative = f"High STCG exposure ({stcg_risk_count} funds). Rebalancing soon will trigger heavy short-term tax. Consider holding longer or tax-loss harvesting."

    return {
        "tax_efficiency_score": round(tax_score, 1),
        "severity": severity,
        "narrative": narrative,
        "ltcg_eligible_funds": ltcg_count,
        "stcg_risk_funds": stcg_risk_count,
        "estimated_extra_stcg_tax_on_10pct_gain": estimated_stcg_tax,
    }


def compute_simplified_biases(funds_data: List[Dict]) -> Dict:
    """
    Aggregated view of all simplified metrics.
    """
    churn = calculate_churn_rate(funds_data)
    concentration = calculate_concentration_risk(funds_data)
    tax_eff = calculate_tax_efficiency_score(funds_data)

    return {
        "churn": churn,
        "concentration": concentration,
        "tax_efficiency": tax_eff,
    }
