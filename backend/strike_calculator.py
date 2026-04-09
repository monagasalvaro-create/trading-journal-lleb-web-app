"""
Strike Calculator Engine — IBKR TWS/Gateway wrapper.

Connects to IBKR via ib_insync, fetches real-time price and
historical volatility for a stock, then calculates expected
strike levels at ±2 standard deviations (daily).

This module is the sole point of contact with ib_insync.
If the library ever changes, only this file needs updating.
"""
import math
import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

# nest_asyncio must be applied before any ib_insync usage across threads.
# ib_insync uses asyncio internally, and Python 3.12+ is strict about
# event loops in threads. Applying globally ensures compatibility.
try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass  # Will be caught later when ib_insync is loaded

logger = logging.getLogger(__name__)

TRADING_DAYS_PER_YEAR = 252
STANDARD_DEVIATIONS = 2
MAX_RETRIES = 12
RETRY_WAIT_SECONDS = 1.5


@dataclass(frozen=True)
class StrikeResult:
    """Immutable result from the strike calculation."""
    success: bool
    symbol: str
    price: Optional[float] = None
    iv_annual: Optional[float] = None
    iv_daily: Optional[float] = None
    deviation: Optional[float] = None
    strike_call: Optional[float] = None
    strike_put: Optional[float] = None
    message: Optional[str] = None


def _compute_strikes(price: float, iv_annual: float) -> StrikeResult:
    """Pure math — no side effects. Calculates strike levels from price and IV."""
    if iv_annual <= 0 or price <= 0:
        return StrikeResult(
            success=False,
            symbol="",
            message="Invalid price or IV values received from IBKR.",
        )

    iv_daily = iv_annual / math.sqrt(TRADING_DAYS_PER_YEAR)
    deviation = price * iv_daily * STANDARD_DEVIATIONS
    strike_call = round(price + deviation, 2)
    strike_put = round(price - deviation, 2)

    return StrikeResult(
        success=True,
        symbol="",
        price=round(price, 2),
        iv_annual=round(iv_annual, 4),
        iv_daily=round(iv_daily, 6),
        deviation=round(deviation, 2),
        strike_call=strike_call,
        strike_put=strike_put,
    )


import random

