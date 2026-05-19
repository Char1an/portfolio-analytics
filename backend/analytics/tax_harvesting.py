"""
Tax Loss Harvesting Engine — Budget 2024 Indian MF rules.

Identifies loss positions in a portfolio and shows how harvesting them
offsets existing gains to reduce tax liability.

Rules applied:
  STCG (held < 1 year): 20% + 4% cess
  LTCG (held ≥ 1 year): 12.5% + 4% cess, with ₹1.25L annual exemption
  STCG losses offset STCG gains first, then LTCG gains
  LTCG losses offset only LTCG gains
  Wash-sale: re-buying the same fund within 30 days negates the tax benefit
"""
from datetime import date, datetime
from typing import List, Dict, Optional


STCG_RATE = 0.20
LTCG_RATE = 0.125
CESS      = 0.04
LTCG_EXEMPTION = 125_000   # ₹1.25 lakh (Budget 2024)


def _holding_years(purchase_date_str: Optional[str]) -> Optional[float]:
    if not purchase_date_str:
        return None
    try:
        pd = datetime.strptime(purchase_date_str, "%Y-%m-%d").date()
        return (date.today() - pd).days / 365.25
    except Exception:
        return None


def _tax(gain: float, is_ltcg: bool, ltcg_exempt_used: float) -> tuple:
    """Return (tax_amount, ltcg_exempt_used_after)."""
    if gain <= 0:
        return 0.0, ltcg_exempt_used
    if not is_ltcg:
        return round(gain * STCG_RATE * (1 + CESS), 2), ltcg_exempt_used
    remaining_exempt = max(0.0, LTCG_EXEMPTION - ltcg_exempt_used)
    taxable = max(0.0, gain - remaining_exempt)
    used    = min(gain, remaining_exempt)
    return round(taxable * LTCG_RATE * (1 + CESS), 2), ltcg_exempt_used + used


