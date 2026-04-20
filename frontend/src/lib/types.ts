/**
 * TypeScript types matching backend schemas.
 */

export type PsychologyTag =
    | 'none'
    | 'fomo'
    | 'revenge_trading'
    | 'premature_exit'
    | 'rule_violation';

export interface Trade {
    id: string;
    ticker: string;
    entry_date: string;
    entry_time?: string;
    exit_date: string | null;
    quantity: number;
    entry_price: number;
    exit_price: number | null;
    commissions: number;
    net_pnl: number;
    gross_pnl: number;
    strategy: string | null;
    psychology_tag: PsychologyTag;
    is_error: boolean;
    notes: string | null;
    created_at: string | null;
    updated_at: string | null;
    // Options specific fields
    asset_class: string;
    strike: number | null;
    expiry: string | null;
    multiplier: number;
    put_call: string | null;
}

export interface TradeListResponse {
    trades: Trade[];
    total: number;
    page: number;
    page_size: number;
}

export interface AssetBoardItem {
    id: number;
    symbol: string;
    board_type: 'portfolio' | 'options';
    column_id: string;
    position: number;
    invested_amount?: number;
    net_pnl?: number;
    is_closed: boolean;
    has_stop?: boolean;
    date: string;
}

export interface TradeUpdate {
    ticker?: string;
    entry_date?: string;
    exit_date?: string;
    quantity?: number;
    entry_price?: number;
    exit_price?: number;
    commissions?: number;
    net_pnl?: number;
    strategy?: string;
    psychology_tag?: PsychologyTag;
    is_error?: boolean;
    notes?: string;
}

export interface MetricsSummary {
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    win_rate: number;
    total_net_pnl: number;
    total_gross_pnl: number;
    total_commissions: number;
    profit_factor: number;
    average_win: number;
    average_loss: number;
    largest_win: number;
    largest_loss: number;
    adjusted_net_pnl: number;
}

export interface DailyPnL {
    date: string;
    net_pnl: number;
    cumulative_pnl: number;
    adjusted_pnl: number;
    cumulative_adjusted_pnl: number;
    trade_count: number;
}

export interface EquityCurveResponse {
    data: DailyPnL[];
    total_pnl: number;
    potential_pnl: number;
}

export interface HeatmapDay {
    date: string;
    pnl: number;
    trade_count: number;
    intensity: number;
}

export interface HeatmapResponse {
    days: HeatmapDay[];
    year: number;
}

export interface NAVActivityDay {
    date: string;
    pnl: number;
    trade_count: number;
    starting_balance: number;
    intensity: number;
}

export interface NAVActivityResponse {
    days: NAVActivityDay[];
    year: number;
}

export interface AnnualMetrics {
    year: number;
    net_pnl: number;
    trade_count: number;
    winning_trades: number;
    losing_trades: number;
}

export interface AnnualMetricsResponse {
    data: AnnualMetrics[];
}

export interface IBKRSyncResponse {
    success: boolean;
    message: string;
    trades_imported: number;
    trades_updated: number;
    nav_records_imported: number;
}

export interface TradeFilters {
    page?: number;
    page_size?: number;
    ticker?: string;
    strategy?: string;
    start_date?: string;
    end_date?: string;
    is_error?: boolean;
    psychology_tag?: PsychologyTag;
}

export interface SettingsResponse {
    id: string;
    flex_token: string | null;
    query_id: string | null;
    account_name: string | null;
    base_account_balance: number;
    ibkr_socket_port: number;
    portfolio_stocks_pct: number;
    portfolio_options_pct: number;
    has_credentials: boolean;
    updated_at: string | null;
}

export interface SettingsUpdate {
    flex_token?: string;
    query_id?: string;
    account_name?: string;
    base_account_balance?: number;
    ibkr_socket_port?: number;
    portfolio_stocks_pct?: number;
    portfolio_options_pct?: number;
}

export interface StrikeCalculatorResult {
    success: boolean;
    symbol: string;
    price: number | null;
    iv_annual: number | null;
    iv_daily: number | null;
    deviation: number | null;
    strike_call: number | null;
    strike_put: number | null;
    message: string | null;
}

// Multi-account types
export interface AccountSummary {
    id: string;
    account_name: string;
    has_credentials: boolean;
    last_sync_at: string | null;
    updated_at: string | null;
}

export interface AccountCreate {
    account_name: string;
}

export interface AccountRename {
    account_name: string;
}
