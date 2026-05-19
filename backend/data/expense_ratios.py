"""
Expense Ratio (TER) Database — Static lookup for Indian mutual funds.

MFAPI does not return expense ratios in its NAV endpoints. Instead of asking
users to enter TER manually, we maintain a curated lookup keyed by scheme_code
with category-based fallbacks for unknown funds.

Values reflect Direct Growth plans (most common in this app) as of FY 2024-25.
Source: AMC fund factsheets / Value Research.

Note: TER changes annually — refresh this file each year.
"""

# Direct Growth TER (%) for funds in data/schemes.py
KNOWN_TERS_DIRECT = {
    # ── Large Cap ──
    "120586": 0.95,  # ICICI Prudential Bluechip
    "118989": 1.10,  # HDFC Top 100
    "118825": 0.55,  # Mirae Asset Large Cap
    "119827": 0.85,  # SBI Bluechip
    "118778": 0.85,  # Nippon India Large Cap
    "120465": 0.65,  # Axis Bluechip
    "148509": 0.70,  # Quant Large Cap
    "100270": 1.10,  # Franklin India Bluechip

    # ── Large & Mid Cap ──
    "147704": 0.65,  # Motilal Oswal Large and Midcap
    "120587": 0.55,  # Mirae Asset Emerging Bluechip
    "120847": 0.55,  # Canara Robeco Emerging Equities
    "119673": 1.10,  # UTI Large and Mid Cap

    # ── Multi Cap ──
    "118668": 1.05,  # Nippon India Multi Cap
    "120186": 0.85,  # ICICI Prudential Multicap (also ELSS)
    "135809": 0.85,  # SBI Magnum Multicap

    # ── Mid Cap ──
    "127042": 0.65,  # Motilal Oswal Midcap
    "119063": 0.85,  # HDFC Mid-Cap Opportunities
    "119779": 0.45,  # Kotak Emerging Equity
    "120468": 0.55,  # Axis Midcap
    "101206": 0.95,  # SBI Magnum Midcap
    "146897": 0.65,  # Quant Mid Cap
    "147622": 0.65,  # Mirae Asset Midcap
    "119820": 0.85,  # DSP Midcap
    "119597": 1.05,  # Franklin India Prima

    # ── Small Cap ──
    "125354": 0.55,  # Axis Small Cap
    "130503": 0.65,  # HDFC Small Cap
    "120828": 0.65,  # Quant Small Cap
    "125497": 0.65,  # Nippon India Small Cap
    "120822": 0.55,  # Kotak Small Cap
    "119818": 0.85,  # DSP Small Cap
    "148938": 0.30,  # Tata Small Cap

    # ── Flexi Cap ──
    "122639": 0.63,  # Parag Parikh Flexi Cap
    "118955": 0.75,  # HDFC Flexi Cap
    "119568": 0.85,  # SBI Flexicap
    "119552": 0.95,  # ICICI Prudential Focused Equity
    "120821": 0.55,  # Kotak Flexicap
    "120716": 0.95,  # Nippon India Flexi Cap
    "147946": 0.65,  # Quant Flexi Cap
    "120837": 0.85,  # UTI Flexi Cap

    # ── Value & Contra ──
    "120590": 1.05,  # ICICI Prudential Value Discovery
    "120516": 0.65,  # SBI Contra
    "119215": 0.55,  # Kotak India EQ Contra

    # ── International ──
    "145552": 0.55,  # Motilal Oswal Nasdaq 100 FOF
    "148381": 0.55,  # Motilal Oswal S&P 500 Index
    "148928": 0.30,  # Mirae Asset NYSE FANG+ ETF FOF
    "148063": 0.65,  # Edelweiss US Technology Equity FOF

    # ── Gold & Silver ──
    "119788": 0.10,  # SBI Gold Fund
    "118663": 0.15,  # Nippon India Gold Savings
    "119132": 0.20,  # HDFC Gold Fund
    "149760": 0.40,  # Nippon India Silver ETF FoF
    "149775": 0.45,  # ICICI Prudential Silver ETF FOF

    # ── ELSS ──
    "135781": 0.55,  # Mirae Asset ELSS Tax Saver
    "100468": 1.05,  # HDFC ELSS TaxSaver

    # ── Index / ETF FOF ──
    "118741": 0.20,  # Nippon India Nifty 50 Index (factor proxy)
    "150677": 0.30,  # SBI Nifty Smallcap 250 (factor proxy)
    "150673": 0.30,  # SBI Nifty Midcap 150 (factor proxy)
    "149934": 0.65,  # Motilal Oswal Midcap (different code variant)
}