def compute_tax_harvest(funds_data: List[Dict]) -> Dict:
    """
    Main entry point.

    funds_data: list of {
        scheme_code, name,
        total_invested, current_value,
        purchase_date (optional),
        category (optional)
    }
    """
    loss_positions = []
    gain_positions = []

    total_stcg_gain = 0.0
    total_ltcg_gain = 0.0
    total_stcg_loss = 0.0
    total_ltcg_loss = 0.0

    for f in funds_data:
        invested = f.get("total_invested") or f.get("investment_amount", 0)
        current  = f.get("current_value", 0)
        if not invested or not current:
            continue

        pnl  = current - invested
        yrs  = _holding_years(f.get("purchase_date"))
        is_lt = (yrs is None) or (yrs >= 1)   # unknown date → assume LTCG (conservative)
        regime_label = "LTCG" if is_lt else "STCG"
        name = (f.get("name") or f.get("scheme_code", "")).replace(
            r" - Direct Growth", ""
        ).replace(" - Direct Plan", "").strip()

        entry = {
            "scheme_code":  f.get("scheme_code", ""),
            "name":         name,
            "invested":     round(invested, 2),
            "current":      round(current, 2),
            "pnl":          round(pnl, 2),
            "regime":       regime_label,
            "holding_years": round(yrs, 2) if yrs is not None else None,
            "purchase_date": f.get("purchase_date"),
        }

        if pnl < 0:
            loss_positions.append(entry)
            if is_lt:
                total_ltcg_loss += abs(pnl)
            else:
                total_stcg_loss += abs(pnl)
        else:
            gain_positions.append(entry)
            if is_lt:
                total_ltcg_gain += pnl
            else:
                total_stcg_gain += pnl

    # ── Tax BEFORE harvesting ──────────────────────────────────────────────
    ltcg_exempt_used = 0.0
    stcg_tax_before  = 0.0
    ltcg_tax_before  = 0.0

    for gp in gain_positions:
        if gp["regime"] == "STCG":
            stcg_tax_before += gp["pnl"] * STCG_RATE * (1 + CESS)
        else:
            t, ltcg_exempt_used = _tax(gp["pnl"], True, ltcg_exempt_used)
            ltcg_tax_before += t

    tax_before = round(stcg_tax_before + ltcg_tax_before, 2)

    # ── Offset gains with losses ───────────────────────────────────────────
    # STCG loss offsets STCG gain first, then LTCG gain
    # LTCG loss offsets LTCG gain only
    net_stcg_gain = max(0.0, total_stcg_gain - total_stcg_loss)
    excess_stcg_loss = max(0.0, total_stcg_loss - total_stcg_gain)
    net_ltcg_gain = max(0.0, total_ltcg_gain - total_ltcg_loss - excess_stcg_loss)

    # ── Tax AFTER harvesting ───────────────────────────────────────────────
    # Use the same LTCG_EXEMPTION pool (not reset) — a taxpayer gets one ₹1.25L
    # exemption per year across all funds, whether or not they harvest.
    stcg_tax_after    = net_stcg_gain * STCG_RATE * (1 + CESS)
    ltcg_tax_after, _ = _tax(net_ltcg_gain, True, 0.0)
    tax_after = round(stcg_tax_after + ltcg_tax_after, 2)

    tax_saved = max(0.0, tax_before - tax_after)

    # ── Per-fund harvest recommendations ──────────────────────────────────
    recommended = []
    remaining_stcg_gain = total_stcg_gain
    remaining_ltcg_gain = total_ltcg_gain
    for lp in sorted(loss_positions, key=lambda x: x["pnl"]):   # biggest loss first
        loss_abs = abs(lp["pnl"])
        saved = 0.0
        if lp["regime"] == "STCG":
            # STCG loss offsets STCG gain first, then LTCG gain
            offset_stcg = min(loss_abs, remaining_stcg_gain)
            offset_ltcg = min(loss_abs - offset_stcg, remaining_ltcg_gain)
            saved = round(offset_stcg * STCG_RATE * (1 + CESS)
                          + offset_ltcg * STCG_RATE * (1 + CESS), 2)
            remaining_stcg_gain -= offset_stcg
            remaining_ltcg_gain -= offset_ltcg
        else:
            # LTCG loss offsets only LTCG gain
            offset = min(loss_abs, remaining_ltcg_gain)
            saved = round(offset * LTCG_RATE * (1 + CESS), 2)
            remaining_ltcg_gain -= offset
        recommended.append({
            **lp,
            "action": "Sell to harvest loss",
            "estimated_tax_saved": saved,
        })

    # ── Summary ───────────────────────────────────────────────────────────
    savings_pct = round((tax_saved / tax_before * 100) if tax_before > 0 else 0, 1)

    return {
        "loss_positions":  loss_positions,
        "gain_positions":  gain_positions,
        "harvest_plan": {
            "recommended_harvests":    recommended,
            "total_harvestable_loss":  round(total_stcg_loss + total_ltcg_loss, 2),
            "total_tax_saved":         round(tax_saved, 2),
            "net_gain_after_harvest":  round(net_stcg_gain + net_ltcg_gain, 2),
            "wash_sale_warning":       (
                "Wait at least 30 days before re-buying the same fund. "
                "To stay invested, immediately switch to a similar (but not identical) fund "
                "— e.g., replace one Nifty 50 index fund with another AMC's Nifty 50 fund."
            ),
        },
        "summary": {
            "total_stcg_gain":        round(total_stcg_gain, 2),
            "total_ltcg_gain":        round(total_ltcg_gain, 2),
            "total_stcg_loss":        round(total_stcg_loss, 2),
            "total_ltcg_loss":        round(total_ltcg_loss, 2),
            "net_tax_before_harvest": tax_before,
            "net_tax_after_harvest":  tax_after,
            "tax_saved":              round(tax_saved, 2),
            "savings_pct":            savings_pct,
        },
    }
