"""
IBKR Account Data — TWS/Gateway wrapper for account-level information.

Fetches NetLiquidation and other account summary data from IBKR.
Uses the same thread-isolation pattern as strike_calculator.py.
"""
import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

MAX_WAIT_SECONDS = 8


@dataclass(frozen=True)
class AccountResult:
    """Immutable result from the account data fetch."""
    success: bool
    net_liquidation: Optional[float] = None
    message: Optional[str] = None


def _fetch_net_liquidation_sync(port: int, client_id: int = 36) -> AccountResult:
    """
    Synchronous function that runs in its own thread.
    Connects to IBKR, fetches NetLiquidation from accountSummary(), disconnects.
    """
    try:
        from ib_insync import IB
        import nest_asyncio
    except ImportError:
        return AccountResult(
            success=False,
            message="ib_insync library is not installed. Run: pip install ib_insync",
        )

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    nest_asyncio.apply(loop)

    ib = IB()

    try:
        ib.connect("127.0.0.1", port, clientId=client_id, timeout=10)
    except Exception as exc:
        loop.close()
        return AccountResult(
            success=False,
            message=f"Could not connect to IBKR on port {port}. "
                    f"Make sure TWS or IB Gateway is running. Error: {exc}",
        )

    try:
        # accountSummary() returns a list of AccountValue objects
        summary = ib.accountSummary()

        # Wait briefly if summary is empty (data may still be streaming in)
        if not summary:
            ib.sleep(2)
            summary = ib.accountSummary()

        net_liq: Optional[float] = None

        for item in summary:
            if item.tag == "NetLiquidation" and item.currency == "USD":
                try:
                    net_liq = float(item.value)
                except (ValueError, TypeError):
                    continue
                break

        if net_liq is None:
            return AccountResult(
                success=False,
                message="Could not find NetLiquidation in account summary. "
                        "Ensure your IBKR account has USD positions.",
            )

        logger.info("IBKR NetLiquidation: $%.2f", net_liq)
        return AccountResult(success=True, net_liquidation=net_liq)

    except Exception as exc:
        logger.error("Error fetching account summary: %s", exc)
        return AccountResult(
            success=False,
            message=f"Error fetching account data: {exc}",
        )
    finally:
        ib.disconnect()
        loop.close()


async def fetch_net_liquidation(port: int) -> AccountResult:
    """
    Async entry point — runs the IBKR fetch in a dedicated thread
    so it doesn't block FastAPI's event loop.
    """
    return await asyncio.to_thread(_fetch_net_liquidation_sync, port)
