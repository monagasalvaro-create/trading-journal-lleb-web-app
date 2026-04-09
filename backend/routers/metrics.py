"""
Metrics API router - Financial calculations and analytics endpoints.
Supports multi-account isolation via X-Account-ID request header.
"""
from fastapi import APIRouter, Depends, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from datetime import date
from collections import defaultdict

from database import get_db
from models import Trade, AccountEquity
from schemas import (
    MetricsSummary,
    DailyPnL,
    EquityCurveResponse,
    HeatmapDay,
    HeatmapResponse,
    NAVActivityDay,
    NAVActivityResponse,
    AnnualMetrics,
    AnnualMetricsResponse,
)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ticker: Optional[str] = None,
    strategy: Optional[str] = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get summary metrics for dashboard KPIs, scoped to the active account."""
    account_id = x_account_id or "default"
    query = select(Trade).where(Trade.account_id == account_id)

    if start_date:
        query = query.where(func.coalesce(Trade.exit_date, Trade.entry_date) >= start_date)
    if end_date:
        query = query.where(func.coalesce(Trade.exit_date, Trade.entry_date) <= end_date)
    if ticker:
        query = query.where(Trade.ticker.ilike(f"%{ticker}%"))
    if strategy:
        query = query.where(Trade.strategy.ilike(f"%{strategy}%"))

    result = await db.execute(query)
    all_trades = result.scalars().all()

    trades = [t for t in all_trades if not t.is_error]

    if not trades:
        return MetricsSummary(
            total_trades=0, winning_trades=0, losing_trades=0, win_rate=0.0,
            total_net_pnl=0.0, total_gross_pnl=0.0, total_commissions=0.0,
            profit_factor=0.0, average_win=0.0, average_loss=0.0,
            largest_win=0.0, largest_loss=0.0, adjusted_net_pnl=0.0,
        )

    winning_trades = [t for t in trades if t.net_pnl > 0]
    losing_trades = [t for t in trades if t.net_pnl < 0]
    non_error_trades = [t for t in trades if not t.is_error]

    total_wins = sum(t.net_pnl for t in winning_trades)
    total_losses = abs(sum(t.net_pnl for t in losing_trades))

    profit_factor = total_wins / total_losses if total_losses > 0 else float("inf") if total_wins > 0 else 0.0

    decisive_trades_count = len(winning_trades) + len(losing_trades)
    win_rate = (len(winning_trades) / decisive_trades_count * 100) if decisive_trades_count > 0 else 0.0

    return MetricsSummary(
        total_trades=len(winning_trades) + len(losing_trades),
        winning_trades=len(winning_trades),
        losing_trades=len(losing_trades),
        win_rate=win_rate,
        total_net_pnl=sum(t.net_pnl for t in trades),
        total_gross_pnl=sum(t.gross_pnl for t in trades),
        total_commissions=sum(t.commissions for t in trades),
        profit_factor=profit_factor if profit_factor != float("inf") else 999.99,
        average_win=total_wins / len(winning_trades) if winning_trades else 0.0,
        average_loss=total_losses / len(losing_trades) if losing_trades else 0.0,
        largest_win=max((t.net_pnl for t in winning_trades), default=0.0),
        largest_loss=abs(min((t.net_pnl for t in losing_trades), default=0.0)),
        adjusted_net_pnl=sum(t.net_pnl for t in non_error_trades),
    )


@router.get("/equity-curve", response_model=EquityCurveResponse)
async def get_equity_curve(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    use_nav: bool = True,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get equity curve data for the active account.
    Prioritizes AccountEquity (NAV) data if available, falls back to trade-based calculation.
    """
    account_id = x_account_id or "default"

    if use_nav:
        nav_query = (
            select(AccountEquity)
            .where(AccountEquity.account_id == account_id)
            .order_by(AccountEquity.date)
        )
        if start_date:
            nav_query = nav_query.where(AccountEquity.date >= start_date)
        if end_date:
            nav_query = nav_query.where(AccountEquity.date <= end_date)

        nav_result = await db.execute(nav_query)
        nav_records = nav_result.scalars().all()

        if nav_records:
            equity_curve = []
            base_equity = nav_records[0].total_equity
            prev_equity = base_equity

            for record in nav_records:
                daily_pnl = record.total_equity - prev_equity
                pnl_from_base = record.total_equity - base_equity

                equity_curve.append(DailyPnL(
                    date=record.date,
                    net_pnl=daily_pnl,
                    cumulative_pnl=pnl_from_base,
                    adjusted_pnl=daily_pnl,
                    cumulative_adjusted_pnl=pnl_from_base,
                    trade_count=0,
                ))
                prev_equity = record.total_equity

            final_pnl = nav_records[-1].total_equity - base_equity
            return EquityCurveResponse(data=equity_curve, total_pnl=final_pnl, potential_pnl=final_pnl, use_nav_data=True)

    # Fallback: trade-based calculation
    query = (
        select(Trade)
        .where(Trade.account_id == account_id)
        .order_by(func.coalesce(Trade.exit_date, Trade.entry_date))
    )
    if start_date:
        query = query.where(func.coalesce(Trade.exit_date, Trade.entry_date) >= start_date)
    if end_date:
        query = query.where(func.coalesce(Trade.exit_date, Trade.entry_date) <= end_date)

    result = await db.execute(query)
    trades = result.scalars().all()

    daily_data: dict = defaultdict(lambda: {"net_pnl": 0.0, "adjusted_pnl": 0.0, "count": 0})

    for trade in trades:
        day = trade.exit_date or trade.entry_date
        daily_data[day]["net_pnl"] += trade.net_pnl
        daily_data[day]["count"] += 1
        if not trade.is_error:
            daily_data[day]["adjusted_pnl"] += trade.net_pnl

    equity_curve = []
    cumulative_pnl = 0.0
    cumulative_adjusted = 0.0

    for day in sorted(daily_data.keys()):
        data = daily_data[day]
        cumulative_pnl += data["net_pnl"]
        cumulative_adjusted += data["adjusted_pnl"]

        equity_curve.append(DailyPnL(
            date=day,
            net_pnl=data["net_pnl"],
            cumulative_pnl=cumulative_pnl,
            adjusted_pnl=data["adjusted_pnl"],
            cumulative_adjusted_pnl=cumulative_adjusted,
            trade_count=data["count"],
        ))

    return EquityCurveResponse(data=equity_curve, total_pnl=cumulative_pnl, potential_pnl=cumulative_adjusted, use_nav_data=False)


