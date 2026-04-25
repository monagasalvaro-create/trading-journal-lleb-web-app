"""Shared pytest fixtures for the backend test suite.

Add fixtures for the async test DB, HTTPX client, and JWT-authenticated
users as the test suite grows. Tests must exercise tenant isolation.
"""

# These files are manual exploration scripts, not pytest tests.
# Exclude them from collection to prevent import-time side effects.
collect_ignore = [
    "test_api.py",
    "test_ibkr.py",
    "test_sync_client.py",
    "test_sync_local.py",
]
