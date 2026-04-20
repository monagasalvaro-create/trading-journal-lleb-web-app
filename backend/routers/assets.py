from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, update, delete
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import date, datetime
import logging

from database import get_db
from models import AssetBoardItem, Trade, BoardNote
from routers.settings import get_or_create_settings
from ibkr_account import fetch_net_liquidation
from ibkr_positions import fetch_open_positions
from auth_utils import get_user_id_from_request

router = APIRouter(prefix="/api/assets", tags=["assets"])
logger = logging.getLogger(__name__)

class AssetCreate(BaseModel):
    symbol: str
    board_type: str
    column_id: str
    date: date

class NoteCreate(BaseModel):
    date: date
    content: str

class AssetMove(BaseModel):
    column_id: str
    position: int

class AssetResponse(BaseModel):
    id: int
    symbol: str
    board_type: str
    column_id: str
    position: int
    invested_amount: Optional[float] = None
    net_pnl: Optional[float] = None
    is_closed: bool = False
    has_stop: Optional[bool] = None
    date: date

# ── Capital Allocation ─────────────────────────────────────────────
_STOCK_COL_WEIGHTS = {"60": 0.60, "30": 0.30, "10": 0.10}

@router.get("/capital-allocation")
async def capital_allocation(
    request: Request,
    target_date: date = None,
    net_liquidation: Optional[float] = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()

    try:
        settings = await get_or_create_settings(db, account_id, user_id_str)
        port = settings.ibkr_socket_port or 7497
        stocks_pct = (settings.portfolio_stocks_pct if settings.portfolio_stocks_pct is not None else 70.0) / 100.0
        options_pct = (settings.portfolio_options_pct if settings.portfolio_options_pct is not None else 30.0) / 100.0
    except Exception as exc:
        logger.error("Failed to read settings for capital allocation: %s", exc)
        return {
            "net_liquidation": None,
            "stocks_pct": 70.0,
            "options_pct": 30.0,
            "segments": {},
            "options_allocation": None,
            "error": f"Failed to read settings: {exc}",
        }

    if net_liquidation is None:
        return {
            "net_liquidation": None,
            "stocks_pct": stocks_pct * 100,
            "options_pct": options_pct * 100,
            "segments": {},
            "options_allocation": None,
            "error": "Client did not provide net_liquidation",
        }

    net_liq = net_liquidation
    stocks_pool = net_liq * stocks_pct
    options_pool = net_liq * options_pct

    result = await db.execute(
        select(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == "portfolio",
            AssetBoardItem.date == target_date,
        )
    )
    portfolio_assets = result.scalars().all()

    stock_counts: Dict[str, int] = {"60": 0, "30": 0, "10": 0}
    for asset in portfolio_assets:
        if asset.column_id in stock_counts:
            stock_counts[asset.column_id] += 1

    segments: Dict[str, Any] = {}
    for col_id, weight in _STOCK_COL_WEIGHTS.items():
        total = round(stocks_pool * weight, 2)
        n = stock_counts[col_id]
        per_asset = round(total / n, 2) if n > 0 else 0.0
        segments[col_id] = {
            "total": total,
            "asset_count": n,
            "per_asset": per_asset,
        }

    result = await db.execute(
        select(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == "options",
            AssetBoardItem.date == target_date,
        )
    )
    options_assets = result.scalars().all()

    options_count = sum(1 for a in options_assets if a.column_id in ("calls", "puts"))
    options_per_asset = round(options_pool / options_count, 2) if options_count > 0 else 0.0

    options_allocation = {
        "total": round(options_pool, 2),
        "asset_count": options_count,
        "per_asset": options_per_asset,
        "one_third_five_pct": round((options_pool * 0.05) / 3, 2),
    }

    return {
        "net_liquidation": round(net_liq, 2),
        "stocks_pct": round(stocks_pct * 100, 1),
        "options_pct": round(options_pct * 100, 1),
        "segments": segments,
        "options_allocation": options_allocation,
        "error": None,
    }


# ── Sync Positions ─────────────────────────────────────────────────

async def _build_positions_from_trades(
    db: AsyncSession,
    target_date: date,
    account_id: str,
    user_id_str: str,
) -> list[dict]:
    stmt = select(Trade).where(
        Trade.account_id == account_id,
        Trade.user_id == user_id_str,
        Trade.entry_date <= target_date,
        or_(Trade.exit_date == None, Trade.exit_date >= target_date),
    )
    result = await db.execute(stmt)
    trades = result.scalars().all()

    positions: list[dict] = []
    for t in trades:
        sec_type = "OPT" if t.asset_class == "OPT" else "STK"
        invested_amt = abs(t.quantity * t.entry_price * (t.multiplier or 1))

        has_exit = t.exit_date is not None and t.exit_date <= target_date
        trade_is_closed = has_exit and (t.net_pnl is not None and t.net_pnl != 0)

        if sec_type == "OPT":
            if t.put_call == "C":
                target_col = "calls"
            elif t.put_call == "P":
                target_col = "puts"
            else:
                target_col = "underlying"
        else:
            target_col = "active"

        positions.append({
            "symbol": t.ticker,
            "secType": sec_type,
            "invested_amount": invested_amt,
            "net_pnl": t.net_pnl if trade_is_closed else None,
            "is_closed": trade_is_closed,
            "target_col": target_col,
        })
    return positions


async def _upsert_and_reconcile(
    db: AsyncSession,
    target_date: date,
    positions: list[dict],
    account_id: str,
    user_id_str: str,
) -> int:
    processed_count = 0

    for p in positions:
        symbol = p["symbol"]
        sec_type = p["secType"]
        invested_amt = p.get("invested_amount") or (
            abs(p.get("position", 0) * p.get("avgCost", 0))
        )
        pnl = p.get("net_pnl")
        closed = p.get("is_closed", False)
        has_stop = p.get("has_stop")

        if sec_type == "STK":
            board_type = "portfolio"
            target_col = p.get("target_col", "active")
        elif sec_type == "OPT":
            board_type = "options"
            if "target_col" in p:
                target_col = p["target_col"]
            else:
                right = p.get("right", "")
                if right == "C":
                    target_col = "calls"
                elif right == "P":
                    target_col = "puts"
                elif "C" in symbol and "P" not in symbol:
                    target_col = "calls"
                elif "P" in symbol:
                    target_col = "puts"
                else:
                    target_col = "underlying"
        else:
            continue

        stmt = select(AssetBoardItem).where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.symbol == symbol,
            AssetBoardItem.board_type == board_type,
            AssetBoardItem.date == target_date,
        )
        result = await db.execute(stmt)
        existing_item = result.scalar_one_or_none()

        if existing_item:
            existing_item.invested_amount = invested_amt
            existing_item.net_pnl = pnl
            existing_item.is_closed = closed
            existing_item.has_stop = has_stop
            if closed:
                existing_item.column_id = target_col
        else:
            db.add(AssetBoardItem(
                account_id=account_id,
                user_id=user_id_str,
                symbol=symbol,
                board_type=board_type,
                column_id=target_col,
                date=target_date,
                position=0,
                invested_amount=invested_amt,
                net_pnl=pnl,
                is_closed=closed,
                has_stop=has_stop,
            ))
        processed_count += 1

    synced_stock_symbols = {p["symbol"] for p in positions if p["secType"] == "STK"}
    synced_option_symbols = {p["symbol"] for p in positions if p["secType"] == "OPT"}

    for board, symbols in [("portfolio", synced_stock_symbols), ("options", synced_option_symbols)]:
        stale_stmt = select(AssetBoardItem).where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == board,
            AssetBoardItem.date == target_date,
            AssetBoardItem.invested_amount.is_not(None),
        )
        if symbols:
            stale_stmt = stale_stmt.where(AssetBoardItem.symbol.notin_(symbols))
            
        stale_result = await db.execute(stale_stmt)
        for item in stale_result.scalars().all():
            await db.delete(item)

    return processed_count


