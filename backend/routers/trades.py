"""
Trades API router - CRUD operations for trading journal entries.
Supports multi-account isolation via X-Account-ID request header.
Supports multi-user isolation via user_id from JWT middleware.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from datetime import date

from database import get_db
from models import Trade, PsychologyTag
from schemas import (
    TradeCreate,
    TradeUpdate,
    TradeResponse,
    TradeListResponse,
)
from auth_utils import get_user_id_from_request

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("", response_model=TradeListResponse)
async def get_trades(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=5000),
    ticker: Optional[str] = None,
    strategy: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    is_error: Optional[bool] = None,
    psychology_tag: Optional[str] = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated list of trades with optional filters, scoped to the active account."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    query = select(Trade).where(Trade.account_id == account_id)
    if user_id:
        query = query.where(Trade.user_id == user_id)

    if ticker:
        query = query.where(Trade.ticker.ilike(f"%{ticker}%"))
    if strategy:
        query = query.where(Trade.strategy.ilike(f"%{strategy}%"))
    if start_date:
        query = query.where(Trade.entry_date >= start_date)
    if end_date:
        query = query.where(Trade.entry_date <= end_date)
    if is_error is not None:
        query = query.where(Trade.is_error == is_error)
    if psychology_tag:
        query = query.where(Trade.psychology_tag == psychology_tag)

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Trade.entry_date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    trades = result.scalars().all()

    return TradeListResponse(
        trades=[TradeResponse.model_validate(t) for t in trades],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{trade_id}", response_model=TradeResponse)
async def get_trade(
    trade_id: str,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single trade by ID."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    conditions = [Trade.id == trade_id, Trade.account_id == account_id]
    if user_id:
        conditions.append(Trade.user_id == user_id)
    result = await db.execute(select(Trade).where(*conditions))
    trade = result.scalar_one_or_none()

    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    return TradeResponse.model_validate(trade)


@router.post("", response_model=TradeResponse)
async def create_trade(
    trade_data: TradeCreate,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new trade entry scoped to the active account."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    trade_id = Trade.generate_id(trade_data.ticker, trade_data.entry_date, account_id=account_id)

    existing = await db.execute(
        select(Trade).where(Trade.id == trade_id, Trade.account_id == account_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Trade with this ID already exists")

    gross_pnl = trade_data.net_pnl + abs(trade_data.commissions)

    trade = Trade(
        id=trade_id,
        account_id=account_id,
        user_id=user_id or "system",
        gross_pnl=gross_pnl,
        **trade_data.model_dump(),
    )

    db.add(trade)
    await db.commit()
    await db.refresh(trade)

    return TradeResponse.model_validate(trade)


@router.put("/{trade_id}", response_model=TradeResponse)
async def update_trade(
    trade_id: str,
    trade_data: TradeUpdate,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing trade (auto-save from inline editing)."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    conditions = [Trade.id == trade_id, Trade.account_id == account_id]
    if user_id:
        conditions.append(Trade.user_id == user_id)
    result = await db.execute(select(Trade).where(*conditions))
    trade = result.scalar_one_or_none()

    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    update_data = trade_data.model_dump(exclude_unset=True)

    if "net_pnl" in update_data or "commissions" in update_data:
        net_pnl = update_data.get("net_pnl", trade.net_pnl)
        commissions = update_data.get("commissions", trade.commissions)
        update_data["gross_pnl"] = net_pnl + abs(commissions)

    if "psychology_tag" in update_data:
        tag = update_data["psychology_tag"]
        update_data["is_error"] = tag != PsychologyTag.NONE.value

    for key, value in update_data.items():
        setattr(trade, key, value)

    await db.commit()
    await db.refresh(trade)

    return TradeResponse.model_validate(trade)


@router.delete("/{trade_id}")
async def delete_trade(
    trade_id: str,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a trade by ID."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    conditions = [Trade.id == trade_id, Trade.account_id == account_id]
    if user_id:
        conditions.append(Trade.user_id == user_id)
    result = await db.execute(select(Trade).where(*conditions))
    trade = result.scalar_one_or_none()

    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    await db.delete(trade)
    await db.commit()

    return {"message": "Trade deleted successfully"}


@router.get("/by-date/{target_date}", response_model=List[TradeResponse])
async def get_trades_by_date(
    target_date: date,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get all trades closed on a specific date (for heatmap drill-down), scoped to active account."""
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    conditions = [
        Trade.account_id == account_id,
        func.coalesce(Trade.exit_date, Trade.entry_date) == target_date,
    ]
    if user_id:
        conditions.append(Trade.user_id == user_id)
    result = await db.execute(
        select(Trade).where(*conditions).order_by(Trade.ticker)
    )
    trades = result.scalars().all()

    return [TradeResponse.model_validate(t) for t in trades]
