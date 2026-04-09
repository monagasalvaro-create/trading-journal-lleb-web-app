import asyncio
import logging
from ib_insync import IB, Stock, Option, Future, Forex, Index, Contract

logger = logging.getLogger(__name__)

def _fetch_portfolio_sync(port=7497):
    try:
        import nest_asyncio
    except ImportError:
        return {"success": False, "message": "ib_insync/nest_asyncio not installed"}

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    nest_asyncio.apply(loop)

    ib = IB()
    try:
        # Use a distinct client ID
        # Reduced timeout to 4 seconds to avoid long hangs
        ib.connect('127.0.0.1', port, clientId=38, timeout=4)
    except Exception as e:
        loop.close()
        return {"success": False, "message": f"Could not connect to IBKR: {e}"}

    try:
        # 1. Get Account Summary
        # Tags: NetLiquidation,TotalCashValue,GrossPositionValue,BuyingPower (Implicitly all?)
        summary_items = ib.accountSummary('All')
        
        summary_values = {} # tag -> {currency -> value}
        debug_summary = []
        
        for item in summary_items:
            # item has account, tag, value, currency
            tag = item.tag
            val = 0.0
            try:
                val = float(item.value)
            except:
                pass
            
            # Add to debug list
            debug_summary.append({
                "account": item.account,
                "tag": item.tag,
                "value": item.value,
                "currency": item.currency,
                "modelCode": item.modelCode if hasattr(item, 'modelCode') else ""
            })
                
            if tag not in summary_values:
                summary_values[tag] = {}
            summary_values[tag][item.currency] = val

        # Helper to pick best currency value
        def pick_value(tag_name):
            vals = summary_values.get(tag_name, {})
            # Prioritize USD
            if 'USD' in vals:
                return vals['USD']
            # Prioritize 'BASE' if exists (some setups)
            if 'BASE' in vals:
                 return vals['BASE']
            # Fallback: largest value? Or simply the first one?
            if vals:
                return max(vals.values())
            return 0.0

        net_liquidation = pick_value('NetLiquidationByCurrency') 
        if net_liquidation == 0.0:
            net_liquidation = pick_value('NetLiquidation') # Fallback if tag changes?

        cash_balance = pick_value('TotalCashBalance')
        if cash_balance == 0.0:
            cash_balance = pick_value('CashBalance')

        invested_capital = pick_value('GrossPositionValue')
        if invested_capital == 0.0:
            # Calculate from components if missing
            invested_capital = pick_value('StockMarketValue') + pick_value('OptionMarketValue') + pick_value('FutureOptionValue')

        buying_power = pick_value('BuyingPower')

        summary = {
            "net_liquidation": net_liquidation,
            "cash_balance": cash_balance,
            "invested_capital": invested_capital,
            "buying_power": buying_power,
            "currency": "USD" # We assume USD for display
        }

        # 2. Get Portfolio Items (includes IBKR-computed market values & P&L)
        # ib.portfolio() returns PortfolioItem objects with:
        #   contract, position, marketPrice, marketValue, averageCost,
        #   unrealizedPNL, realizedPNL, account
        # This is more accurate than manually requesting market data snapshots,
        # especially for options where avgCost already includes the multiplier.
        portfolio_raw = ib.portfolio()

        # Clean up for JSON response
        clean_positions = []
        for p in portfolio_raw:
            if p.position == 0:
                continue

            c = p.contract
            multiplier = int(c.multiplier) if c.multiplier else 1

            # IBKR's averageCost for options is per-share (already divided by multiplier)
            # while for stocks it's per-share as well.
            avg_cost_per_share = p.averageCost
            # For options, the total cost basis is averageCost * position * multiplier
            total_cost = avg_cost_per_share * abs(p.position) * multiplier

            # P&L percent from cost basis
            pnl_pct = 0.0
            if total_cost != 0:
                pnl_pct = (p.unrealizedPNL / total_cost) * 100

            clean_positions.append({
                "conId": c.conId,
                "symbol": c.symbol,
                "secType": c.secType,
                "expiry": c.lastTradeDateOrContractMonth if c.secType == 'OPT' else None,
                "strike": c.strike if c.secType == 'OPT' else None,
                "right": c.right if c.secType == 'OPT' else None,
                "position": p.position,
                "avgCost": avg_cost_per_share,
                "marketPrice": p.marketPrice,
                "marketValue": p.marketValue,
                "unrealizedPNL": p.unrealizedPNL,
                "unrealizedPNLPercent": pnl_pct,
                "currency": c.currency,
            })

        ib.disconnect()
        loop.close()
        
        return {
            "success": True, 
            "summary": summary, 
            "positions": clean_positions,
            "updated_at": import_datetime().now().isoformat(),
            "debug_summary": debug_summary
        }
        
    except Exception as e:
        ib.disconnect()
        loop.close()
        logger.error(f"Error checking portfolio: {e}")
        return {"success": False, "message": f"Error fetching portfolio: {e}"}

def import_datetime():
    from datetime import datetime
    return datetime

async def fetch_portfolio_data(port=7497):
    """
    Async wrapper
    """
    return await asyncio.to_thread(_fetch_portfolio_sync, port)