@router.get("/annual", response_model=AnnualMetricsResponse)
async def get_annual_metrics(
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get annual metrics for the active account."""
    account_id = x_account_id or "default"
    result = await db.execute(select(Trade).where(Trade.account_id == account_id))
    trades = result.scalars().all()

    annual_data: dict = defaultdict(lambda: {"net_pnl": 0.0, "trade_count": 0, "winning_trades": 0, "losing_trades": 0})

    for trade in trades:
        if trade.is_error:
            continue
        trade_date = trade.exit_date or trade.entry_date
        year = trade_date.year
        annual_data[year]["net_pnl"] += trade.net_pnl
        annual_data[year]["trade_count"] += 1
        if trade.net_pnl > 0:
            annual_data[year]["winning_trades"] += 1
        elif trade.net_pnl < 0:
            annual_data[year]["losing_trades"] += 1

    data = [
        AnnualMetrics(
            year=year,
            net_pnl=metrics["net_pnl"],
            trade_count=metrics["trade_count"],
            winning_trades=metrics["winning_trades"],
            losing_trades=metrics["losing_trades"],
        )
        for year, metrics in sorted(annual_data.items())
    ]
    return AnnualMetricsResponse(data=data)


@router.get("/nav-activity/{year}", response_model=NAVActivityResponse)
async def get_nav_activity(
    year: int,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get NAV-based daily activity data for Trading Activity component, scoped to the active account.
    """
    account_id = x_account_id or "default"
    start_of_year = date(year, 1, 1)
    end_of_year = date(year, 12, 31)

    nav_query = (
        select(AccountEquity)
        .where(AccountEquity.account_id == account_id)
        .order_by(AccountEquity.date)
    )
    nav_result = await db.execute(nav_query)
    all_nav_records = nav_result.scalars().all()

    pre_year_records = [r for r in all_nav_records if r.date < start_of_year]
    year_records = [r for r in all_nav_records if start_of_year <= r.date <= end_of_year]

    if not year_records:
        return NAVActivityResponse(days=[], year=year)

    trade_result = await db.execute(
        select(
            func.coalesce(Trade.exit_date, Trade.entry_date).label("trade_date"),
            func.count(Trade.id).label("trade_count"),
        )
        .where(and_(
            Trade.account_id == account_id,
            func.coalesce(Trade.exit_date, Trade.entry_date) >= start_of_year,
            func.coalesce(Trade.exit_date, Trade.entry_date) <= end_of_year,
        ))
        .group_by(func.coalesce(Trade.exit_date, Trade.entry_date))
    )
    trade_counts = {row.trade_date: row.trade_count for row in trade_result}

    baseline = pre_year_records[-1].total_equity if pre_year_records else year_records[0].total_equity
    activity_days = []
    prev_equity = baseline

    for record in year_records:
        daily_pnl = record.total_equity - prev_equity
        trade_date = record.date
        trade_count = trade_counts.get(trade_date, 0)

        activity_days.append(NAVActivityDay(
            date=trade_date,
            pnl=daily_pnl,
            trade_count=trade_count,
            starting_balance=prev_equity,
            intensity=0,
        ))
        prev_equity = record.total_equity

    if activity_days:
        max_abs_pnl = max(abs(d.pnl) for d in activity_days) or 1
        for day in activity_days:
            if day.pnl == 0:
                day.intensity = 0
            else:
                ratio = abs(day.pnl) / max_abs_pnl
                base_intensity = int(ratio * 4) + 1
                day.intensity = min(base_intensity, 4) * (-1 if day.pnl < 0 else 1)

    return NAVActivityResponse(days=activity_days, year=year)


@router.get("/nav-history")
async def get_nav_history(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get NAV/Account Equity history for the active account."""
    account_id = x_account_id or "default"
    query = (
        select(AccountEquity)
        .where(AccountEquity.account_id == account_id)
        .order_by(AccountEquity.date)
    )
    if start_date:
        query = query.where(AccountEquity.date >= start_date)
    if end_date:
        query = query.where(AccountEquity.date <= end_date)

    result = await db.execute(query)
    records = result.scalars().all()
    return {"data": [r.to_dict() for r in records], "total": len(records)}


@router.get("/heatmap/{year}", response_model=HeatmapResponse)
async def get_heatmap(
    year: int,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get heatmap calendar data for a specific year, scoped to the active account."""
    account_id = x_account_id or "default"
    start_of_year = date(year, 1, 1)
    end_of_year = date(year, 12, 31)

    result = await db.execute(
        select(Trade).where(and_(
            Trade.account_id == account_id,
            func.coalesce(Trade.exit_date, Trade.entry_date) >= start_of_year,
            func.coalesce(Trade.exit_date, Trade.entry_date) <= end_of_year,
        ))
    )
    trades = result.scalars().all()

    daily_pnl: dict = defaultdict(lambda: {"pnl": 0.0, "count": 0})
    for trade in trades:
        trade_date = trade.exit_date or trade.entry_date
        daily_pnl[trade_date]["pnl"] += trade.net_pnl
        daily_pnl[trade_date]["count"] += 1

    max_abs_pnl = max((abs(d["pnl"]) for d in daily_pnl.values()), default=1)

    heatmap_days = []
    for day, data in sorted(daily_pnl.items()):
        if data["pnl"] == 0:
            intensity = 0
        else:
            ratio = abs(data["pnl"]) / max_abs_pnl if max_abs_pnl > 0 else 0
            base_intensity = int(ratio * 4) + 1
            intensity = min(base_intensity, 4)
            if data["pnl"] < 0:
                intensity = -intensity

        heatmap_days.append(HeatmapDay(date=day, pnl=data["pnl"], trade_count=data["count"], intensity=intensity))

    return HeatmapResponse(days=heatmap_days, year=year)


@router.get("/strategies")
async def get_strategies(
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get list of unique strategies used in the active account."""
    account_id = x_account_id or "default"
    result = await db.execute(
        select(Trade.strategy)
        .where(Trade.account_id == account_id, Trade.strategy.isnot(None))
        .distinct()
    )
    strategies = [row[0] for row in result.all() if row[0]]
    return {"strategies": sorted(strategies)}


@router.get("/tickers")
async def get_tickers(
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get list of unique tickers traded in the active account."""
    account_id = x_account_id or "default"
    result = await db.execute(
        select(Trade.ticker)
        .where(Trade.account_id == account_id)
        .distinct()
        .order_by(Trade.ticker)
    )
    tickers = [row[0] for row in result.all()]
    return {"tickers": tickers}