# Category-based fallback when scheme_code is unknown.
# These are median Direct Growth TERs across the category as of 2024-25.
CATEGORY_TER_DEFAULTS = {
    "Large Cap":         0.85,
    "Large & Mid Cap":   0.75,
    "Multi Cap":         0.95,
    "Mid Cap":           0.75,
    "Small Cap":         0.65,
    "Flexi Cap":         0.75,
    "Focused":           0.85,
    "Value & Contra":    0.85,
    "ELSS":              0.85,
    "Index":             0.20,
    "Hybrid":            0.85,
    "Aggressive Hybrid": 0.95,
    "Debt":              0.40,
    "Liquid":            0.20,
    "International":     0.55,
    "Gold & Silver":     0.30,
    "Thematic":          1.10,
    "Sectoral":          1.10,
    "Unknown":           0.85,   # equity-fund average
}


def get_expense_ratio(scheme_code: str, name: str = None, category: str = None,
                      plan_type: str = "Direct") -> float:
    """
    Look up the expense ratio for a fund.

    Resolution order:
      1. Known scheme_code in KNOWN_TERS_DIRECT
      2. Category-based default
      3. 0.85% (equity average)

    For Regular plans, add a typical commission spread (~0.85%).
    """
    base_ter = None

    # 1. Direct lookup
    if scheme_code and scheme_code in KNOWN_TERS_DIRECT:
        base_ter = KNOWN_TERS_DIRECT[scheme_code]

    # 2. Category fallback
    elif category:
        base_ter = CATEGORY_TER_DEFAULTS.get(category)

    # 3. Name-based heuristic (last resort)
    if base_ter is None and name:
        n = name.lower()
        if "small cap" in n:        base_ter = CATEGORY_TER_DEFAULTS["Small Cap"]
        elif "mid cap" in n or "midcap" in n: base_ter = CATEGORY_TER_DEFAULTS["Mid Cap"]
        elif "large cap" in n:      base_ter = CATEGORY_TER_DEFAULTS["Large Cap"]
        elif "flexi" in n:          base_ter = CATEGORY_TER_DEFAULTS["Flexi Cap"]
        elif "index" in n or "nifty" in n: base_ter = CATEGORY_TER_DEFAULTS["Index"]
        elif "elss" in n or "tax" in n:    base_ter = CATEGORY_TER_DEFAULTS["ELSS"]
        elif "gold" in n or "silver" in n: base_ter = CATEGORY_TER_DEFAULTS["Gold & Silver"]
        elif "debt" in n or "bond" in n or "gilt" in n: base_ter = CATEGORY_TER_DEFAULTS["Debt"]
        elif "international" in n or "global" in n or "us " in n or "nasdaq" in n: base_ter = CATEGORY_TER_DEFAULTS["International"]

    if base_ter is None:
        base_ter = 0.85   # equity fund default

    # Regular plans typically add 0.80-1.20% commission spread
    if plan_type and plan_type.lower() == "regular":
        return round(base_ter + 0.85, 2)

    return round(base_ter, 2)


def enrich_funds_with_ter(funds: list) -> dict:
    """
    Take a list of fund dicts (or Pydantic models with .scheme_code, .name,
    .category, .plan_type) and return a {scheme_code: ter_pct} mapping.
    """
    result = {}
    for f in funds:
        # Support both dict and Pydantic model
        code = getattr(f, "scheme_code", None) or (f.get("scheme_code") if isinstance(f, dict) else None)
        name = getattr(f, "name", None) or (f.get("name") if isinstance(f, dict) else None)
        cat  = getattr(f, "category", None) or (f.get("category") if isinstance(f, dict) else None)
        plan = getattr(f, "plan_type", None) or (f.get("plan_type") if isinstance(f, dict) else None) or "Direct"
        if code:
            result[code] = get_expense_ratio(code, name, cat, plan)
    return result
