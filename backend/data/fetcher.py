"""
MFAPI.in Data Fetcher — Fetches and caches historical NAV data for Indian mutual funds.

Data source: https://api.mfapi.in (free, no authentication required)
- /mf/search?q={name}     → Search schemes by name
- /mf/{scheme_code}       → Full historical NAV
- /mf/{scheme_code}/latest → Latest NAV only
"""
import os
import json
import time
import requests
import pandas as pd
from datetime import datetime
from typing import Optional, List, Dict

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import MFAPI_BASE_URL, CACHE_DIR, CACHE_TTL_HOURS


def _ensure_cache_dir():
    """Create cache directory if it doesn't exist."""
    os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_path(scheme_code: str) -> str:
    """Return the file path for cached NAV data."""
    return os.path.join(CACHE_DIR, f"{scheme_code}.json")


def _is_cache_valid(path: str) -> bool:
    """Check if cached file exists and is within TTL."""
    if not os.path.exists(path):
        return False
    mtime = os.path.getmtime(path)
    age_hours = (time.time() - mtime) / 3600
    return age_hours < CACHE_TTL_HOURS


def search_schemes(query: str) -> List[Dict]:
    """
    Search mutual fund schemes by name.
    Returns list of {schemeCode, schemeName}.
    """
    url = f"{MFAPI_BASE_URL}/mf/search?q={query}"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[Fetcher] Search failed for '{query}': {e}")
        return []


def fetch_nav_history(scheme_code: str, force_refresh: bool = False) -> Optional[pd.DataFrame]:
    """
    Fetch complete historical NAV for a scheme.
    Uses local JSON cache with configurable TTL.

    Returns DataFrame with columns: ['date', 'nav']
    - date: datetime64
    - nav: float64
    """
    _ensure_cache_dir()
    cache_file = _cache_path(scheme_code)

    # ── Try cache first ──
    if not force_refresh and _is_cache_valid(cache_file):
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)
            return _parse_nav_data(data)
        except Exception:
            pass  # Cache corrupted, re-fetch

    # ── Fetch from API ──
    url = f"{MFAPI_BASE_URL}/mf/{scheme_code}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # Save to cache atomically (write to temp, then rename)
        tmp_file = cache_file + ".tmp"
        with open(tmp_file, "w") as f:
            json.dump(data, f)
        os.replace(tmp_file, cache_file)

        return _parse_nav_data(data)
    except Exception as e:
        print(f"[Fetcher] Failed to fetch NAV for scheme {scheme_code}: {e}")
        # Try stale cache as fallback
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r") as f:
                    return _parse_nav_data(json.load(f))
            except Exception:
                print(f"[Fetcher] Stale cache corrupted for {scheme_code}, ignoring")
        return None


def fetch_latest_nav(scheme_code: str) -> Optional[Dict]:
    """Fetch only the latest NAV for a scheme."""
    url = f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {
            "scheme_code": scheme_code,
            "scheme_name": data.get("meta", {}).get("scheme_name", "Unknown"),
            "nav": float(data.get("data", [{}])[0].get("nav", 0)),
            "date": data.get("data", [{}])[0].get("date", ""),
        }
    except Exception as e:
        print(f"[Fetcher] Failed to fetch latest NAV for {scheme_code}: {e}")
        return None


def fetch_scheme_meta(scheme_code: str) -> Optional[Dict]:
    """Fetch scheme metadata (name, category, house)."""
    url = f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest"
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        meta = resp.json().get("meta", {})
        return {
            "scheme_code": int(scheme_code),
            "scheme_name": meta.get("scheme_name", "Unknown"),
            "fund_house": meta.get("fund_house", "Unknown"),
            "scheme_type": meta.get("scheme_type", "Unknown"),
            "scheme_category": meta.get("scheme_category", "Unknown"),
        }
    except Exception:
        return None


def _parse_nav_data(raw: dict) -> pd.DataFrame:
    """
    Parse MFAPI response into a clean DataFrame.
    MFAPI returns: {"meta": {...}, "data": [{"date": "DD-MM-YYYY", "nav": "123.45"}, ...]}
    Data is in reverse chronological order — we sort ascending.
    """
    records = raw.get("data", [])
    if not records:
        return pd.DataFrame(columns=["date", "nav"])

    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"], format="%d-%m-%Y", errors="coerce")
    df["nav"] = pd.to_numeric(df["nav"], errors="coerce")
    df = df.dropna(subset=["date", "nav"])
    df = df.sort_values("date").reset_index(drop=True)
    return df


def fetch_multiple_navs(scheme_codes: List[str]) -> Dict[str, pd.DataFrame]:
    """Fetch NAV history for multiple schemes. Returns dict of {code: DataFrame}."""
    results = {}
    for code in scheme_codes:
        df = fetch_nav_history(str(code))
        if df is not None and not df.empty:
            results[str(code)] = df
    return results
