"""
TJ Connector — Entry Point
Starts the micro-API server and shows a system tray icon.
Opens the Trading Journal web app in the default browser on launch.

Architecture:
  - api.py runs a FastAPI server on localhost:8765 (background thread)
  - pystray manages the system tray icon on Mac and Windows
  - The web app polls /status to detect if the Connector is running
"""
import threading
import webbrowser
import logging
import time
import sys
from pathlib import Path

# ─── Logging ──────────────────────────────────────────────────────────────────
log_dir = Path.home() / ".tj-connector" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(log_dir / "connector.log", mode="a"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("TJConnector")

# ─── Constants ────────────────────────────────────────────────────────────────
# Replace with actual deployed URL before packaging
WEB_APP_URL = "https://trading-journal-lleb-web-app-production.up.railway.app"
CONNECTOR_PORT = 8765


def start_api_server():
    """Start the FastAPI micro-server on localhost:8765 (daemon thread)."""
    import uvicorn
    from api import app

    logger.info("Starting TJ Connector API on localhost:%d", CONNECTOR_PORT)
    uvicorn.run(
        app,
        host="127.0.0.1",  # ONLY localhost — never 0.0.0.0 (security requirement)
        port=CONNECTOR_PORT,
        log_level="error",
    )


def create_tray_icon():
    """Create and return a pystray system tray icon."""
    try:
        import pystray
        from PIL import Image, ImageDraw

        # Generate a simple icon programmatically (no external file needed)
        icon_size = 64
        img = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Purple circle background
        draw.ellipse([4, 4, icon_size - 4, icon_size - 4], fill=(99, 102, 241, 255))
        # "TJ" text placeholder (simple rectangle as visual marker)
        draw.rectangle([20, 22, 44, 42], fill=(255, 255, 255, 220))

        def open_app(icon, item):
            webbrowser.open(WEB_APP_URL)

        def quit_connector(icon, item):
            logger.info("TJ Connector shutting down via tray")
            icon.stop()

        icon = pystray.Icon(
            "TJ Connector",
            icon=img,
            menu=pystray.Menu(
                pystray.MenuItem("Open Trading Journal", open_app, default=True),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Quit TJ Connector", quit_connector),
            ),
        )
        return icon

    except ImportError:
        logger.warning("pystray/PIL not available — running without system tray")
        return None


def main():
    """Main entry point: start API, open browser, show tray icon."""
    logger.info("=" * 40)
    logger.info("TJ CONNECTOR STARTING")
    logger.info("Web App URL: %s", WEB_APP_URL)
    logger.info("Connector Port: %d", CONNECTOR_PORT)

    # 1. Start the FastAPI micro-server in background
    api_thread = threading.Thread(target=start_api_server, daemon=True)
    api_thread.start()

    # 2. Brief wait for the API to bind to port before opening browser
    time.sleep(1.5)

    # 3. Open the web app in the default browser
    logger.info("Opening web app in browser")
    webbrowser.open(WEB_APP_URL)

    # 4. Show system tray icon (blocks until user chooses Quit)
    icon = create_tray_icon()
    if icon:
        logger.info("System tray icon active")
        icon.run()
    else:
        # Fallback: keep process alive without tray
        logger.info("Running without tray — press Ctrl+C to quit")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("TJ Connector stopped")


if __name__ == "__main__":
    main()
