/**
 * API client wrapper for backend communication.
 * Supports multi-account isolation via X-Account-ID header.
 * Supports JWT authentication via Authorization: Bearer header.
 * All API calls automatically include the active account ID and auth token.
 */

import type {
    Trade,
    TradeListResponse,
    TradeUpdate,
    MetricsSummary,
    EquityCurveResponse,
    HeatmapResponse,
    NAVActivityResponse,
    IBKRSyncResponse,
    TradeFilters,
    SettingsResponse,
    SettingsUpdate,
    AnnualMetricsResponse,
    StrikeCalculatorResult,
    AccountSummary,
    AccountCreate,
    AccountRename,
} from './types';

const API_BASE = '/api';

// ─── Active Account Management ────────────────────────────────────────────────
// Stored in localStorage so it persists across page refreshes.
const ACTIVE_ACCOUNT_KEY = 'tj_activeAccountId';

export function getActiveAccountId(): string {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) || 'default';
}

export function setActiveAccountId(accountId: string): void {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}

// ─── Auth Token Management ────────────────────────────────────────────────────
// JWTs are stored in localStorage. The access token is short-lived (15 min);
// the refresh token is long-lived (7 days) and used to renew access tokens.
const ACCESS_TOKEN_KEY = 'tj_accessToken';
const REFRESH_TOKEN_KEY = 'tj_refreshToken';

export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Attempt to renew the access token using the stored refresh token.
 *  Returns the new access token on success, or null if refresh fails. */
async function tryRefreshToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        setAuthTokens(data.access_token, data.refresh_token);
        return data.access_token;
    } catch {
        return null;
    }
}

async function fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const { headers: customHeaders, ...restOptions } = options;

    const accessToken = getAccessToken();

    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            // Inject the active account ID into every request automatically
            'X-Account-ID': getActiveAccountId(),
            // Inject JWT token when available
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
            ...customHeaders,
        },
        ...restOptions,
    });

    // On 401: attempt token refresh once, then retry the original request
    if (response.status === 401) {
        const newToken = await tryRefreshToken();
        if (newToken) {
            const retryResponse = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Account-ID': getActiveAccountId(),
                    'Authorization': `Bearer ${newToken}`,
                    ...customHeaders,
                },
                ...restOptions,
            });
            if (!retryResponse.ok) {
                // Refresh worked but retry still failed — clear tokens and redirect to login
                clearAuthTokens();
                window.location.reload();
                throw new ApiError(401, 'Session expired. Please sign in again.');
            }
            return retryResponse.json();
        }
        // No refresh token or refresh failed — clear and force login
        clearAuthTokens();
        window.location.reload();
        throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
            response.status,
            errorData.detail || `API error: ${response.statusText}`
        );
    }

    return response.json();
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
    login: async (email: string, password: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Login failed');
        }
        const data = await res.json();
        setAuthTokens(data.access_token, data.refresh_token);
    },

    register: async (email: string, password: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Registration failed');
        }
        const data = await res.json();
        setAuthTokens(data.access_token, data.refresh_token);
    },

    me: (): Promise<{ id: string; email: string; is_active: boolean }> =>
        fetchApi('/auth/me'),

    logout: (): void => {
        clearAuthTokens();
    },
};

// ─── Accounts API ─────────────────────────────────────────────────────────────
export const accountsApi = {
    getAll: (): Promise<AccountSummary[]> =>
        fetchApi<AccountSummary[]>('/accounts'),

    create: (data: AccountCreate): Promise<AccountSummary> =>
        fetchApi<AccountSummary>('/accounts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    rename: (accountId: string, data: AccountRename): Promise<AccountSummary> =>
        fetchApi<AccountSummary>(`/accounts/${accountId}/rename`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    delete: (accountId: string): Promise<{ success: boolean; message: string }> =>
        fetchApi<{ success: boolean; message: string }>(`/accounts/${accountId}`, {
            method: 'DELETE',
        }),
};

// ─── Trades API ───────────────────────────────────────────────────────────────
export const tradesApi = {
    getAll: (filters: TradeFilters = {}): Promise<TradeListResponse> => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.append(key, String(value));
            }
        });
        const queryString = params.toString();
        return fetchApi<TradeListResponse>(`/trades${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id: string): Promise<Trade> => fetchApi<Trade>(`/trades/${id}`),

    getByDate: (date: string): Promise<Trade[]> => fetchApi<Trade[]>(`/trades/by-date/${date}`),

    update: (id: string, data: TradeUpdate): Promise<Trade> =>
        fetchApi<Trade>(`/trades/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    delete: (id: string): Promise<{ message: string }> =>
        fetchApi<{ message: string }>(`/trades/${id}`, { method: 'DELETE' }),
};

