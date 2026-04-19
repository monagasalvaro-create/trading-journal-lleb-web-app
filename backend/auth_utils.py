"""
Shared authentication utilities for routers.

Provides a clean interface for extracting the authenticated user_id
from request state (injected by JWTAuthMiddleware).

Usage in routers:
    from auth_utils import get_user_id_from_request

    @router.get("/example")
    async def example(request: Request, ...):
        user_id = get_user_id_from_request(request)
        # user_id is None when running locally without auth (backwards compatible)
"""
from fastapi import Request


def get_user_id_from_request(request: Request) -> str | None:
    """Extract user_id injected by JWTAuthMiddleware.

    Returns None when:
    - Running in local mode without authentication
    - The route is on the exempt list (health check, auth routes)

    Routers must apply user_id filtering only when user_id is not None.
    This preserves backwards compatibility with local single-user mode.
    """
    return getattr(request.state, "user_id", None)
