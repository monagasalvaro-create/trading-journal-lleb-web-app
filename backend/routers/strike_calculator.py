"""
Strike Calculator API router.
Exposes the POST /api/strike-calculator/calculate endpoint.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from database import get_db
from schemas import StrikeCalculatorRequest, StrikeCalculatorResponse
from routers.settings import get_or_create_settings
from strike_calculator import calculate_strikes

router = APIRouter(prefix="/api/strike-calculator", tags=["strike-calculator"])

logger = logging.getLogger(__name__)


@router.post("/calculate", response_model=StrikeCalculatorResponse)
async def calculate(
    request: StrikeCalculatorRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Calculate expected strike levels for a stock symbol.
    Reads IBKR socket port from stored settings, connects to TWS/Gateway,
    and returns price, IV, and computed strike levels.
    """
    try:
        settings = await get_or_create_settings(db)
        port = settings.ibkr_socket_port or 7497
    except Exception as exc:
        logger.error("Failed to read settings: %s", exc)
        return StrikeCalculatorResponse(
            success=False,
            symbol=request.symbol.upper(),
            message=f"Failed to read settings: {exc}",
        )

    logger.info("Strike calculation requested for %s on port %d", request.symbol, port)

    try:
        result = await calculate_strikes(request.symbol, port)
    except Exception as exc:
        logger.error("Strike calculation failed for %s: %s", request.symbol, exc)
        return StrikeCalculatorResponse(
            success=False,
            symbol=request.symbol.upper(),
            message=f"Calculation error: {exc}",
        )

    return StrikeCalculatorResponse(
        success=result.success,
        symbol=result.symbol,
        price=result.price,
        iv_annual=result.iv_annual,
        iv_daily=result.iv_daily,
        deviation=result.deviation,
        strike_call=result.strike_call,
        strike_put=result.strike_put,
        message=result.message,
    )
