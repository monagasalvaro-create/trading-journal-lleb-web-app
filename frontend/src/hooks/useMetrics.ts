/**
 * React Query hooks for metrics and analytics.
 */
import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';
import type { TradeFilters } from '@/lib/types';

export const METRICS_QUERY_KEY = 'metrics';

/**
 * Hook to fetch summary metrics for KPI cards.
 */
export function useMetricsSummary(filters?: TradeFilters) {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'summary', filters],
        queryFn: () => metricsApi.getSummary(filters),
    });
}

/**
 * Hook to fetch equity curve data.
 */
export function useEquityCurve(startDate?: string, endDate?: string) {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'equity-curve', startDate, endDate],
        queryFn: () => metricsApi.getEquityCurve(startDate, endDate),
    });
}

/**
 * Hook to fetch heatmap calendar data.
 */
export function useHeatmap(year: number) {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'heatmap', year],
        queryFn: () => metricsApi.getHeatmap(year),
    });
}

/**
 * Hook to fetch NAV-based activity data for Trading Activity component.
 * Uses AccountEquity (NAV) changes for P&L, consistent with Equity Curve.
 */
export function useNAVActivity(year: number) {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'nav-activity', year],
        queryFn: () => metricsApi.getNAVActivity(year),
    });
}

/**
 * Hook to fetch annual metrics.
 */
export function useAnnualMetrics() {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'annual'],
        queryFn: () => metricsApi.getAnnualMetrics(),
    });
}

/**
 * Hook to fetch available strategies.
 */
export function useStrategies() {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'strategies'],
        queryFn: () => metricsApi.getStrategies(),
        staleTime: 1000 * 60 * 10, // 10 minutes - strategies don't change often
    });
}

/**
 * Hook to fetch available tickers.
 */
export function useTickers() {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'tickers'],
        queryFn: () => metricsApi.getTickers(),
        staleTime: 1000 * 60 * 10,
    });
}

/**
 * Hook to fetch NAV/Account Equity history.
 * Returns the latest account balance and history.
 */
export function useNAVHistory() {
    return useQuery({
        queryKey: [METRICS_QUERY_KEY, 'nav-history'],
        queryFn: () => metricsApi.getNAVHistory(),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}
