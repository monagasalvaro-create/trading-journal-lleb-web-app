"""
Authentication router for Trading Journal Pro.

Endpoints:
  POST /api/auth/register  — Create a new user account
  POST /api/auth/login     — Authenticate and receive JWT tokens
  POST /api/auth/refresh   — Renew access token using refresh token
  GET  /api/auth/me        — Return current authenticated user's profile

Token strategy:
  - access_token:  TTL 15 minutes, used for API calls
  - refresh_token: TTL 7 days, used only to renew access_token
"""
import os
import uuid
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from jose import JWTError, jwt

from database import get_db
from models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- Password hashing ---
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- JWT config ---
_JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
_ALGORITHM = "HS256"
_ACCESS_TOKEN_TTL_MINUTES = 15
_REFRESH_TOKEN_TTL_DAYS = 7


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: str | None
    is_active: bool


# ─── Token helpers ────────────────────────────────────────────────────────────

def _create_access_token(user_id: str) -> str:
    """Create a short-lived JWT access token."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=_ACCESS_TOKEN_TTL_MINUTES)
    payload = {"sub": user_id, "type": "access", "exp": expires}
    return jwt.encode(payload, _JWT_SECRET, algorithm=_ALGORITHM)


def _create_refresh_token(user_id: str) -> str:
    """Create a long-lived JWT refresh token."""
    expires = datetime.now(timezone.utc) + timedelta(days=_REFRESH_TOKEN_TTL_DAYS)
    payload = {"sub": user_id, "type": "refresh", "exp": expires}
    return jwt.encode(payload, _JWT_SECRET, algorithm=_ALGORITHM)


def _decode_refresh_token(token: str) -> str | None:
    """Decode a refresh token. Returns user_id or None if invalid."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Fails if email is already taken."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    new_user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        password_hash=_pwd_context.hash(body.password),
    )
    db.add(new_user)
    await db.flush()  # Populate created_at from DB server_default
    await db.refresh(new_user)

    logger.info("New user registered: %s", body.email)
    return TokenResponse(
        access_token=_create_access_token(new_user.id),
        refresh_token=_create_refresh_token(new_user.id),
        user=new_user.to_dict(),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate a user and return JWT tokens."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Use a constant-time comparison to prevent timing attacks.
    password_valid = user is not None and _pwd_context.verify(body.password, user.password_hash)

    if not password_valid or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    logger.info("User logged in: %s", body.email)
    return TokenResponse(
        access_token=_create_access_token(user.id),
        refresh_token=_create_refresh_token(user.id),
        user=user.to_dict(),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Issue a new access token using a valid refresh token."""
    user_id = _decode_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )

    return TokenResponse(
        access_token=_create_access_token(user.id),
        refresh_token=_create_refresh_token(user.id),  # Rotate refresh token on each use
        user=user.to_dict(),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Return the profile of the currently authenticated user."""
    # user_id is injected by JWTAuthMiddleware
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return UserResponse(
        id=user.id,
        email=user.email,
        created_at=user.created_at.isoformat() if user.created_at else None,
        is_active=user.is_active,
    )
