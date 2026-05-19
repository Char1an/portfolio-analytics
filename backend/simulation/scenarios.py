"""
Scenario Simulator — Applies predefined market scenarios to portfolio NAV.

Scenarios are deterministic transformations that model how different
market conditions would affect fund NAVs based on category-specific betas.
"""
import numpy as np
import pandas as pd
from typing import Dict, List


# ── Predefined Scenarios ──────────────────────────────────────────
SCENARIOS = {
    "mild_crash": {
        "name": "Mild Market Crash",
        "description": "A correction of 20% over 6 months, followed by slow recovery",
        "nifty_change_pct": -20,
        "duration_months": 6,
        "recovery_months": 12,
        "volatility_multiplier": 1.5,
    },
    "severe_crash": {
        "name": "Severe Market Crash (2008-like)",
        "description": "A 40% crash over 12 months, similar to the 2008 financial crisis",
        "nifty_change_pct": -40,
        "duration_months": 12,
        "recovery_months": 30,
        "volatility_multiplier": 2.5,
    },
    "bull_run": {
        "name": "Bull Market Rally",
        "description": "Strong 30% growth over 12 months driven by economic expansion",
        "nifty_change_pct": 30,
        "duration_months": 12,
        "recovery_months": 0,
        "volatility_multiplier": 0.8,
    },
    "high_volatility": {
        "name": "High Volatility Sideways",
        "description": "Market stays flat but with ±15% wild swings every few months",
        "nifty_change_pct": 0,
        "duration_months": 12,
        "recovery_months": 0,
        "volatility_multiplier": 3.0,
    },
    "flat_market": {
        "name": "Flat / Range-Bound Market",
        "description": "Market moves sideways within a ±5% range for 12 months",
        "nifty_change_pct": 2,
        "duration_months": 12,
        "recovery_months": 0,
        "volatility_multiplier": 0.5,
    },
    "covid_crash": {
        "name": "COVID-19 Style Crash",
        "description": "Sharp 35% crash in 2 months, followed by V-shaped recovery in 6 months",
        "nifty_change_pct": -35,
        "duration_months": 2,
        "recovery_months": 6,
        "volatility_multiplier": 3.0,
    },
    "ilfs_crisis": {
        "name": "IL&FS Crisis (2018)",
        "description": "India-specific: IL&FS default triggered NBFC sector freeze, mid/small caps fell 25–40%, credit markets seized",
        "nifty_change_pct": -15,
        "duration_months": 6,
        "recovery_months": 18,
        "volatility_multiplier": 2.2,
    },
    "franklin_freeze": {
        "name": "Franklin Templeton Freeze (2020)",
        "description": "India-specific: Franklin wound up 6 debt funds overnight, causing panic redemptions across debt MFs",
        "nifty_change_pct": -5,
        "duration_months": 2,
        "recovery_months": 12,
        "volatility_multiplier": 1.8,
    },
    "yes_bank_collapse": {
        "name": "Yes Bank Collapse (2020)",
        "description": "India-specific: Yes Bank placed under moratorium, banking sector panic; Nifty Bank fell 15% in days",
        "nifty_change_pct": -12,
        "duration_months": 1,
        "recovery_months": 8,
        "volatility_multiplier": 2.5,
    },
    "post_covid_bull": {
        "name": "Post-COVID India Bull Run (2020–2021)",
        "description": "India-specific: Nifty surged 100%+ from April 2020 lows; mid/small caps doubled as retail participation exploded",
        "nifty_change_pct": 60,
        "duration_months": 18,
        "recovery_months": 0,
        "volatility_multiplier": 1.2,
    },
}

# ── Category-specific betas (how much each category moves relative to Nifty) ──
CATEGORY_BETAS = {
    "Large Cap": 1.0,
    "Index": 1.0,
    "Large & Mid Cap": 1.15,
    "Mid Cap": 1.3,
    "Flexi Cap": 0.9,
    "Small Cap": 1.5,
    "ELSS": 1.1,
    "Hybrid": 0.65,
    "Debt": 0.1,
}


def get_available_scenarios() -> List[Dict]:
    """Return list of all predefined scenarios."""
    return [
        {"id": k, **{key: v[key] for key in ["name", "description", "nifty_change_pct", "duration_months"]}}
        for k, v in SCENARIOS.items()
    ]