from pydantic import BaseModel, Field

class SyncClientPositionsRequest(BaseModel):
    positions: List[dict]


@router.post("/sync-client-positions")
async def sync_client_positions(
    payload: SyncClientPositionsRequest,
    request: Request,
    target_date: date = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """
    Called by the frontend after it fetches live positions from the local TJ Connector.
    Stores/reconciles them in the Railway backend securely.
    """
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()

    processed_count = await _upsert_and_reconcile(db, target_date, payload.positions, account_id, user_id_str)
    await db.commit()

    return {
        "status": "success",
        "message": f"Synced {processed_count} live positions from TJ Connector",
        "source": "client_ibkr",
        "details": payload.positions,
    }

@router.post("/sync-positions")
async def sync_positions(
    request: Request,
    target_date: date = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()

    is_today = target_date == date.today()

    if is_today:
        settings_res = await get_or_create_settings(db, account_id, user_id_str)
        port = settings_res.ibkr_socket_port

        pos_result = await fetch_open_positions(port)
        if not pos_result["success"]:
            raise HTTPException(status_code=500, detail=pos_result["message"])

        positions = pos_result["positions"]
        source = "ibkr"
    else:
        positions = await _build_positions_from_trades(db, target_date, account_id, user_id_str)
        source = "trades_db"

    processed_count = await _upsert_and_reconcile(db, target_date, positions, account_id, user_id_str)
    await db.commit()

    return {
        "status": "success",
        "message": f"Synced {processed_count} positions",
        "source": source,
        "details": positions,
    }


# ── CRUD Endpoints ─────────────────────────────────────────────────

@router.get("/", response_model=List[AssetResponse])
async def get_assets(
    request: Request,
    target_date: date = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()

    result = await db.execute(
        select(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.date == target_date
        )
        .order_by(AssetBoardItem.position)
    )
    assets = result.scalars().all()
    return [asset.to_dict() for asset in assets]

@router.post("/", response_model=AssetResponse)
async def create_asset(
    request: Request,
    asset: AssetCreate,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    
    result = await db.execute(
        select(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == asset.board_type,
            AssetBoardItem.column_id == asset.column_id,
            AssetBoardItem.date == asset.date,
        )
        .order_by(AssetBoardItem.position.desc())
    )
    last_item = result.scalars().first()
    new_position = (last_item.position + 1) if last_item else 0

    new_asset = AssetBoardItem(
        account_id=account_id,
        user_id=user_id_str,
        symbol=asset.symbol,
        board_type=asset.board_type,
        column_id=asset.column_id,
        position=new_position,
        date=asset.date,
    )
    db.add(new_asset)
    await db.commit()
    await db.refresh(new_asset)
    return new_asset.to_dict()

@router.delete("/{asset_id}")
async def delete_asset(
    request: Request,
    asset_id: int, 
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db)
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    
    result = await db.execute(
        select(AssetBoardItem).where(
            AssetBoardItem.id == asset_id,
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str
        )
    )
    asset = result.scalar_one_or_none()
    
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    
    await db.delete(asset)
    await db.commit()
    return {"success": True}

@router.put("/{asset_id}/move")
async def move_asset(
    request: Request,
    asset_id: int, 
    move_data: AssetMove, 
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db)
):
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    
    result = await db.execute(
        select(AssetBoardItem).where(
            AssetBoardItem.id == asset_id,
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str
        )
    )
    asset = result.scalar_one_or_none()
    
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    asset.column_id = move_data.column_id
    asset.position = move_data.position
    
    await db.commit()
    return {"success": True}

@router.delete("/board/{board_type}")
async def clear_board(
    request: Request,
    board_type: str,
    target_date: date = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    if board_type not in ['portfolio', 'options']:
        raise HTTPException(status_code=400, detail="Invalid board type")
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    
    if target_date is None:
        target_date = date.today()

    await db.execute(
        delete(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == board_type,
            AssetBoardItem.date == target_date,
        )
    )
    await db.commit()
    return {"success": True}

@router.post("/board/{board_type}/reset")
async def reset_board(
    request: Request,
    board_type: str,
    target_date: date = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    if board_type == 'portfolio':
        default_col = 'active'
    elif board_type == 'options':
        default_col = 'underlying'
    else:
        raise HTTPException(status_code=400, detail="Invalid board type")
    account_id = x_account_id or "default"
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()

    await db.execute(
        update(AssetBoardItem)
        .where(
            AssetBoardItem.account_id == account_id,
            AssetBoardItem.user_id == user_id_str,
            AssetBoardItem.board_type == board_type,
            AssetBoardItem.date == target_date,
        )
        .values(column_id=default_col)
    )
    await db.commit()
    return {"success": True}

@router.get("/notes/{board_type}")
async def get_notes(
    request: Request,
    board_type: str, 
    target_date: date = None, 
    db: AsyncSession = Depends(get_db)
):
    user_id_str = get_user_id_from_request(request) or "system"
    if target_date is None:
        target_date = date.today()
    
    result = await db.execute(
        select(BoardNote)
        .where(
            BoardNote.board_type == board_type,
            BoardNote.date == target_date,
            BoardNote.user_id == user_id_str
        )
    )
    note = result.scalars().first()
    if note:
        return note.to_dict()
    return {"content": ""}

@router.post("/notes/{board_type}")
async def save_note(
    request: Request,
    board_type: str, 
    note_data: NoteCreate, 
    db: AsyncSession = Depends(get_db)
):
    user_id_str = get_user_id_from_request(request) or "system"
    
    result = await db.execute(
        select(BoardNote)
        .where(
            BoardNote.board_type == board_type,
            BoardNote.date == note_data.date,
            BoardNote.user_id == user_id_str
        )
    )
    existing_note = result.scalars().first()
    
    if existing_note:
        existing_note.content = note_data.content
        existing_note.updated_at = func.now()
    else:
        new_note = BoardNote(
            board_type=board_type,
            date=note_data.date,
            content=note_data.content,
            user_id=user_id_str
        )
        db.add(new_note)
    
    await db.commit()
    return {"success": True}
