"""
TJ Connector — IBKR Bridge
Wrapper around the main backend's ib_insync logic.
Provides async interfaces used by the Connector's API endpoints.

This module intentionally mirrors the functionality of:
  - backend/ibkr_positions.py  (fetch_open_positions)
  - backend/fetch_live_portfolio.py (fetch_portfolio_data)

It is a COPY, not an import. This keeps the Connector self-contained
so it can be packaged independently without the full backend.
"""
import sys
import os
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ─── ib_insync connection factory ─────────────────────────────────────────────

def _connect_ib(port: int, client_id: int):
    """Create and connect an IB instance. Returns None on failure."""
    try:
        from ib_insync import IB
        import random
        ib = IB()
        # Randomize clientId to avoid conflicts when multiple requests arrive quickly
        cid = client_id + random.randint(0, 50)
        ib.connect("127.0.0.1", port, clientId=cid, timeout=8, readonly=True)
        return ib
    except Exception as exc:
        logger.error("Failed to connect to TWS at port %d: %s", port, exc)
        return None


# ─── Portfolio Data ────────────────────────────────────────────────────────────

async def fetch_portfolio_data(port: int = 7497) -> dict[str, Any]:
    """Fetch live portfolio summary from TWS via ib_insync.

    Returns a dict compatible with the web app's portfolio view.
    On connection failure, returns a structured error dict so the
    web app can display a meaningful message instead of crashing.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_portfolio_sync, port)


def _fetch_portfolio_sync(port: int) -> dict[str, Any]:
    ib = _connect_ib(port, client_id=200)
    if not ib:
        return {"success": False, "message": "Cannot connect to TWS. Make sure TWS is open with API enabled."}

    try:
        account_values = ib.accountValues()
        portfolio_items = ib.portfolio()

        # Extract key account metrics
        net_liq = next((float(v.value) for v in account_values if v.tag == "NetLiquidation" and v.currency == "USD"), None)
        unrealized_pnl = next((float(v.value) for v in account_values if v.tag == "UnrealizedPnL" and v.currency == "USD"), None)
        realized_pnl = next((float(v.value) for v in account_values if v.tag == "RealizedPnL" and v.currency == "USD"), None)

        positions = []
        for item in portfolio_items:
            positions.append({
                "symbol": item.contract.symbol,
                "secType": item.contract.secType,
                "position": item.position,
                "marketValue": item.marketValue,
                "unrealizedPNL": item.unrealizedPNL,
                "realizedPNL": item.realizedPNL,
                "averageCost": item.averageCost,
            })

        return {
            "success": True,
            "net_liquidation": net_liq,
            "unrealized_pnl": unrealized_pnl,
            "realized_pnl": realized_pnl,
            "positions": positions,
        }
    except Exception as exc:
        logger.error("Error fetching portfolio: %s", exc)
        return {"success": False, "message": str(exc)}
    finally:
        ib.disconnect()


# ─── Open Positions ────────────────────────────────────────────────────────────

async def fetch_open_positions(port: int = 7497) -> dict[str, Any]:
    """Fetch open positions from TWS including stop order detection."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_positions_sync, port)


def _fetch_positions_sync(port: int) -> dict[str, Any]:
    ib = _connect_ib(port, client_id=201)
    if not ib:
        return {"success": False, "message": "Cannot connect to TWS.", "positions": []}

    try:
        portfolio = ib.portfolio()
        open_orders = ib.openOrders()

        # Map symbols with open stop orders
        stop_symbols = {
            o.contract.symbol
            for o in open_orders
            if o.orderType in ("STP", "STP LMT", "TRAIL")
        }

        positions = []
        for item in portfolio:
            symbol = item.contract.symbol
            positions.append({
                "symbol": symbol,
                "secType": item.contract.secType,
                "position": item.position,
                "avgCost": item.averageCost,
                "marketValue": item.marketValue,
                "unrealizedPNL": item.unrealizedPNL,
                "has_stop": symbol in stop_symbols,
            })

        return {"success": True, "positions": positions}
    except Exception as exc:
        logger.error("Error fetching positions: %s", exc)
        return {"success": False, "message": str(exc), "positions": []}
    finally:
        ib.disconnect()
