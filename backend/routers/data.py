"""
Data Router — Fund search, NAV data, scheme listings, and index benchmarks.
"""
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form
from typing import Optional
import json, os

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetcher import search_schemes, fetch_nav_history, fetch_latest_nav, fetch_scheme_meta
from data.schemes import POPULAR_SCHEMES, CATEGORIES, get_schemes_by_category, get_benchmarks
from data.preprocessor import clean_nav_data, compute_returns, compute_rolling_stats
from data.cas_parser import parse_cas

router = APIRouter(prefix="/api/data", tags=["Data"])


@router.get("/schemes")
def get_schemes(category: Optional[str] = None):
    schemes = get_schemes_by_category(category)
    return {"schemes": schemes, "categories": CATEGORIES}


@router.get("/benchmarks")
def list_benchmarks():
    """Return available benchmark proxies and their scheme codes."""
    return {"benchmarks": get_benchmarks()}


@router.get("/search")
def search_funds(q: str = Query(..., min_length=2)):
    results = search_schemes(q)
    return {"query": q, "results": results[:20]}


@router.get("/nav/{scheme_code}")
def get_nav_history(
    scheme_code: str,
    period: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    clean: bool = Query(True),
):
    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No NAV data for scheme {scheme_code}")

    if clean:
        df = clean_nav_data(df)

    import pandas as pd

    # Period filter (preset)
    if period:
        end_dt = df["date"].max()
        period_map = {"1Y": 365, "2Y": 730, "3Y": 1095, "5Y": 1825, "10Y": 3650}
        days = period_map.get(period)
        if days:
            df = df[df["date"] >= end_dt - pd.Timedelta(days=days)]

    # Custom date range
    if start_date:
        df = df[df["date"] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df["date"] <= pd.to_datetime(end_date)]

    meta = fetch_scheme_meta(scheme_code)
    nav_data = [
        {"date": row["date"].strftime("%Y-%m-%d"), "nav": round(float(row["nav"]), 4)}
        for _, row in df.iterrows()
    ]

    return {
        "scheme_code": scheme_code,
        "meta": meta,
        "data_points": len(nav_data),
        "start_date": nav_data[0]["date"] if nav_data else None,
        "end_date": nav_data[-1]["date"] if nav_data else None,
        "nav_data": nav_data,
    }


@router.get("/index/{scheme_code}")
def get_index_as_nav(
    scheme_code: str,
    period: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """
    Fetch a benchmark index using its MFAPI proxy scheme code.
    Returns normalized data (base=100) suitable for chart comparison.
    """
    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for index proxy {scheme_code}")

    df = clean_nav_data(df)

    import pandas as pd

    if period:
        end_dt = df["date"].max()
        period_map = {"1Y": 365, "2Y": 730, "3Y": 1095, "5Y": 1825, "10Y": 3650}
        days = period_map.get(period)
        if days:
            df = df[df["date"] >= end_dt - pd.Timedelta(days=days)]

    if start_date:
        df = df[df["date"] >= pd.to_datetime(start_date)]
    if end_date:
        df = df[df["date"] <= pd.to_datetime(end_date)]

    nav_data = [
        {"date": row["date"].strftime("%Y-%m-%d"), "nav": round(float(row["nav"]), 4)}
        for _, row in df.iterrows()
    ]

    return {"scheme_code": scheme_code, "nav_data": nav_data, "data_points": len(nav_data)}


@router.get("/nav/{scheme_code}/latest")
def get_latest_nav(scheme_code: str):
    result = fetch_latest_nav(scheme_code)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Could not fetch latest NAV for {scheme_code}")
    return result


@router.get("/nav/{scheme_code}/returns")
def get_fund_returns(scheme_code: str):
    """Compute annualised CAGR returns for 1Y, 3Y, 5Y periods."""
    import pandas as pd
    from analytics.performance import calculate_cagr

    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No NAV data for {scheme_code}")

    df = clean_nav_data(df)
    df = df.sort_values("date").reset_index(drop=True)

    latest_nav  = float(df.iloc[-1]["nav"])
    latest_date = df.iloc[-1]["date"].strftime("%Y-%m-%d")

    result: dict = {
        "scheme_code": scheme_code,
        "current_nav": round(latest_nav, 4),
        "nav_date":    latest_date,
        "return_1y":   None,
        "return_3y":   None,
        "return_5y":   None,
    }

    for years, key in [(1, "return_1y"), (3, "return_3y"), (5, "return_5y")]:
        cutoff = df.iloc[-1]["date"] - pd.DateOffset(years=years)
        past   = df[df["date"] <= cutoff]
        if not past.empty:
            past_nav    = float(past.iloc[-1]["nav"])
            result[key] = round(calculate_cagr(past_nav, latest_nav, years), 2)

    return result


@router.get("/nav/{scheme_code}/stats")
def get_nav_stats(scheme_code: str):
    df = fetch_nav_history(scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No data found")

    df = clean_nav_data(df)
    df = compute_returns(df, periods=[1, 5, 20])
    df = compute_rolling_stats(df, windows=[20, 50, 200])
    df = df.tail(500)

    records = []
    for _, row in df.iterrows():
        record = {"date": row["date"].strftime("%Y-%m-%d")}
        for col in ["nav", "return_1d", "return_5d", "return_20d", "sma_20", "sma_50", "sma_200", "vol_20", "vol_60"]:
            if col in row and not (isinstance(row[col], float) and (row[col] != row[col])):
                record[col] = round(float(row[col]), 4)
        records.append(record)

    return {"scheme_code": scheme_code, "stats": records}


# ── CAS (CAMS/KFinTech) statement upload ────────────────────────────────
@router.post("/import-cas")
async def import_cas(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
):
    """
    Upload a CAMS or KFinTech consolidated account statement (PDF).
    Returns the parsed funds + transactions, matched against known schemes.
    Frontend then previews and confirms before merging into the user's portfolio.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    try:
        pdf_bytes = await file.read()
        if len(pdf_bytes) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF too large (max 15 MB).")
        result = parse_cas(pdf_bytes, password=password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {e}")

    return result
