import os
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
import logging

router = APIRouter(prefix="/api/downloads", tags=["downloads"])
logger = logging.getLogger(__name__)

@router.get("/connector/latest")
async def get_latest_connector():
    """
    Get the download link for the latest TJ Connector release.
    Redirects to the community landing page.
    """
    community_url = os.getenv("COMMUNITY_DOWNLOAD_URL", "https://tudominio.com/descargas")
    logger.info("Redirecting to community download URL: %s", community_url)
    return RedirectResponse(url=community_url, status_code=302)
