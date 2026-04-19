"""
SQLAlchemy models for the Trading Journal database.
Includes Trade, AccountEquity (NAV history), Settings, and User models.
"""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.sql import func
from database import Base
from enum import Enum
from datetime import date, datetime
from typing import Optional
import hashlib
import uuid


class PsychologyTag(str, Enum):
    """Psychology error tags for trade auditing."""
    NONE = "none"
    FOMO = "fomo"
    REVENGE_TRADING = "revenge_trading"
    PREMATURE_EXIT = "premature_exit"
    RULE_VIOLATION = "rule_violation"


class Trade(Base):
    """Trade entity representing a single trading operation."""
    __tablename__ = "trades"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String(36), nullable=False, default="system", index=True)  # Multi-tenant isolation (migration v7)
    account_id = Column(String(50), nullable=False, default="default", index=True)  # Multi-account isolation
    ticker = Column(String(20), nullable=False, index=True)
    underlying_symbol = Column(String(20), nullable=True)  # For options
    entry_date = Column(Date, nullable=False, index=True)
    entry_time = Column(String(8), nullable=True)  # HH:MM:SS
    exit_date = Column(Date, nullable=True)
    quantity = Column(Float, nullable=False, default=0)
    entry_price = Column(Float, nullable=False, default=0)
    exit_price = Column(Float, nullable=True)
    commissions = Column(Float, nullable=False, default=0)
    net_pnl = Column(Float, nullable=False, default=0)
    gross_pnl = Column(Float, nullable=False, default=0)
    
    # Options-specific fields
    asset_class = Column(String(10), default="STK")  # STK, OPT, FUT
    strike = Column(Float, nullable=True)
    expiry = Column(Date, nullable=True)
    multiplier = Column(Integer, default=1)  # 100 for options
    put_call = Column(String(1), nullable=True)  # P or C
    
    # Audit fields
    strategy = Column(String(100), nullable=True)
    psychology_tag = Column(String(50), default=PsychologyTag.NONE.value)
    is_error = Column(Boolean, default=False)
    notes = Column(String(1000), nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    @staticmethod
    def generate_id(ticker: str, entry_date: date, order_id: Optional[str] = None, account_id: str = "default") -> str:
        """Generate unique ID from trade details."""
        if account_id == "default":
            id_string = f"{ticker}-{entry_date.isoformat()}-{order_id or 'manual'}"
        else:
            id_string = f"{account_id}-{ticker}-{entry_date.isoformat()}-{order_id or 'manual'}"
        return hashlib.sha256(id_string.encode()).hexdigest()[:16]

    def calculate_gross_pnl(self) -> float:
        """Calculate gross P&L (net + commissions)."""
        return self.net_pnl + abs(self.commissions)

    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "ticker": self.ticker,
            "underlying_symbol": self.underlying_symbol,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "entry_time": self.entry_time,
            "exit_date": self.exit_date.isoformat() if self.exit_date else None,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "commissions": self.commissions,
            "net_pnl": self.net_pnl,
            "gross_pnl": self.gross_pnl,
            "asset_class": self.asset_class,
            "strike": self.strike,
            "expiry": self.expiry.isoformat() if self.expiry else None,
            "multiplier": self.multiplier,
            "put_call": self.put_call,
            "strategy": self.strategy,
            "psychology_tag": self.psychology_tag,
            "is_error": self.is_error,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AccountEquity(Base):
    """Account equity/NAV history for tracking account value over time."""
    __tablename__ = "account_equity"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=False, default="system", index=True)  # Multi-tenant isolation (migration v7)
    account_id = Column(String(50), nullable=False, default="default", index=True)  # Multi-account isolation
    date = Column(Date, nullable=False, index=True)
    total_equity = Column(Float, nullable=False)  # Net Liquidation Value
    cash_balance = Column(Float, nullable=True)
    securities_value = Column(Float, nullable=True)
    unrealized_pnl = Column(Float, nullable=True)
    realized_pnl = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        """Convert model to dictionary."""
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "total_equity": self.total_equity,
            "cash_balance": self.cash_balance,
            "securities_value": self.securities_value,
            "unrealized_pnl": self.unrealized_pnl,
            "realized_pnl": self.realized_pnl,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Settings(Base):
    """Application settings including IBKR credentials. Each row = one user account."""
    __tablename__ = "settings"

    id = Column(String(50), primary_key=True)  # UUID or 'default'
    user_id = Column(String(36), nullable=False, default="system", index=True)  # Multi-tenant isolation (migration v7)
    flex_token = Column(String(500), nullable=True)  # IBKR Flex Token
    query_id = Column(String(50), nullable=True)  # IBKR Flex Query ID
    account_name = Column(String(100), nullable=False, default="Account 1")  # User-facing display name
    base_account_balance = Column(Float, default=25000.0)  # Starting balance for % calc
    ibkr_socket_port = Column(Integer, default=7497)  # TWS=7497, Gateway=4002
    portfolio_stocks_pct = Column(Float, default=70.0)  # % of NetLiq for stocks
    portfolio_options_pct = Column(Float, default=30.0)  # % of NetLiq for options
    last_sync_at = Column(DateTime, nullable=True)  # Timestamp of last successful IBKR sync
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self, mask_token: bool = True, decrypt_fn=None) -> dict:
        """Convert model to dictionary. Optionally decrypts token for display."""
        token = self.flex_token
        if decrypt_fn and token:
            token = decrypt_fn(token)
        if mask_token and token:
            token = token[:4] + "****" + token[-4:] if len(token) > 8 else "****"
        
        return {
            "id": self.id,
            "flex_token": token,
            "query_id": self.query_id,
            "account_name": self.account_name,
            "base_account_balance": self.base_account_balance,
            "ibkr_socket_port": self.ibkr_socket_port or 7497,
            "portfolio_stocks_pct": self.portfolio_stocks_pct if self.portfolio_stocks_pct is not None else 70.0,
            "portfolio_options_pct": self.portfolio_options_pct if self.portfolio_options_pct is not None else 30.0,
            "has_credentials": bool(self.flex_token and self.query_id),
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AssetBoardItem(Base):
    """Items for the Asset Allocation and Options boards."""
    __tablename__ = "asset_board_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=False, default="system", index=True)  # Multi-tenant isolation (migration v7)
    account_id = Column(String(50), nullable=False, default="default", index=True)  # Multi-account isolation
    symbol = Column(String(20), nullable=False)
    board_type = Column(String(20), nullable=False)  # 'portfolio' or 'options'
    column_id = Column(String(20), nullable=False)   # e.g., '60', 'puts'
    position = Column(Integer, default=0)            # For drag-and-drop ordering
    invested_amount = Column(Float, nullable=True)   # Amount invested in this asset
    net_pnl = Column(Float, nullable=True)           # Trade P&L (for closed-trade coloring)
    is_closed = Column(Boolean, default=False)       # Whether trade was closed on/before date
    has_stop = Column(Boolean, nullable=True)        # True if an open stop order is placed
    date = Column(Date, nullable=False, server_default=func.current_date())
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "board_type": self.board_type,
            "column_id": self.column_id,
            "position": self.position,
            "invested_amount": self.invested_amount,
            "net_pnl": self.net_pnl,
            "is_closed": self.is_closed or False,
            "has_stop": self.has_stop,
            "date": self.date.isoformat() if self.date else None,
        }


class BoardNote(Base):
    """Note for a specific board and date."""
    __tablename__ = "board_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=False, default="system", index=True)  # Multi-tenant isolation (migration v7)
    board_type = Column(String(20), nullable=False)  # 'portfolio' or 'options'
    date = Column(Date, nullable=False, index=True)
    content = Column(String, default="")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "board_type": self.board_type,
            "date": self.date.isoformat() if self.date else None,
            "content": self.content,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(Base):
    """Application user for multi-user authentication.
    Each user owns their own trades, settings and accounts via user_id.
    The existing X-Account-ID multi-account system works within each user.
    """
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)  # bcrypt via passlib
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_active": self.is_active,
        }
