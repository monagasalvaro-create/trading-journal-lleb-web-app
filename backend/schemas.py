"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from enum import Enum


class PsychologyTagEnum(str, Enum):
    """Psychology error tags for trade auditing."""
    NONE = "none"
    FOMO = "fomo"
    REVENGE_TRADING = "revenge_trading"
    PREMATURE_EXIT = "premature_exit"
    RULE_VIOLATION = "rule_violation"


# Trade Schemas
class TradeBase(BaseModel):
    """Base trade schema with common fields."""
    ticker: str = Field(..., min_length=1, max_length=50)
    underlying_symbol: Optional[str] = None
    entry_date: date
    entry_time: Optional[str] = None
    exit_date: Optional[date] = None
    quantity: float = 0
    entry_price: float = 0
    exit_price: Optional[float] = None
    commissions: float = 0
    net_pnl: float = 0
    asset_class: str = "STK"
    strike: Optional[float] = None
    expiry: Optional[date] = None
    multiplier: int = 1
    put_call: Optional[str] = None
    strategy: Optional[str] = None
    psychology_tag: PsychologyTagEnum = PsychologyTagEnum.NONE
    is_error: bool = False
    notes: Optional[str] = None


class TradeCreate(TradeBase):
    """Schema for creating a new trade."""
    pass


class TradeUpdate(BaseModel):
    """Schema for updating a trade (all fields optional)."""
    ticker: Optional[str] = None
    entry_date: Optional[date] = None
    exit_date: Optional[date] = None
    quantity: Optional[float] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    commissions: Optional[float] = None
    net_pnl: Optional[float] = None
    strategy: Optional[str] = None
    psychology_tag: Optional[PsychologyTagEnum] = None
    is_error: Optional[bool] = None
    notes: Optional[str] = None


class TradeResponse(TradeBase):
    """Schema for trade response."""
    id: str
    gross_pnl: float
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TradeListResponse(BaseModel):
    """Schema for paginated trade list."""
    trades: List[TradeResponse]
    total: int
    page: int
    page_size: int


# Account Equity Schemas
class AccountEquityBase(BaseModel):
    """Base account equity schema."""
    date: date
    total_equity: float
    cash_balance: Optional[float] = None
    securities_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    realized_pnl: Optional[float] = None


class AccountEquityResponse(AccountEquityBase):
    """Response schema for account equity."""
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AccountEquityListResponse(BaseModel):
    """List of account equity records."""
    data: List[AccountEquityResponse]
    total: int


# Settings Schemas
class SettingsUpdate(BaseModel):
    """Schema for updating settings."""
    flex_token: Optional[str] = None
    query_id: Optional[str] = None
    account_name: Optional[str] = None
    base_account_balance: Optional[float] = None
    ibkr_socket_port: Optional[int] = None
    portfolio_stocks_pct: Optional[float] = None
    portfolio_options_pct: Optional[float] = None


class SettingsResponse(BaseModel):
    """Schema for settings response."""
    id: str
    flex_token: Optional[str] = None  # Masked
    query_id: Optional[str] = None
    account_name: str = "Account 1"
    base_account_balance: float = 25000.0
    ibkr_socket_port: int = 7497
    portfolio_stocks_pct: float = 70.0
    portfolio_options_pct: float = 30.0
    has_credentials: bool = False
    last_sync_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Account Management Schemas
class AccountCreate(BaseModel):
    """Schema for creating a new trading account."""
    account_name: str = Field(..., min_length=1, max_length=100, description="Display name for the account")


class AccountRename(BaseModel):
    """Schema for renaming an account."""
    account_name: str = Field(..., min_length=1, max_length=100)


class AccountSummary(BaseModel):
    """Summary of a trading account for the account switcher UI."""
    id: str
    account_name: str
    has_credentials: bool
    last_sync_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Metrics Schemas
class MetricsSummary(BaseModel):
    """Summary metrics for dashboard KPIs."""
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_net_pnl: float
    total_gross_pnl: float
    total_commissions: float
    profit_factor: float
    average_win: float
    average_loss: float
    largest_win: float
    largest_loss: float
    adjusted_net_pnl: float  # P&L without error trades


class DailyPnL(BaseModel):
    """Daily P&L for equity curve."""
    date: date
    net_pnl: float
    cumulative_pnl: float
    adjusted_pnl: float
    cumulative_adjusted_pnl: float
    trade_count: int


class EquityCurveResponse(BaseModel):
    """Equity curve data for charting."""
    data: List[DailyPnL]
    total_pnl: float
    potential_pnl: float
    use_nav_data: bool = False  # True if using AccountEquity data


class HeatmapDay(BaseModel):
    """Single day in heatmap calendar."""
    date: date
    pnl: float
    trade_count: int
    intensity: int  # 0-4 scale like GitHub contributions


class HeatmapResponse(BaseModel):
    """Heatmap calendar data."""
    days: List[HeatmapDay]
    year: int


class NAVActivityDay(BaseModel):
    """Single day of NAV-based activity for Trading Activity component."""
    date: date
    pnl: float  # Daily NAV change (total_equity[today] - total_equity[prev_day])
    trade_count: int  # Number of trades closed on this day
    starting_balance: float  # NAV at start of day (for % calculations)
    intensity: int  # -4 to 4 scale for visual intensity


class NAVActivityResponse(BaseModel):
    """NAV-based activity data for Trading Activity component."""
    days: List[NAVActivityDay]
    year: int


class AnnualMetrics(BaseModel):
    """Annual P&L metrics."""
    year: int
    net_pnl: float
    trade_count: int
    winning_trades: int
    losing_trades: int


class AnnualMetricsResponse(BaseModel):
    """List of annual metrics."""
    data: List[AnnualMetrics]


# IBKR Sync Schemas
class IBKRSyncRequest(BaseModel):
    """Request to sync with IBKR Flex Service (optional - uses stored credentials)."""
    token: Optional[str] = None
    query_id: Optional[str] = None


class IBKRSyncResponse(BaseModel):
    """Response from IBKR sync operation."""
    success: bool
    message: str
    trades_imported: int = 0
    trades_updated: int = 0
    nav_records_imported: int = 0


# Strike Calculator Schemas
class StrikeCalculatorRequest(BaseModel):
    """Request to calculate expected strike levels."""
    symbol: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")


class StrikeCalculatorResponse(BaseModel):
    """Response with calculated strike levels."""
    success: bool
    symbol: str
    price: Optional[float] = None
    iv_annual: Optional[float] = None
    iv_daily: Optional[float] = None
    deviation: Optional[float] = None
    strike_call: Optional[float] = None
    strike_put: Optional[float] = None
    message: Optional[str] = None
