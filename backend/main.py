"""
My Trading Journal Pro - FastAPI Backend
Main application entry point with CORS configuration and router imports.
"""
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import logging

from database import init_db
from routers import trades, metrics, sync, settings, assets, strike_calculator, portfolio, accounts, downloads
from routers import auth as auth_router
from auth_middleware import JWTAuthMiddleware


def get_frontend_path():
    """Get the path to frontend/dist, handling PyInstaller bundle."""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'frontend', 'dist')
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    # Startup
    logger.info("Starting Trading Journal API...")
    await init_db()
    logger.info("Database initialized")
    yield
    # Shutdown
    logger.info("Shutting down Trading Journal API...")


app = FastAPI(
    title="My Trading Journal Pro API",
    description="High-performance trading journal with financial analytics and IBKR integration",
    version="2.0.0",
    lifespan=lifespan
)

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    trace_err = traceback.format_exc()
    logger.error(f"Global Error: {trace_err}")
    return JSONResponse(status_code=500, content={"error": "Internal Server Error", "traceback": trace_err})

# CORS configuration — restricted to specific origins in production.
# Set ALLOWED_ORIGINS env var as a comma-separated list for production.
_ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT authentication middleware — validates Bearer tokens on all /api routes
# except /api/auth/* and /api/health (which are exempt).
app.add_middleware(JWTAuthMiddleware)

# Include routers
app.include_router(auth_router.router)
app.include_router(trades.router)
app.include_router(metrics.router)
app.include_router(sync.router)
app.include_router(settings.router)
app.include_router(assets.router)
app.include_router(strike_calculator.router)
app.include_router(portfolio.router)
app.include_router(accounts.router)
app.include_router(downloads.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# --- Static Files and SPA Support ---
# Mount static assets (JS, CSS, images)
frontend_path = get_frontend_path()
if os.path.exists(frontend_path):
    assets_path = os.path.join(frontend_path, 'assets')
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


@app.get("/")
async def serve_index():
    """Serve the main index.html for SPA."""
    index_file = os.path.join(get_frontend_path(), 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type='text/html')
    return {"error": "Frontend not found", "path": index_file}


@app.get("/{path:path}")
async def serve_spa(path: str):
    """Catch-all route for SPA - serves static files or falls back to index.html."""
    frontend = get_frontend_path()
    file_path = os.path.join(frontend, path)
    
    # If path starts with 'api', it's a 404 (API route not found)
    if path.startswith('api/'):
        return {"error": "API endpoint not found"}
    
    # If specific file exists, serve it
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Otherwise serve index.html for client-side routing
    index_file = os.path.join(frontend, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file, media_type='text/html')
    
    return {"error": "Not found", "path": path}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
