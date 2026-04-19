"""
TJ Connector — Strike Engine
Wrapper around strike_calculator.py logic.
Provides the calculate_strikes async function used by the /strikes/{symbol} endpoint.
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def calculate_strikes(symbol: str, port: int = 7497) -> dict[str, Any]:
    """Calculate option strike levels for a given symbol using ib_insync.

    Fetches current price and implied volatility from TWS,
    then computes standard deviation-based strike levels.
    On failure, returns a structured error dict.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _calculate_strikes_sync, symbol, port)


def _calculate_strikes_sync(symbol: str, port: int) -> dict[str, Any]:
    """Synchronous strike calculation — runs in executor thread."""
    try:
        from ib_insync import IB, Stock
        import random
        import math

        ib = IB()
        client_id = 300 + random.randint(0, 99)
        ib.connect("127.0.0.1", port, clientId=client_id, timeout=8, readonly=True)

        try:
            contract = Stock(symbol, "SMART", "USD")
            ib.qualifyContracts(contract)

            ticker = ib.reqMktData(contract, "", False, False)
            ib.sleep(2)

            price = ticker.marketPrice()
            if not price or math.isnan(price):
                price = ticker.last or ticker.close

            if not price or math.isnan(price):
                return {"success": False, "symbol": symbol, "message": "Could not fetch market price from TWS"}

            # Use implied volatility from ticker or fallback to 30-day HV estimate
            iv = ticker.impliedVolatility if ticker.impliedVolatility and not math.isnan(ticker.impliedVolatility) else 0.25

            # Calculate 1-standard-deviation weekly and monthly moves
            weekly_move = price * iv * math.sqrt(7 / 365)
            monthly_move = price * iv * math.sqrt(30 / 365)

            return {
                "success": True,
                "symbol": symbol,
                "current_price": round(price, 2),
                "implied_volatility": round(iv * 100, 2),
                "weekly_move": round(weekly_move, 2),
                "monthly_move": round(monthly_move, 2),
                "strikes": {
                    "1sd_weekly_up": round(price + weekly_move, 2),
                    "1sd_weekly_down": round(price - weekly_move, 2),
                    "1sd_monthly_up": round(price + monthly_move, 2),
                    "1sd_monthly_down": round(price - monthly_move, 2),
                },
            }
        finally:
            ib.disconnect()

    except Exception as exc:
        logger.error("Strike calculation error for %s: %s", symbol, exc)
        return {
            "success": False,
            "symbol": symbol,
            "message": f"Cannot connect to TWS or calculate strikes: {exc}",
        }
