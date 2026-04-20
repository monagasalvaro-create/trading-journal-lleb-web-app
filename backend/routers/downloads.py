from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
import httpx
import logging

router = APIRouter(prefix="/api/downloads", tags=["downloads"])
logger = logging.getLogger(__name__)

REPO_OWNER = "monagasalvaro-create"
REPO_NAME = "trading-journal-lleb-web-app"
GITHUB_LATEST_RELEASE_URL = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"

@router.get("/connector/latest")
async def get_latest_connector(platform: str = Query(..., regex="^(mac|win)$")):
    """
    Get the download link for the latest TJ Connector release.
    Redirects to the actual GitHub release asset URL.
    """
    try:
        # We need an explicit User-Agent for GitHub's API
        headers = {"User-Agent": "Trading-Journal-Backend"}
        async with httpx.AsyncClient() as client:
            resp = await client.get(GITHUB_LATEST_RELEASE_URL, headers=headers, timeout=10.0)
            
            if resp.status_code != 200:
                logger.error("Failed to fetch latest release from GitHub: %s", resp.text)
                raise HTTPException(status_code=502, detail="Failed to fetch release info from GitHub")
                
            release_data = resp.json()
            assets = release_data.get("assets", [])
            
            # Determine target asset suffix
            target_suffix = "_macOS.zip" if platform == "mac" else "_Windows.zip"
            
            for asset in assets:
                name = asset.get("name", "")
                if name.endswith(target_suffix):
                    download_url = asset.get("browser_download_url")
                    if download_url:
                        return RedirectResponse(url=download_url, status_code=302)
                        
            raise HTTPException(status_code=404, detail=f"No asset found for platform {platform}")
            
    except httpx.RequestError as exc:
        logger.error("HTTP Request to GitHub failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to communicate with GitHub API")