// ─── Metrics API ──────────────────────────────────────────────────────────────
export const metricsApi = {
    getSummary: (filters?: TradeFilters): Promise<MetricsSummary> => {
        const params = new URLSearchParams();
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, String(value));
                }
            });
        }
        const queryString = params.toString();
        return fetchApi<MetricsSummary>(`/metrics/summary${queryString ? `?${queryString}` : ''}`);
    },

    getEquityCurve: (startDate?: string, endDate?: string): Promise<EquityCurveResponse> => {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const queryString = params.toString();
        return fetchApi<EquityCurveResponse>(`/metrics/equity-curve${queryString ? `?${queryString}` : ''}`);
    },

    getHeatmap: (year: number): Promise<HeatmapResponse> =>
        fetchApi<HeatmapResponse>(`/metrics/heatmap/${year}`),

    getNAVActivity: (year: number): Promise<NAVActivityResponse> =>
        fetchApi<NAVActivityResponse>(`/metrics/nav-activity/${year}`),

    getAnnualMetrics: (): Promise<AnnualMetricsResponse> =>
        fetchApi<AnnualMetricsResponse>('/metrics/annual'),

    getStrategies: (): Promise<{ strategies: string[] }> =>
        fetchApi<{ strategies: string[] }>('/metrics/strategies'),

    getTickers: (): Promise<{ tickers: string[] }> =>
        fetchApi<{ tickers: string[] }>('/metrics/tickers'),

    getNAVHistory: (): Promise<{ data: Array<{ date: string; total_equity: number; cash_balance: number | null }>; total: number }> =>
        fetchApi<{ data: Array<{ date: string; total_equity: number; cash_balance: number | null }>; total: number }>('/metrics/nav-history'),
};

// ─── Settings API ─────────────────────────────────────────────────────────────
export const settingsApi = {
    get: (): Promise<SettingsResponse> => fetchApi<SettingsResponse>('/settings'),

    update: (data: SettingsUpdate, accountId?: string): Promise<SettingsResponse> =>
        fetchApi<SettingsResponse>('/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
            ...(accountId && { headers: { 'X-Account-ID': accountId } }),
        }),

    testConnection: (accountId?: string): Promise<{ success: boolean; message: string }> =>
        fetchApi<{ success: boolean; message: string }>('/settings/test', {
            method: 'POST',
            ...(accountId && { headers: { 'X-Account-ID': accountId } }),
        }),
};

// ─── Sync API ─────────────────────────────────────────────────────────────────
export const syncApi = {
    sync: (accountId?: string): Promise<IBKRSyncResponse> =>
        fetchApi<IBKRSyncResponse>('/sync', {
            method: 'POST',
            body: JSON.stringify({}),
            ...(accountId && { headers: { 'X-Account-ID': accountId } }),
        }),

    syncWithCredentials: (token: string, queryId: string): Promise<IBKRSyncResponse> =>
        fetchApi<IBKRSyncResponse>('/sync', {
            method: 'POST',
            body: JSON.stringify({ token, query_id: queryId }),
        }),

    createDemoData: (): Promise<{ message: string }> =>
        fetchApi<{ message: string }>('/sync/demo-data', { method: 'POST' }),

    getLastSync: (): Promise<{ last_sync: string | null; last_trade_date: string | null }> =>
        fetchApi<{ last_sync: string | null; last_trade_date: string | null }>('/sync/last-sync'),

    purge: (): Promise<{ success: boolean; message: string; trades_deleted: number; nav_deleted: number }> =>
        fetchApi<{ success: boolean; message: string; trades_deleted: number; nav_deleted: number }>(
            '/sync/purge',
            { method: 'DELETE' }
        ),
};

// ─── Strike Calculator API ────────────────────────────────────────────────────
export const strikeCalculatorApi = {
    calculate: (symbol: string): Promise<StrikeCalculatorResult> =>
        fetchApi<StrikeCalculatorResult>('/strike-calculator/calculate', {
            method: 'POST',
            body: JSON.stringify({ symbol }),
        }),
};

// ─── Portfolio API ────────────────────────────────────────────────────────────
export const portfolioApi = {
    getLivePortfolio: (): Promise<any> => fetchApi<any>('/portfolio/live'),
};

export { ApiError };
