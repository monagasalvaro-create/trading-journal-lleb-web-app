"""
IBKR Flex Service sync router - Integration with Interactive Brokers.
Handles both Trades and NAV (Equity) data from Flex Query XML.
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
import httpx
import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta
from typing import Optional, List, Tuple
import logging
import os

from database import get_db
from models import Trade, AccountEquity, Settings
from schemas import IBKRSyncRequest, IBKRSyncResponse
from crypto import decrypt
from auth_utils import get_user_id_from_request

router = APIRouter(prefix="/api/sync", tags=["sync"])

logger = logging.getLogger(__name__)

IBKR_FLEX_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"
IBKR_FLEX_DOWNLOAD_URL = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement"


async def fetch_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    max_retries: int = 3
) -> httpx.Response:
    """Fetch URL with exponential backoff retry logic."""
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            return response
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            last_exception = e
            wait_time = (2 ** attempt) * 1
            logger.warning(f"IBKR request failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(wait_time)
    
    raise HTTPException(
        status_code=502,
        detail=f"Failed to connect to IBKR after {max_retries} attempts: {last_exception}"
    )


def parse_date(date_str: str) -> Optional[date]:
    """Parse IBKR date format to Python date."""
    if not date_str:
        return None
    try:
        # IBKR uses YYYYMMDD format
        return datetime.strptime(date_str, "%Y%m%d").date()
    except ValueError:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None


def parse_trades_from_xml(xml_content: str) -> List[dict]:
    """
    Parse IBKR Flex XML response into trade dictionaries with options support.
    Aggregates partial fills by Symbol + Date + Buy/Sell direction.
    """
    from collections import defaultdict
    
    try:
        root = ET.fromstring(xml_content)
        
        trades_section = root.find(".//Trades")
        logger.debug("Trades section found: %s", trades_section is not None)
        
        # Find all Trade elements
        all_trade_elems = root.findall(".//Trade")
        logger.debug("Total <Trade> elements in XML: %d", len(all_trade_elems))
        
        # Dictionary to aggregate trades by Symbol + Date + BuySell
        # Key: (symbol, date, buy_sell)
        # Value: accumulated trade data
        aggregated_trades = defaultdict(lambda: {
            "quantity": 0.0,
            "total_cost": 0.0,  # For weighted average price calculation
            "commissions": 0.0,
            "realized_pnl": 0.0,
            "underlying_symbol": None,
            "asset_class": "STK",
            "strike": None,
            "expiry": None,
            "put_call": None,
            "multiplier": 1,
            "entry_time": None,
        })
        
        for idx, trade_elem in enumerate(all_trade_elems):
            attrib = trade_elem.attrib
            
            # Log first few trade attributes for diagnostics
            if idx < 5:
                relevant_attrs = {k: v for k, v in attrib.items() if k in [
                    'symbol', 'tradeDate', 'tradeTime', 'dateTime', 'quantity', 'tradePrice', 
                    'fifoPnlRealized', 'realizedPnl', 'ibCommission', 'buySell'
                ]}
                logger.debug("Trade %d: %s", idx, relevant_attrs)
            
            ticker = attrib.get("symbol", "")
            
            # Get date from tradeDate or dateTime
            date_str = attrib.get("tradeDate", "")
            time_str = attrib.get("tradeTime")  # IBKR often sends time separately
            
            # If no tradeDate, try to get from dateTime (format: YYYYMMDD;HH:MM:SS)
            if not date_str and attrib.get("dateTime"):
                dt_parts = attrib.get("dateTime", "").split(";")
                if len(dt_parts) > 0:
                    date_str = dt_parts[0]
                if len(dt_parts) > 1 and not time_str:
                    time_str = dt_parts[1]
            
            # Also try to get time from dateTime even if tradeDate exists
            if not time_str and attrib.get("dateTime") and ";" in attrib.get("dateTime", ""):
                dt_parts = attrib.get("dateTime", "").split(";")
                if len(dt_parts) > 1:
                    time_str = dt_parts[1]
            
            entry_date = parse_date(date_str)
            
            if not ticker or not entry_date:
                continue
            
            # Get buy/sell direction
            buy_sell = attrib.get("buySell", "").upper()
            if not buy_sell:
                # Infer from quantity sign
                qty = float(attrib.get("quantity", 0) or 0)
                buy_sell = "BUY" if qty > 0 else "SELL"
            
            # Extract financial data
            quantity = abs(float(attrib.get("quantity", 0) or 0))
            trade_price = float(attrib.get("tradePrice", 0) or 0)
            commission = abs(float(attrib.get("ibCommission", 0) or attrib.get("commission", 0) or 0))
            
            # Get realized P&L - prefer realizedPnl, then fifoPnlRealized
            realized_pnl = 0.0
            pnl_str = attrib.get("realizedPnl", "") or attrib.get("fifoPnlRealized", "") or ""
            if pnl_str:
                try:
                    realized_pnl = float(pnl_str)
                except ValueError:
                    pass
            
            # Create aggregation key
            agg_key = (ticker, entry_date, buy_sell)
            
            # Aggregate values
            agg = aggregated_trades[agg_key]
            agg["quantity"] += quantity
            agg["total_cost"] += quantity * trade_price  # For weighted avg
            agg["commissions"] += commission
            agg["realized_pnl"] += realized_pnl
            
            # Capture asset class info (use first occurrence)
            asset_class = attrib.get("assetCategory", "STK")
            if agg["asset_class"] == "STK" and asset_class != "STK":
                agg["asset_class"] = asset_class
                agg["underlying_symbol"] = attrib.get("underlyingSymbol", "") or None
                
                if asset_class == "OPT":
                    strike_str = attrib.get("strike", "")
                    agg["strike"] = float(strike_str) if strike_str else None
                    agg["expiry"] = parse_date(attrib.get("expiry", ""))
                    agg["put_call"] = attrib.get("putCall", "") or None
                    multiplier_str = attrib.get("multiplier", "100")
                    agg["multiplier"] = int(float(multiplier_str)) if multiplier_str else 100

            # Capture Time (first occurrence usually fine for aggregation, or could take min/max)
            if not agg["entry_time"] and time_str:
                agg["entry_time"] = time_str
        
        # Convert aggregated trades to final trade list
        trades = []
        for (ticker, entry_date, buy_sell), agg in aggregated_trades.items():
            # Calculate weighted average price
            avg_price = agg["total_cost"] / agg["quantity"] if agg["quantity"] > 0 else 0
            
            # Create unique ID using ticker + date + direction
            order_id = f"{buy_sell}_{entry_date.isoformat()}"
            
            trade_data = {
                "ticker": ticker,
                "underlying_symbol": agg["underlying_symbol"],
                "entry_date": entry_date,
                "entry_time": agg["entry_time"],
                "exit_date": entry_date,
                "quantity": agg["quantity"],
                "entry_price": avg_price,
                "exit_price": avg_price,
                "commissions": agg["commissions"],
                "net_pnl": agg["realized_pnl"],
                "gross_pnl": agg["realized_pnl"] + agg["commissions"],
                "order_id": order_id,
                "asset_class": agg["asset_class"],
                "strike": agg["strike"],
                "expiry": agg["expiry"],
                "put_call": agg["put_call"],
                "multiplier": agg["multiplier"],
            }
            
            trades.append(trade_data)
        
        logger.debug("Aggregated into %d trades from %d executions", len(trades), len(all_trade_elems))
        return trades
            
    except ET.ParseError as e:
        logger.error(f"Failed to parse IBKR XML: {e}")
        logger.debug("XML Parse Error: %s", e)
        raise HTTPException(status_code=400, detail=f"Invalid XML response from IBKR: {e}")
    
    return trades


def parse_nav_from_xml(xml_content: str) -> List[dict]:
    """Parse NAV/Equity data from IBKR Flex XML."""
    nav_records = []
    
    try:
        root = ET.fromstring(xml_content)
        
        # Try different possible NAV section names - including the correct IBKR tag
        nav_sections = [
            ".//EquitySummaryByReportDateInBase",  # Primary IBKR tag
            ".//EquitySummaryInBase",
            ".//EquitySummary", 
            ".//NAV",
            ".//CashReport"
        ]
        
        logger.debug("Searching for NAV sections...")
        
        for section_path in nav_sections:
            found_elements = root.findall(section_path)
            logger.debug("%s: found %d elements", section_path, len(found_elements))
            
            for idx, nav_elem in enumerate(found_elements):
                attrib = nav_elem.attrib
                
                if idx < 5:
                    logger.debug("%s[%d] attributes: %s", section_path, idx, dict(attrib))
                
                # Get date - try different attribute names
                date_str = attrib.get("reportDate", "") or attrib.get("toDate", "") or attrib.get("date", "")
                nav_date = parse_date(date_str)
                
                if idx < 5:
                    logger.debug("RAW date_str='%s' -> PARSED nav_date=%s", date_str, nav_date)
                
                if not nav_date:
                    logger.debug("Skipping element %d: no valid date (date_str=%s)", idx, date_str)
                    continue
                
                # Get equity values - try different attribute names
                total_str = attrib.get("total", "") or attrib.get("netLiquidation", "") or attrib.get("totalEquity", "") or attrib.get("endingCash", "")
                total_equity = float(total_str) if total_str else 0
                
                if total_equity == 0:
                    logger.debug("Skipping element %d: total_equity is 0", idx)
                    continue
                
                # Get cash value
                cash_str = attrib.get("cash", "") or attrib.get("endingCash", "")
                cash = float(cash_str) if cash_str else None
                
                # Get securities value
                securities_str = attrib.get("stock", "") or attrib.get("longStockValue", "")
                securities = float(securities_str) if securities_str else None
                
                # Get P&L values
                unrealized_str = attrib.get("unrealizedPL", "")
                unrealized = float(unrealized_str) if unrealized_str else None
                
                realized_str = attrib.get("realizedPL", "")
                realized = float(realized_str) if realized_str else None
                
                # IBKR Flex Reports use the market close date, but IBKR mobile app
                # shows the same data with +1 day. Add 1 day to match IBKR mobile convention.
                adjusted_date = nav_date + timedelta(days=1)
                
                nav_records.append({
                    "date": adjusted_date,
                    "total_equity": total_equity,
                    "cash_balance": cash,
                    "securities_value": securities,
                    "unrealized_pnl": unrealized,
                    "realized_pnl": realized
                })
        
        logger.debug("Total NAV records before dedup: %d", len(nav_records))
        
        # Remove duplicates by date (keep most recent)
        seen_dates = {}
        for record in nav_records:
            seen_dates[record["date"]] = record
        
        result = list(seen_dates.values())
        logger.debug("Total NAV records after dedup: %d", len(result))
        return result
        
    except ET.ParseError as e:
        logger.error(f"Failed to parse NAV XML: {e}")
        logger.debug("NAV XML Parse Error: %s", e)
        return []


async def get_stored_credentials(db: AsyncSession, account_id: str) -> Tuple[Optional[str], Optional[str]]:
    """Get stored IBKR credentials from Settings for the given account."""
    result = await db.execute(select(Settings).where(Settings.id == account_id))
    settings = result.scalar_one_or_none()

    if settings:
        return decrypt(settings.flex_token) if settings.flex_token else None, settings.query_id
    return None, None


@router.post("", response_model=IBKRSyncResponse)
async def sync_ibkr(
    request: Request,
    body: IBKRSyncRequest = None,
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync trades and NAV from IBKR Flex Service for the active account.
    Uses stored credentials if none provided in request.
    """
    account_id = x_account_id or "default"
    user_id = get_user_id_from_request(request)
    # Get credentials - prefer request params, fallback to stored for the active account
    token = body.token if body and body.token else None
    query_id = body.query_id if body and body.query_id else None

    if not token or not query_id:
        stored_token, stored_query_id = await get_stored_credentials(db, account_id)
        token = token or stored_token
        query_id = query_id or stored_query_id

    if not token or not query_id:
        return IBKRSyncResponse(
            success=False,
            message="No IBKR credentials provided. Configure in Settings or provide token and query_id."
        )
    
    # Disable SSL verification to prevent CERTIFICATE_VERIFY_FAILED in packaged apps on macOS
    async with httpx.AsyncClient(verify=False) as client:
        # Step 1: Request the report
        request_params = {
            "t": token,
            "q": query_id,
            "v": "3"
        }
        
        try:
            response = await fetch_with_retry(client, IBKR_FLEX_URL, request_params)
            request_xml = response.text
            
            # Parse reference code from response
            request_root = ET.fromstring(request_xml)
            status = request_root.find("Status")
            
            if status is None or status.text != "Success":
                error_msg = request_root.find("ErrorMessage")
                error_text = error_msg.text if error_msg is not None else "Unknown error"
                return IBKRSyncResponse(
                    success=False,
                    message=f"IBKR request failed: {error_text}"
                )
            
            reference_code = request_root.find("ReferenceCode")
            if reference_code is None:
                return IBKRSyncResponse(
                    success=False,
                    message="No reference code in IBKR response"
                )
            
            # Step 2: Wait and download the report
            await asyncio.sleep(2)
            
            download_params = {
                "t": token,
                "q": reference_code.text,
                "v": "3"
            }
            
            download_response = await fetch_with_retry(client, IBKR_FLEX_DOWNLOAD_URL, download_params)
            xml_content = download_response.text
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"IBKR sync error: {e}")
            return IBKRSyncResponse(
                success=False,
                message=f"Error communicating with IBKR: {str(e)}"
            )
        
        logger.debug("XML downloaded: %d characters", len(xml_content))
        
        # Step 3: Parse trades
        trades_data = parse_trades_from_xml(xml_content)
        nav_data = parse_nav_from_xml(xml_content)
        
        logger.debug("Trades found by parser: %d", len(trades_data))
        logger.debug("NAV records found: %d", len(nav_data))
        
        # Step 4: Upsert trades
        imported = 0
        updated = 0
        
        for trade_data in trades_data:
            trade_id = Trade.generate_id(
                trade_data["ticker"],
                trade_data["entry_date"],
                trade_data.get("order_id"),
                account_id=account_id
            )

            # Scope lookup to this account to prevent cross-account collisions
            result = await db.execute(
                select(Trade).where(Trade.id == trade_id, Trade.account_id == account_id)
            )
            existing_trade = result.scalar_one_or_none()

            if existing_trade:
                # Update existing trade (preserve psychology tags, strategy and notes)
                for key in ["net_pnl", "gross_pnl", "commissions", "quantity",
                           "entry_price", "exit_price", "asset_class", "strike",
                           "expiry", "put_call", "multiplier", "underlying_symbol", "entry_time"]:
                    if key in trade_data and trade_data[key] is not None:
                        setattr(existing_trade, key, trade_data[key])
                updated += 1
            else:
                # Create new trade scoped to this account
                new_trade = Trade(
                    id=trade_id,
                    account_id=account_id,
                    user_id=user_id or "system",
                    ticker=trade_data["ticker"],
                    underlying_symbol=trade_data.get("underlying_symbol"),
                    entry_date=trade_data["entry_date"],
                    exit_date=trade_data["exit_date"],
                    quantity=trade_data["quantity"],
                    entry_price=trade_data["entry_price"],
                    exit_price=trade_data["exit_price"],
                    commissions=trade_data["commissions"],
                    net_pnl=trade_data["net_pnl"],
                    gross_pnl=trade_data["gross_pnl"],
                    asset_class=trade_data.get("asset_class", "STK"),
                    strike=trade_data.get("strike"),
                    expiry=trade_data.get("expiry"),
                    put_call=trade_data.get("put_call"),
                    multiplier=trade_data.get("multiplier", 1),
                    entry_time=trade_data.get("entry_time")
                )
                db.add(new_trade)
                imported += 1
        
        # Step 5: Upsert NAV records
        nav_imported = 0
        
        for nav_record in nav_data:
            # Check if record exists for this account + date
            result = await db.execute(
                select(AccountEquity).where(
                    AccountEquity.account_id == account_id,
                    AccountEquity.date == nav_record["date"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.total_equity = nav_record["total_equity"]
                existing.cash_balance = nav_record.get("cash_balance")
                existing.securities_value = nav_record.get("securities_value")
                existing.unrealized_pnl = nav_record.get("unrealized_pnl")
                existing.realized_pnl = nav_record.get("realized_pnl")
            else:
                new_nav = AccountEquity(
                    account_id=account_id,
                    date=nav_record["date"],
                    total_equity=nav_record["total_equity"],
                    cash_balance=nav_record.get("cash_balance"),
                    securities_value=nav_record.get("securities_value"),
                    unrealized_pnl=nav_record.get("unrealized_pnl"),
                    realized_pnl=nav_record.get("realized_pnl")
                )
                db.add(new_nav)
                nav_imported += 1
        
        # Step 6: Record sync timestamp for this account
        result = await db.execute(select(Settings).where(Settings.id == account_id))
        settings_row = result.scalar_one_or_none()
        if settings_row:
            settings_row.last_sync_at = datetime.utcnow()
        else:
            db.add(Settings(id=account_id, account_name="Account 1", last_sync_at=datetime.utcnow()))
            
        try:
            await db.commit()
        except Exception as e:
            import traceback
            raise HTTPException(status_code=500, detail=traceback.format_exc())

        logger.info("Sync complete: %d imported, %d updated, %d NAV records", imported, updated, nav_imported)
        
        message = f"Sync completed: {imported} new trades, {updated} updated"
        if nav_imported > 0:
            message += f", {nav_imported} NAV records"
        
        return IBKRSyncResponse(
            success=True,
            message=message,
            trades_imported=imported,
            trades_updated=updated,
            nav_records_imported=nav_imported
        )


@router.get("/last-sync")
async def get_last_sync(
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Get the timestamp of the most recent sync operation for the active account."""
    account_id = x_account_id or "default"

    result = await db.execute(
        select(Trade.entry_date)
        .where(Trade.account_id == account_id)
        .order_by(Trade.entry_date.desc())
        .limit(1)
    )
    last_trade_date = result.scalar_one_or_none()

    result = await db.execute(
        select(Settings.last_sync_at).where(Settings.id == account_id)
    )
    last_sync_at = result.scalar_one_or_none()

    if not last_sync_at:
        result = await db.execute(
            select(Trade.created_at)
            .where(Trade.account_id == account_id)
            .order_by(Trade.created_at.desc())
            .limit(1)
        )
        fallback = result.scalar_one_or_none()
        last_sync_at = fallback

    last_sync = last_sync_at.isoformat() if last_sync_at else None

    return {
        "last_sync": last_sync,
        "last_trade_date": last_trade_date.isoformat() if last_trade_date else None,
    }

@router.delete("/purge")
async def purge_trading_data(
    x_account_id: Optional[str] = Header(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """Delete all trades and NAV records for the active account (clean re-sync)."""
    account_id = x_account_id or "default"

    trades_result = await db.execute(
        delete(Trade).where(Trade.account_id == account_id)
    )
    nav_result = await db.execute(
        delete(AccountEquity).where(AccountEquity.account_id == account_id)
    )

    result = await db.execute(select(Settings).where(Settings.id == account_id))
    settings_row = result.scalar_one_or_none()
    if settings_row:
        settings_row.last_sync_at = None

    await db.commit()

    trades_deleted = trades_result.rowcount
    nav_deleted = nav_result.rowcount
    logger.info("Purge complete for %s: %d trades, %d NAV records deleted", account_id, trades_deleted, nav_deleted)

    return {
        "success": True,
        "message": f"Cleared {trades_deleted} trades and {nav_deleted} NAV records.",
        "trades_deleted": trades_deleted,
        "nav_deleted": nav_deleted,
    }


@router.post("/demo-data")
async def create_demo_data(db: AsyncSession = Depends(get_db)):
    """Create demo trading data for testing/demonstration (DEV MODE ONLY)."""
    is_dev = os.getenv("TRADING_JOURNAL_DEV", "false").lower() == "true"
    if not is_dev:
        raise HTTPException(status_code=403, detail="Demo data is only available in development mode")

    import random
    from datetime import timedelta
    
    tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ", "AMD"]
    strategies = [
        "Sol Naciente", "Amanecer Tardío", "Marea", "Tsunami",
        "Amanecer Rojo", "Eclipse Solar", "La Cresta de la Ola"
    ]
    psychology_tags = ["none", "fomo", "revenge_trading", "premature_exit", "rule_violation"]
    
    base_date = date.today() - timedelta(days=180)
    trades_created = 0
    base_equity = 25000.0
    cumulative_pnl = 0.0
    
    # Generate 100 trades and matching NAV records
    for i in range(100):
        trade_date = base_date + timedelta(days=random.randint(0, 180))
        ticker = random.choice(tickers)
        
        is_winner = random.random() < 0.55
        if is_winner:
            net_pnl = random.uniform(50, 800)
        else:
            net_pnl = random.uniform(-500, -20)
        
        commissions = random.uniform(0.50, 5.00)
        psychology_tag = random.choices(
            psychology_tags,
            weights=[0.7, 0.1, 0.08, 0.07, 0.05]
        )[0]
        
        trade_id = Trade.generate_id(ticker, trade_date, str(i))
        
        result = await db.execute(select(Trade).where(Trade.id == trade_id))
        if result.scalar_one_or_none():
            continue
        
        trade = Trade(
            id=trade_id,
            ticker=ticker,
            entry_date=trade_date,
            exit_date=trade_date,
            quantity=random.randint(10, 500),
            entry_price=random.uniform(50, 500),
            exit_price=random.uniform(50, 500),
            commissions=commissions,
            net_pnl=net_pnl,
            gross_pnl=net_pnl + commissions,
            strategy=random.choice(strategies),
            psychology_tag=psychology_tag,
            is_error=psychology_tag != "none"
        )
        
        db.add(trade)
        trades_created += 1
        cumulative_pnl += net_pnl
    
    # Generate NAV history
    nav_created = 0
    current_equity = base_equity
    
    for day_offset in range(181):
        nav_date = base_date + timedelta(days=day_offset)
        
        # Check if NAV exists
        result = await db.execute(select(AccountEquity).where(AccountEquity.date == nav_date))
        if result.scalar_one_or_none():
            continue
        
        # Simulate daily change
        daily_change = random.uniform(-200, 300)
        current_equity += daily_change
        current_equity = max(current_equity, base_equity * 0.5)  # Min 50% of starting
        
        nav = AccountEquity(
            date=nav_date,
            total_equity=current_equity,
            cash_balance=current_equity * 0.3,
            securities_value=current_equity * 0.7
        )
        db.add(nav)
        nav_created += 1
    
    await db.commit()
    
    return {"message": f"Created {trades_created} demo trades and {nav_created} NAV records"}
