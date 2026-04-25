import os
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
import logging

router = APIRouter(prefix="/api/downloads", tags=["downloads"])
logger = logging.getLogger(__name__)

_REPO = "monagasalvaro-create/trading-journal-lleb-web-app"
_RELEASES_LATEST = f"https://github.com/{_REPO}/releases/latest"


@router.get("/connector/latest")
async def get_latest_connector(request: Request):
    """
    Redirect to the TJ Bridge binary for the user's platform.
    Detects Windows/macOS via User-Agent; falls back to the releases page.
    Override default with COMMUNITY_DOWNLOAD_URL env var.
    """
    override = os.getenv("COMMUNITY_DOWNLOAD_URL")
    if override:
        logger.info("Connector download → COMMUNITY_DOWNLOAD_URL: %s", override)
        return RedirectResponse(url=override, status_code=302)

    ua = request.headers.get("user-agent", "").lower()
    if "windows" in ua:
        url = f"{_RELEASES_LATEST}/download/TJ_Connector_Windows.zip"
    elif "mac" in ua or "darwin" in ua:
        url = f"{_RELEASES_LATEST}/download/TJ_Connector_macOS.zip"
    else:
        url = _RELEASES_LATEST

    logger.info("Connector download → %s", url)
    return RedirectResponse(url=url, status_code=302)
