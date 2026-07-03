"""
CAS (Consolidated Account Statement) parser.
Handles both CAMS and KFinTech PDF statement formats.

The parser is text-based — it extracts text via pdfplumber, then applies
regex-based line matching to identify fund headers and transaction rows.

Fund matching against POPULAR_SCHEMES uses token-set similarity so the
parser tolerates minor differences in naming (e.g. "Direct Plan Growth"
vs "Direct - Growth").
"""
from typing import Dict, List, Optional, Tuple
from io import BytesIO
import re
import pdfplumber

from data.schemes import POPULAR_SCHEMES


# ── Fund matcher ─────────────────────────────────────────────────────────
def _tokenize(name: str) -> set:
    """Normalise + tokenise a fund name into a set of significant words."""
    if not name:
        return set()
    s = name.lower()
    # Remove common noise words
    for w in ["fund", "growth", "plan", "direct", "regular", "-", "(", ")", ".", ","]:
        s = s.replace(w, " ")
    return {t for t in s.split() if len(t) >= 3}


def _match_fund(candidate: str) -> Optional[Dict]:
    """Match a candidate name to POPULAR_SCHEMES via token overlap."""
    if not candidate:
        return None
    cand_tokens = _tokenize(candidate)
    if not cand_tokens:
        return None

    best_score = 0
    best_match = None
    for scheme in POPULAR_SCHEMES:
        s_tokens = _tokenize(scheme["name"])
        if not s_tokens:
            continue
        overlap = cand_tokens & s_tokens
        # Jaccard similarity — favours strong overlap of significant tokens
        score = len(overlap) / max(len(cand_tokens | s_tokens), 1)
        if score > best_score and score >= 0.4:
            best_score = score
            best_match = scheme

    return best_match


# ── Text extraction ──────────────────────────────────────────────────────
def _extract_text(pdf_bytes: bytes, password: Optional[str] = None) -> str:
    """Extract text from a (possibly password-protected) PDF."""
    try:
        with pdfplumber.open(BytesIO(pdf_bytes), password=password or "") as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
            return "\n".join(pages)
    except Exception as e:
        raise ValueError(f"Could not open PDF: {e}. If it's password-protected, provide the password.")


# ── Parsers ──────────────────────────────────────────────────────────────
# Match a monetary/units value like "12,345.678" or "1,00,000.00"
_AMOUNT = r"[\d,]+\.?\d*"
# Transaction line pattern — very forgiving.
# Matches lines like:  "01-Apr-2024   Purchase  10,000.00  123.4567  81.032"
_TXN_RE = re.compile(
    r"(?P<date>\d{2}-[A-Za-z]{3}-\d{4}|\d{2}/\d{2}/\d{4})\s+"
    r"(?P<narration>.+?)\s+"
    r"(?P<amount>-?" + _AMOUNT + r")\s+"
    r"(?P<nav>" + _AMOUNT + r")\s+"
    r"(?P<units>-?" + _AMOUNT + r")",
    re.IGNORECASE,
)

# Fund header pattern — lines that look like a fund identifier
_FUND_HDR_RE = re.compile(
    r"^(?:.*?)\b(fund|scheme)\b(?:.*?)$",
    re.IGNORECASE,
)


