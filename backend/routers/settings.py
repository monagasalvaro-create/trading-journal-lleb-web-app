"""
Settings router for managing application configuration and IBKR credentials.
Supports multi-account isolation via X-Account-ID request header.
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import logging
from typing import Optional

from database import get_db
from models import Settings
from schemas import SettingsUpdate, SettingsResponse
from crypto import encrypt, decrypt
from auth_utils import get_user_id_from_request

router = APIRouter(prefix="/api/settings", tags=["settings"])

logger = logging.getLogger(__name__)

IBKR_FLEX_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"


async def get_or_create_settings(db: AsyncSession, account_id: str = "default", user_id: str = "system") -> Settings:
    """Get existing settings for account_id + user_id or create with defaults."""
    result = await db.execute(
        select(Settings).where(Settings.id == account_id, Settings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = Settings(id=account_id, account_name="Account 1", user_id=user_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return settings


@router.get("", response_model=SettingsResponse)
async def get_settings(
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get current settings for the active account (token is masked)."""
    user_id = get_user_id_from_request(request) or "system"
    account_id = x_account_id or "default"
    settings = await get_or_create_settings(db, account_id, user_id)
    return settings.to_dict(mask_token=True, decrypt_fn=decrypt)


@router.put("", response_model=SettingsResponse)
async def update_settings(
    data: SettingsUpdate,
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Update settings for the active account."""
    user_id = get_user_id_from_request(request) or "system"
    account_id = x_account_id or "default"
    settings = await get_or_create_settings(db, account_id, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            # Encrypt sensitive fields before persisting
            if key == "flex_token":
                setattr(settings, key, encrypt(value))
            else:
                setattr(settings, key, value)

    await db.commit()
    await db.refresh(settings)

    return settings.to_dict(mask_token=True, decrypt_fn=decrypt)


@router.post("/test")
async def test_connection(
    request: Request,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Test IBKR connection with stored credentials for the active account."""
    user_id = get_user_id_from_request(request) or "system"
    account_id = x_account_id or "default"
    settings = await get_or_create_settings(db, account_id, user_id)

    decrypted_token = decrypt(settings.flex_token) if settings.flex_token else None
    if not decrypted_token or not settings.query_id:
        raise HTTPException(
            status_code=400,
            detail="No IBKR credentials configured. Please add Flex Token and Query ID.",
        )

    async with httpx.AsyncClient() as client:
        try:
            params = {
                "t": decrypted_token,
                "q": settings.query_id,
                "v": "3",
            }

            response = await client.get(IBKR_FLEX_URL, params=params, timeout=15.0)
            response_text = response.text

            if "Success" in response_text:
                return {"success": True, "message": "Connection to IBKR successful! Credentials are valid."}
            elif "Error" in response_text or "Invalid" in response_text:
                return {"success": False, "message": f"IBKR rejected credentials: {response_text[:200]}"}
            else:
                return {"success": True, "message": "Connection established. Response received from IBKR."}

        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timed out. IBKR servers may be slow."}
        except httpx.HTTPError as e:
            return {"success": False, "message": f"HTTP error: {str(e)}"}
        except Exception as e:
            logger.error(f"IBKR test connection error: {e}")
            return {"success": False, "message": f"Error testing connection: {str(e)}"}
