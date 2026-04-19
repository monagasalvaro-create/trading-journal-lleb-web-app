"""
Trading Journal Pro - Main Application Entry Point
Launches the FastAPI backend and opens the system's default browser.
Replaces the pywebview-based native window approach for cross-platform compatibility.
"""
import os
import sys
import threading
import uvicorn
import time
import webbrowser
import urllib.request
import urllib.error
import logging
from pathlib import Path


# Fix SSL certificate verification issues for bundled macOS apps
import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context


# --- Ensure backend bare imports resolve correctly ---
# backend/main.py uses bare imports like `from database import init_db`.
# In the frozen bundle, these modules live inside the `backend/` subdirectory.
# We add that directory to sys.path so Python can find them.
IS_FROZEN = getattr(sys, "frozen", False)
if IS_FROZEN:
    _backend_path = os.path.join(sys._MEIPASS, "backend")
else:
    _backend_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")

if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)


from backend.main import app as backend_app


# --- Platform Detection ---
IS_WINDOWS = sys.platform == "win32"
IS_MACOS = sys.platform == "darwin"
IS_FROZEN = getattr(sys, "frozen", False)


# --- Logging Configuration ---
def setup_logging():
    """Configure file-based logging for diagnostics.
    Logs are stored in ~/.tradingjournal/logs/ on all platforms.
    """
    log_dir = Path.home() / ".tradingjournal" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "app.log"

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_file, mode="a"),
        ],
    )
    return logging.getLogger("TradingJournalPro")


logger = setup_logging()


# --- Platform-Specific: Hide Console Window ---
def hide_console_window():
    """Hide the console window on Windows when running as a packaged .exe.
    This is a Windows-only operation using the Win32 API.
    On macOS, .app bundles don't show a console by default.
    """
    if not (IS_WINDOWS and IS_FROZEN):
        return

    try:
        import ctypes
        kernel32 = ctypes.WinDLL("kernel32")
        user32 = ctypes.WinDLL("user32")
        console_window = kernel32.GetConsoleWindow()
        if console_window:
            user32.ShowWindow(console_window, 0)  # SW_HIDE = 0
    except Exception:
        pass


# Execute immediately at startup (no-op on macOS)
hide_console_window()


# --- Resource Path Resolution ---
def get_resource_path(relative_path):
    """Get the correct path for resources bundled with PyInstaller.
    Handles both development mode and frozen (packaged) mode.
    """
    if IS_FROZEN:
        # PyInstaller stores bundled files in sys._MEIPASS
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)


# --- Backend Server ---
def wait_for_backend(host="127.0.0.1", port=8000, timeout=30):
    """Wait for the FastAPI backend to become responsive before opening the browser."""
    url = f"http://{host}:{port}/api/health"
    start_time = time.time()
    logger.info(f"Waiting for backend at {url}...")

    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    logger.info("Backend is ready")
                    return True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            pass
        time.sleep(0.1)

    logger.error(f"Backend did not respond within {timeout} seconds")
    return False


def start_backend():
    """Start the FastAPI server in a background thread."""
    logger.info("Starting FastAPI backend...")
    try:
        uvicorn.run(backend_app, host="127.0.0.1", port=8000, log_level="error")
    except Exception as e:
        logger.exception(f"Backend error: {e}")


# --- Main Application ---
def start_app():
    """Launch the backend and open the system browser. No native window required."""
    logger.info("=" * 50)
    logger.info("STARTING TRADING JOURNAL PRO")
    logger.info(f"Platform: {sys.platform}")
    logger.info(f"Frozen: {IS_FROZEN}")
    logger.info(f"Python: {sys.version}")

    # Verify frontend assets exist
    frontend_dir = get_resource_path(os.path.join("frontend", "dist"))
    logger.info(f"Frontend dir: {frontend_dir}")

    if not os.path.exists(frontend_dir):
        logger.error(f"Frontend directory not found: {frontend_dir}")
        return

    # Start backend server in a separate thread
    logger.info("Starting backend thread...")
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()

    # Wait for backend to be ready before opening the browser
    if not wait_for_backend():
        logger.error("Backend failed to start - aborting")
        return

    app_url = "http://127.0.0.1:8000"
    logger.info(f"Opening browser at: {app_url}")

    # Open the user's default browser instead of a native pywebview window.
    # This eliminates all cross-platform compatibility issues (WebView2, Gatekeeper, etc.)
    webbrowser.open(app_url)

    # Keep the process alive while the backend server runs.
    # The backend thread is a daemon, so it will stop when this process exits.
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down Trading Journal Pro")


if __name__ == "__main__":
    try:
        start_app()
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        sys.exit(1)