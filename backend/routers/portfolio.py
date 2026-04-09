from fastapi import APIRouter, HTTPException
from fetch_live_portfolio import fetch_portfolio_data

router = APIRouter(
    prefix="/api/portfolio",
    tags=["portfolio"],
    responses={404: {"description": "Not found"}},
)

@router.get("/live")
async def get_live_portfolio():
    """
    Fetch live portfolio data from IBKR (Account Summary + Positions with real-time P&L).
    """
    result = await fetch_portfolio_data()
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("message", "Unknown error"))
    return result
