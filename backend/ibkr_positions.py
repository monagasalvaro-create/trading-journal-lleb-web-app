import asyncio
import logging
from ib_insync import IB
# database, select, models, Settings - not strictly needed if we just take port as arg
# But assets.py passes port.

logger = logging.getLogger(__name__)

def _fetch_open_positions_sync(port=7497):
    try:
        import nest_asyncio
    except ImportError:
        return {"success": False, "message": "ib_insync/nest_asyncio not installed"}

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    nest_asyncio.apply(loop)

    ib = IB()
    try:
        # Use a distinct client ID to avoid conflicts with other scripts
        ib.connect('127.0.0.1', port, clientId=37, timeout=10)
    except Exception as e:
        loop.close()
        return {"success": False, "message": f"Could not connect to IBKR: {e}"}

    try:
        positions = ib.positions()
        orders = ib.reqAllOpenOrders()
        
        # Build a set of symbols that have an open STOP order
        stop_symbols = set()
        for order in orders:
            # STOP orders usually have orderType STP, STP PRT, TRAIL, etc.
            if order.order.orderType in ("STP", "STP LMT", "TRAIL", "TRAIL LMT"):
                # Use localSymbol if available, else symbol
                sym = order.contract.localSymbol or order.contract.symbol
                if sym:
                    stop_symbols.add(sym)
                    
        results = []
        for p in positions:
            if p.position == 0:
                continue
            
            sym = p.contract.localSymbol or p.contract.symbol
            # A position has a stop if its symbol is in stop_symbols
            has_stop = sym in stop_symbols
            
            # Extract relevant fields
            results.append({
                "symbol": sym,
                "secType": p.contract.secType,
                "position": p.position,
                "avgCost": p.avgCost,
                "currency": p.contract.currency,
                "conId": p.contract.conId,
                "right": getattr(p.contract, "right", ""),  # 'C' or 'P' for options
                "has_stop": has_stop,
            })
            
        ib.disconnect()
        loop.close()
        return {"success": True, "positions": results}
        
    except Exception as e:
        ib.disconnect()
        loop.close()
        return {"success": False, "message": f"Error fetching positions: {e}"}

async def fetch_open_positions(port=7497):
    """
    Async wrapper for fetching positions in a separate thread.
    """
    return await asyncio.to_thread(_fetch_open_positions_sync, port)
