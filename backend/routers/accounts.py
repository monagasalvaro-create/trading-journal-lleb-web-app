"""
Accounts router — CRUD of user trading accounts.
Each Settings row represents one independent trading account.
Accounts isolate: trades, account_equity, asset_board_items.
Preserved across account switches: board_notes (user annotations).
"""
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database import get_db
from models import Settings, Trade, AccountEquity, AssetBoardItem
from schemas import AccountCreate, AccountRename, AccountSummary
from crypto import decrypt
from auth_utils import get_user_id_from_request

router = APIRouter(prefix="/api/accounts", tags=["accounts"])
logger = logging.getLogger(__name__)


def _build_summary(settings: Settings) -> dict:
    """Build AccountSummary dict from a Settings ORM object."""
    return {
        "id": settings.id,
        "account_name": settings.account_name or "Account 1",
        "has_credentials": bool(settings.flex_token and settings.query_id),
        "last_sync_at": settings.last_sync_at,
        "updated_at": settings.updated_at,
    }


@router.get("", response_model=list[AccountSummary])
async def list_accounts(request: Request, db: AsyncSession = Depends(get_db)):
    """Return all trading accounts ordered by creation time (oldest first)."""
    user_id = get_user_id_from_request(request)
    query = select(Settings)
    if user_id:
        query = query.where(Settings.user_id == user_id)
    result = await db.execute(query.order_by(Settings.updated_at.asc()))
    accounts = result.scalars().all()

    # If no accounts exist yet, create the default one
    if not accounts:
        default = Settings(id="default", account_name="Account 1", user_id=user_id or "system")
        db.add(default)
        await db.commit()
        await db.refresh(default)
        accounts = [default]

    return [_build_summary(a) for a in accounts]


@router.post("", response_model=AccountSummary, status_code=201)
async def create_account(data: AccountCreate, request: Request, db: AsyncSession = Depends(get_db)):
    """Create a new trading account with the given display name."""
    user_id = get_user_id_from_request(request)
    new_id = str(uuid.uuid4())
    account = Settings(
        id=new_id,
        account_name=data.account_name,
        user_id=user_id or "system",
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    logger.info("Created new account: %s (%s)", data.account_name, new_id)
    return _build_summary(account)


@router.put("/{account_id}/rename", response_model=AccountSummary)
async def rename_account(
    account_id: str,
    data: AccountRename,
    db: AsyncSession = Depends(get_db),
):
    """Rename an existing trading account."""
    result = await db.execute(select(Settings).where(Settings.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    account.account_name = data.account_name
    await db.commit()
    await db.refresh(account)
    logger.info("Renamed account %s to: %s", account_id, data.account_name)
    return _build_summary(account)


@router.delete("/{account_id}")
async def delete_account(account_id: str, db: AsyncSession = Depends(get_db)):
    """
    Delete an account and all its associated trading data.
    board_notes are deliberately preserved as user annotations.
    Cannot delete the last remaining account.
    """
    # Prevent deleting the last account
    count_result = await db.execute(select(Settings))
    all_accounts = count_result.scalars().all()
    if len(all_accounts) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the last account. Create another account first."
        )

    result = await db.execute(select(Settings).where(Settings.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Delete all account-scoped data
    trades_result = await db.execute(delete(Trade).where(Trade.account_id == account_id))
    nav_result = await db.execute(delete(AccountEquity).where(AccountEquity.account_id == account_id))
    assets_result = await db.execute(
        delete(AssetBoardItem).where(AssetBoardItem.account_id == account_id)
    )

    await db.delete(account)
    await db.commit()

    logger.info(
        "Deleted account %s: %d trades, %d NAV records, %d board items removed",
        account_id, trades_result.rowcount, nav_result.rowcount, assets_result.rowcount,
    )
    return {
        "success": True,
        "message": f"Account deleted along with {trades_result.rowcount} trades and {nav_result.rowcount} NAV records.",
    }
