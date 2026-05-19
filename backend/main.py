"""
Folio Klarity — FastAPI Main Application

Production-grade fintech API for Indian mutual fund analysis,
ML-based forecasting, and Monte Carlo simulation.
"""
import sys
import os

# Ensure backend modules are importable
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS

# ── Create FastAPI App ──
app = FastAPI(
    title="Folio Klarity",
    description="Folio Klarity — Intelligent Portfolio Analytics, Forecasting & Scenario Simulation for Indian Mutual Funds",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ──
from routers.data import router as data_router
from routers.analytics import router as analytics_router
from routers.forecast import router as forecast_router
from routers.simulation import router as simulation_router
from routers.insights import router as insights_router
from routers.user import router as user_router
from routers.agent import router as agent_router

app.include_router(user_router)
app.include_router(data_router)
app.include_router(analytics_router)
app.include_router(forecast_router)
app.include_router(simulation_router)
app.include_router(insights_router)
app.include_router(agent_router)


@app.get("/")
def root():
    return {
        "name": "Folio Klarity",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "user": "/api/user",
            "data": "/api/data",
            "analytics": "/api/analytics",
            "forecast": "/api/forecast",
            "simulation": "/api/simulation",
            "insights": "/api/insights",
            "agent": "/api/agent",
        }
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