def _normalize_date(d: str) -> str:
    """Convert '01-Apr-2024' or '01/04/2024' to '2024-04-01'."""
    from datetime import datetime
    for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(d, fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return d  # give up — return as-is


def _clean_amount(s: str) -> float:
    """Convert '1,234.56' or '(1,234.56)' to a float."""
    s = s.strip().replace(",", "")
    if s.startswith("(") and s.endswith(")"):
        return -float(s[1:-1])
    try:
        return float(s)
    except Exception:
        return 0.0


def _classify_txn(narration: str) -> str:
    """Classify the transaction type from its narration text."""
    n = narration.lower()
    if any(k in n for k in ("purchase", "sip", "subscription", "invest", "switch in", "switch-in", "systematic")):
        return "buy"
    if any(k in n for k in ("redemption", "sell", "switch out", "switch-out", "withdrawal")):
        return "sell"
    if any(k in n for k in ("dividend", "reinvest", "distribution")):
        return "dividend"
    return "buy"  # default


def parse_cas(pdf_bytes: bytes, password: Optional[str] = None) -> Dict:
    """
    Parse a CAS PDF into a list of funds with their transaction histories.

    Returns:
      {
        "funds": [
            {
                "scheme_code":  "..."   (matched, else None),
                "matched_name": "..."   (from POPULAR_SCHEMES if matched),
                "raw_name":     "..."   (as it appeared in the PDF),
                "category":     "..."   (from POPULAR_SCHEMES if matched),
                "matched":      True/False,
                "transactions": [ {date, type, amount, units, nav}, ... ],
                "total_invested": <float>,
                "current_units":  <float>,
            }, ...
        ],
        "stats": { "matched_count": N, "unmatched_count": M, "total_transactions": T },
      }
    """
    text = _extract_text(pdf_bytes, password)
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    funds: List[Dict] = []
    current_fund: Optional[Dict] = None

    for raw_line in lines:
        # First: is this a transaction row?
        m = _TXN_RE.search(raw_line)
        if m and current_fund is not None:
            narration = m.group("narration").strip()
            # Skip lines that look like account balance / opening balance summaries
            if any(k in narration.lower() for k in ("opening balance", "closing balance", "b/f", "c/f")):
                continue
            txn = {
                "date":   _normalize_date(m.group("date")),
                "type":   _classify_txn(narration),
                "amount": _clean_amount(m.group("amount")),
                "nav":    _clean_amount(m.group("nav")),
                "units":  _clean_amount(m.group("units")),
                "note":   narration[:60],
            }
            current_fund["transactions"].append(txn)
            continue

        # Otherwise: is this a fund header?
        # Heuristic: line contains "Fund" or "Scheme" AND has ≥ 3 words AND doesn't match a txn row
        if _FUND_HDR_RE.search(raw_line) and len(raw_line.split()) >= 3 and len(raw_line) < 120:
            # Skip common non-fund lines
            lc = raw_line.lower()
            if any(kw in lc for kw in ("total", "grand total", "portfolio summary", "consolidated", "statement", "annexure")):
                continue

            # Try to match this line against POPULAR_SCHEMES
            match = _match_fund(raw_line)
            if match:
                # Start a new fund block
                new_fund = {
                    "raw_name":     raw_line,
                    "matched_name": match["name"],
                    "scheme_code":  match["code"],
                    "category":     match.get("category"),
                    "matched":      True,
                    "transactions": [],
                }
                funds.append(new_fund)
                current_fund = new_fund
            elif len(raw_line) > 15 and any(kw in lc for kw in ("cap", "flexi", "index", "hybrid", "debt", "gilt", "arbitrage", "gold", "silver", "elss")):
                # Unmatched but likely a fund line
                new_fund = {
                    "raw_name":     raw_line,
                    "matched_name": None,
                    "scheme_code":  None,
                    "category":     None,
                    "matched":      False,
                    "transactions": [],
                }
                funds.append(new_fund)
                current_fund = new_fund

    # Aggregate per-fund totals
    for f in funds:
        total_invested = sum(t["amount"] for t in f["transactions"] if t["type"] == "buy")
        total_redeemed = sum(t["amount"] for t in f["transactions"] if t["type"] == "sell")
        units          = sum(t["units"]  for t in f["transactions"] if t["type"] == "buy") - \
                         sum(t["units"]  for t in f["transactions"] if t["type"] == "sell")
        f["total_invested"] = round(total_invested - total_redeemed, 2)
        f["current_units"]  = round(units, 4)
        # First transaction date = purchase_date
        if f["transactions"]:
            f["purchase_date"] = min(t["date"] for t in f["transactions"])
        else:
            f["purchase_date"] = None

    # Filter out funds with zero transactions
    funds = [f for f in funds if f["transactions"]]

    matched   = sum(1 for f in funds if f["matched"])
    unmatched = len(funds) - matched
    total_txn = sum(len(f["transactions"]) for f in funds)

    return {
        "funds": funds,
        "stats": {
            "matched_count":       matched,
            "unmatched_count":     unmatched,
            "total_transactions":  total_txn,
        },
    }
