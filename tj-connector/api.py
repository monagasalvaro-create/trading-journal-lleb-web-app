"""
TJ Connector — FastAPI Micro-API
Runs on localhost:8765. Bridges the web app to TWS/IB Gateway.

Security:
  - CORS is restricted to the web app origin only (prevents other sites from
    accessing the user's TWS data via this local server)
  - Server binds ONLY to 127.0.0.1 (not 0.0.0.0), so external network access
    is impossible at the OS level
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ibkr_bridge import fetch_portfolio_data, fetch_open_positions
from strike_engine import calculate_strikes

# The web app's origin — must match the deployed URL exactly.
# Update this when the production domain is set.
_WEB_APP_ORIGINS = [
    "https://app.tudominio.com",   # Production (update before deploy)
    "http://localhost:5173",        # Vite dev server
    "http://localhost:3000",        # Alternative dev port
    "http://127.0.0.1:8000",       # Local FastAPI server (run_app.py mode)
]

app = FastAPI(
    title="TJ Connector API",
    description="Local bridge between Trading Journal web app and TWS/IB Gateway",
    version="1.0.0",
    docs_url=None,     # Disable Swagger UI — no public docs needed
    redoc_url=None,
)

# CORS: only accept requests from the known web app origins.
# This is a security boundary — do not use allow_origins=["*"] here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_WEB_APP_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/status")
async def status():
    """Health check endpoint.
    The web app polls this to detect if the Connector is running.
    Returns connector version and TWS port for diagnostics.
    """
    return {"running": True, "version": "1.0.0", "tws_port": 7497}


@app.get("/portfolio")
async def get_portfolio():
    """Live portfolio summary from TWS.
    Returns positions and account-level values (net liquidation, P&L).
    Requires TWS or IB Gateway to be open with API enabled.
    """
    return await fetch_portfolio_data(port=7497)


@app.get("/positions")
async def get_positions():
    """Open positions from TWS, including detected stop orders.
    Requires TWS or IB Gateway to be open with API enabled.
    """
    return await fetch_open_positions(port=7497)


@app.get("/strikes/{symbol}")
async def get_strikes(symbol: str):
    """Strike calculator for a given symbol.
    Fetches current price and implied volatility from TWS,
    then computes strike levels based on historical volatility.
    Requires TWS or IB Gateway to be open with API enabled.
    """
    return await calculate_strikes(symbol=symbol, port=7497)