def _run_in_thread(symbol: str, port: int, client_id: Optional[int] = None) -> StrikeResult:
    """
    Runs ib_insync in its own thread with its own event loop.
    Uses a multi-phase strategy to reliably get price and IV:
      Phase 1: Live data (market data type 1)
      Phase 2: Delayed data (market data type 3)
      Phase 3: Delayed-frozen data (market data type 4)
    Requests both tick 104 (historical vol) and 106 (implied vol) as fallback.
    """
    if client_id is None:
        client_id = random.randint(50, 5000)
    try:
        from ib_insync import IB, Stock
        import nest_asyncio
    except ImportError:
        return StrikeResult(
            success=False,
            symbol=symbol,
            message="ib_insync library is not installed. Run: pip install ib_insync",
        )

    # ib_insync requires an asyncio event loop — create one for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    nest_asyncio.apply(loop)

    ib = IB()

    try:
        ib.connect("127.0.0.1", port, clientId=client_id, timeout=10)
    except Exception as exc:
        loop.close()
        return StrikeResult(
            success=False,
            symbol=symbol,
            message=f"Could not connect to IBKR on port {port}. "
                    f"Make sure TWS or IB Gateway is running. Error: {exc}",
        )

    try:
        contract = Stock(symbol, "SMART", "USD")
        ib.qualifyContracts(contract)

        price: Optional[float] = None
        iv: Optional[float] = None

        # Try multiple market data types in order of preference
        market_data_phases = [
            (1, "live"),       # Live streaming data
            (3, "delayed"),    # Delayed 15-min data
            (4, "delayed-frozen"),  # Delayed-frozen (last known delayed)
        ]

        for mdt, mdt_label in market_data_phases:
            if price is not None and iv is not None:
                break

            ib.reqMarketDataType(mdt)
            logger.info("Requesting %s market data (type %d) for %s", mdt_label, mdt, symbol)

            # Request ticks 104 (historical vol) AND 106 (option implied vol)
            ticker = ib.reqMktData(contract, genericTickList="104,106")

            # Poll for data — 12 attempts × 1.5s = 18s max per phase
            for attempt in range(MAX_RETRIES):
                ib.sleep(RETRY_WAIT_SECONDS)

                # --- Price extraction (multiple fallbacks) ---
                if price is None:
                    candidate = ticker.marketPrice()
                    if _is_valid_number(candidate):
                        price = candidate
                    elif _is_valid_number(ticker.last):
                        price = ticker.last
                    elif _is_valid_number(ticker.close):
                        price = ticker.close

                # --- IV extraction (historical vol > implied vol) ---
                if iv is None:
                    if hasattr(ticker, 'histVolatility') and _is_valid_number(ticker.histVolatility):
                        iv = ticker.histVolatility
                        logger.info("Got historical volatility for %s: %.4f", symbol, iv)
                    elif _is_valid_number(ticker.impliedVolatility):
                        iv = ticker.impliedVolatility
                        logger.info("Got implied volatility for %s: %.4f (fallback)", symbol, iv)

                if price is not None and iv is not None:
                    logger.info(
                        "Data complete for %s (%s, attempt %d): price=%.2f, IV=%.4f",
                        symbol, mdt_label, attempt + 1, price, iv,
                    )
                    break

            # Cancel the market data request before trying next phase
            ib.cancelMktData(contract)
            ib.sleep(0.5)

        # Evaluate what we got
        if price is None and iv is None:
            return StrikeResult(
                success=False,
                symbol=symbol,
                message=f"Could not retrieve any market data for {symbol}. "
                        "Ensure TWS has market data subscriptions for this symbol.",
            )

        if price is None:
            return StrikeResult(
                success=False,
                symbol=symbol,
                iv_annual=iv,
                message=f"Could not retrieve price for {symbol}. "
                        "The market may be closed or data subscriptions may be missing.",
            )

        if iv is None:
            return StrikeResult(
                success=False,
                symbol=symbol,
                price=round(price, 2),
                message=f"Could not retrieve historical or implied volatility for {symbol}. "
                        "Try checking your market data subscriptions in TWS "
                        "(IBKR > Account Management > Market Data).",
            )

        result = _compute_strikes(price, iv)
        return StrikeResult(
            success=result.success,
            symbol=symbol,
            price=result.price,
            iv_annual=result.iv_annual,
            iv_daily=result.iv_daily,
            deviation=result.deviation,
            strike_call=result.strike_call,
            strike_put=result.strike_put,
            message=result.message,
        )

    except Exception as exc:
        logger.error("Strike calculation error for %s: %s", symbol, exc)
        return StrikeResult(
            success=False,
            symbol=symbol,
            message=f"Error calculating strikes for {symbol}: {exc}",
        )
    finally:
        ib.disconnect()
        loop.close()


def _is_valid_number(value) -> bool:
    """Check if a value is a valid, positive, non-NaN number."""
    if value is None:
        return False
    try:
        return not math.isnan(value) and value > 0
    except (TypeError, ValueError):
        return False


async def calculate_strikes(symbol: str, port: int) -> StrikeResult:
    """
    Async entry point — runs ib_insync in a dedicated thread with its own
    event loop so it doesn't block or conflict with FastAPI's event loop.
    Uses asyncio.to_thread which handles thread creation cleanly.
    """
    if not symbol or not symbol.strip():
        return StrikeResult(
            success=False,
            symbol=symbol,
            message="Symbol cannot be empty.",
        )

    clean_symbol = symbol.strip().upper()
    return await asyncio.to_thread(_run_in_thread, clean_symbol, port)
