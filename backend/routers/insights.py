"""
Insights Router — Portfolio insight generation endpoint.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, List, Optional

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from insights.generator import generate_insights

router = APIRouter(prefix="/api/insights", tags=["Insights"])


class InsightFund(BaseModel):
    scheme_code: str
    name: str
    category: str = "Unknown"
    weight: float = 0
    invested: float = 0
    current_value: float = 0

class InsightRequest(BaseModel):
    funds: List[InsightFund]
    risk_data: Optional[Dict] = None
    performance_data: Optional[List[Dict]] = None


@router.post("/generate")
def get_insights(req: InsightRequest):
    """Generate intelligent portfolio insights."""
    portfolio = [fund.dict() for fund in req.funds]
    insights = generate_insights(portfolio, req.risk_data, req.performance_data)
    return {
        "insights": insights,
        "total_insights": len(insights),
        "critical_count": sum(1 for i in insights if i["severity"] == "critical"),
        "warning_count": sum(1 for i in insights if i["severity"] == "warning"),
    }