def simulate_scenario(
    current_nav: float,
    scenario_id: str,
    category: str = "Large Cap",
    monthly_sip: float = 0,
    investment_months: int = None,
    lumpsum_amount: float = 10000,
) -> Dict:
    """
    Simulate a market scenario on a single fund.

    Args:
        current_nav: Current NAV of the fund
        scenario_id: Key from SCENARIOS dict
        category: Fund category (determines beta)
        monthly_sip: Monthly SIP amount (0 for lumpsum only)
        investment_months: Total months to simulate (default: scenario duration + recovery)

    Returns:
        Monthly NAV path, portfolio value curve, impact metrics
    """
    if scenario_id not in SCENARIOS:
        return {"error": f"Unknown scenario: {scenario_id}"}

    scenario = SCENARIOS[scenario_id]
    beta = CATEGORY_BETAS.get(category, 1.0)

    crash_pct = scenario["nifty_change_pct"] * beta / 100
    crash_months = scenario["duration_months"]
    recovery_months = scenario["recovery_months"]
    vol_mult = scenario["volatility_multiplier"]

    if investment_months is None:
        investment_months = crash_months + recovery_months + 6  # extra 6 months post-recovery

    # ── Generate NAV path ──
    nav_path = [current_nav]
    phase_labels = []

    for month in range(1, investment_months + 1):
        if month <= crash_months:
            # Crash phase: linear decline with noise
            progress = month / crash_months
            base_change = crash_pct * progress
            noise = np.random.normal(0, abs(crash_pct) * 0.1 * vol_mult)
            nav = current_nav * (1 + base_change + noise)
            phase_labels.append("crash")
        elif month <= crash_months + recovery_months:
            # Recovery phase: ease-out recovery toward original.
            # Use nav_path[-1] (actual simulated bottom) instead of the theoretical
            # crash_bottom — avoids a discontinuous jump caused by crash-phase noise.
            recovery_progress = (month - crash_months) / max(recovery_months, 1)
            eased = 1 - (1 - recovery_progress) ** 1.5
            actual_bottom = nav_path[-1]          # actual end of crash, not theoretical
            nav = actual_bottom + (current_nav - actual_bottom) * eased
            noise = np.random.normal(0, current_nav * 0.01 * vol_mult * (1 - recovery_progress))
            nav += noise
            phase_labels.append("recovery")
        else:
            # Post-recovery: mild growth
            months_post = month - crash_months - recovery_months
            monthly_growth = 0.01  # ~12% annualized
            nav = nav_path[-1] * (1 + monthly_growth + np.random.normal(0, 0.005))
            phase_labels.append("growth")

        nav_path.append(max(nav, current_nav * 0.05))  # floor at 5% of original

    # ── Simulate portfolio with SIP ──
    units = 0
    total_invested = 0
    portfolio_curve = []

    for month in range(len(nav_path)):
        nav = nav_path[month]

        if month == 0:
            # Always invest lumpsum_amount at start (default ₹10,000 if not specified)
            if lumpsum_amount > 0:
                units = lumpsum_amount / nav
                total_invested = lumpsum_amount
            # For pure-SIP mode (lumpsum=0) show ₹0 invested at month 0 — first SIP at month 1
        elif monthly_sip > 0:
            units += monthly_sip / nav
            total_invested += monthly_sip

        value = units * nav
        portfolio_curve.append({
            "month": month,
            "nav": round(nav, 2),
            "invested": round(total_invested, 2),
            "value": round(value, 2),
            "phase": phase_labels[month - 1] if month > 0 else "start",
        })

    # ── Impact metrics ──
    min_nav = min(nav_path)
    max_drawdown = (current_nav - min_nav) / current_nav * 100
    final_nav = nav_path[-1]
    nav_change = (final_nav - current_nav) / current_nav * 100
    final_value = portfolio_curve[-1]["value"]
    total_inv = portfolio_curve[-1]["invested"]

    return {
        "scenario": scenario,
        "category": category,
        "beta": beta,
        "nav_path": [round(n, 2) for n in nav_path],
        "portfolio_curve": portfolio_curve,
        "metrics": {
            "start_nav": round(current_nav, 2),
            "min_nav": round(min_nav, 2),
            "final_nav": round(final_nav, 2),
            "max_drawdown_pct": round(max_drawdown, 2),
            "nav_change_pct": round(nav_change, 2),
            "total_invested": round(total_inv, 2),
            "final_value": round(final_value, 2),
            "return_pct": round((final_value - total_inv) / max(total_inv, 1) * 100, 2),
        },
    }
