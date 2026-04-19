"""
JWT Authentication Middleware for Trading Journal Pro.

Validates the Bearer token on every protected request and injects `request.state.user_id`
so routers can filter data by the authenticated user.

Exempt routes (no token required):
  - /api/auth/*    (login, register, refresh)
  - /api/health    (uptime check)
  - /              (SPA index)
  - /assets/*      (static frontend assets)
"""
import os
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# Public routes that do NOT require authentication.
# Evaluated as prefix matches — any route starting with these paths is exempt.
_EXEMPT_PREFIXES = (
    "/api/auth/",
    "/api/health",
    "/assets/",
)

_EXEMPT_EXACT = {"/", ""}


def _is_exempt(path: str) -> bool:
    """Return True if the request path does not require a JWT token."""
    if path in _EXEMPT_EXACT:
        return True
    return any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that validates JWT tokens on every API request.

    On success: injects request.state.user_id for downstream routers.
    On failure: returns 401 JSON response immediately.
    Non-API routes (SPA catch-all) are passed through without checking.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Non-API requests (SPA HTML/JS/CSS) bypass auth entirely.
        if not path.startswith("/api"):
            return await call_next(request)

        # Routes explicitly marked as public.
        if _is_exempt(path):
            return await call_next(request)

        # Extract and validate the Bearer token.
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authentication token"},
            )

        token = auth_header.removeprefix("Bearer ").strip()
        user_id = _decode_token(token)

        if user_id is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired authentication token"},
            )

        # Inject user_id into request state for use by routers.
        request.state.user_id = user_id
        return await call_next(request)


def _decode_token(token: str) -> str | None:
    """Decode and validate a JWT access token. Returns user_id or None on failure."""
    secret = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        # Reject refresh tokens being used as access tokens.
        if token_type != "access":
            return None
        return user_id
    except JWTError:
        return None
