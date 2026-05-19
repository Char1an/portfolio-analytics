"""
Simulation Router — Scenario simulation and Monte Carlo endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.fetcher import fetch_nav_history, fetch_latest_nav, fetch_multiple_navs
from data.preprocessor import clean_nav_data
from simulation.scenarios import simulate_scenario, get_available_scenarios
from simulation.monte_carlo import run_monte_carlo, run_portfolio_monte_carlo

router = APIRouter(prefix="/api/simulation", tags=["Simulation"])


class ScenarioRequest(BaseModel):
    scheme_code: str
    scenario_id: str
    category: str = "Large Cap"
    monthly_sip: float = 0
    lumpsum_amount: float = 10000
    investment_months: Optional[int] = None

class MonteCarloRequest(BaseModel):
    scheme_code: str
    n_simulations: int = 1000
    horizon_days: int = 252
    monthly_sip: float = 0
    initial_investment: float = 10000

class PortfolioMCRequest(BaseModel):
    funds: List[Dict]  # [{scheme_code, weight}]
    total_investment: float = 100000
    horizon_days: int = 252
    n_simulations: int = 500


@router.get("/scenarios")
def list_scenarios():
    """Get list of available predefined scenarios."""
    return {"scenarios": get_available_scenarios()}


@router.post("/scenario")
def run_scenario(req: ScenarioRequest):
    """Run a predefined scenario simulation on a fund."""
    latest = fetch_latest_nav(req.scheme_code)
    if latest is None:
        raise HTTPException(status_code=404, detail="Could not fetch fund data")

    current_nav = latest["nav"]

    result = simulate_scenario(
        current_nav=current_nav,
        scenario_id=req.scenario_id,
        category=req.category,
        monthly_sip=req.monthly_sip,
        lumpsum_amount=req.lumpsum_amount,
        investment_months=req.investment_months,
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    result["scheme_name"] = latest.get("scheme_name", "")
    return result


@router.post("/montecarlo")
def run_mc_simulation(req: MonteCarloRequest):
    """Run Monte Carlo simulation for a single fund."""
    df = fetch_nav_history(req.scheme_code)
    if df is None or df.empty:
        raise HTTPException(status_code=404, detail="No NAV data found")

    df = clean_nav_data(df)

    # Need at least 252 data points for meaningful statistics
    if len(df) < 100:
        raise HTTPException(status_code=400, detail="Insufficient historical data for simulation")

    result = run_monte_carlo(
        nav_df=df,
        n_simulations=min(req.n_simulations, 2000),  # cap at 2000
        horizon_days=min(req.horizon_days, 756),  # cap at 3 years
        monthly_sip=req.monthly_sip,
        initial_investment=req.initial_investment,
    )

    return result


@router.post("/portfolio-montecarlo")
def run_portfolio_mc(req: PortfolioMCRequest):
    """Run correlated Monte Carlo simulation for a portfolio of funds."""
    if len(req.funds) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 funds")

    codes = [f["scheme_code"] for f in req.funds]
    nav_dict = fetch_multiple_navs(codes)

    if len(nav_dict) < 2:
        raise HTTPException(status_code=404, detail="Could not fetch enough fund data")

    weights = {f["scheme_code"]: f.get("weight", 1.0 / len(req.funds)) for f in req.funds}

    result = run_portfolio_monte_carlo(
        nav_dict=nav_dict,
        weights=weights,
        total_investment=req.total_investment,
        horizon_days=min(req.horizon_days, 756),
        n_simulations=min(req.n_simulations, 1000),
    )

    return result
