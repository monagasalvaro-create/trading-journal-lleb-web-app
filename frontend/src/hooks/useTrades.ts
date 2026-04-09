/**
 * React Query hooks for trades data management.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradesApi } from '@/lib/api';
import type { TradeFilters, TradeUpdate } from '@/lib/types';

export const TRADES_QUERY_KEY = 'trades';

/**
 * Hook to fetch paginated trades list.
 */
export function useTrades(filters: TradeFilters = {}) {
    return useQuery({
        queryKey: [TRADES_QUERY_KEY, filters],
        queryFn: () => tradesApi.getAll(filters),
    });
}

/**
 * Hook to fetch a single trade by ID.
 */
export function useTrade(id: string | null) {
    return useQuery({
        queryKey: [TRADES_QUERY_KEY, id],
        queryFn: () => tradesApi.getById(id!),
        enabled: !!id,
    });
}

/**
 * Hook to fetch trades for a specific date (heatmap drill-down).
 */
export function useTradesByDate(date: string | null) {
    return useQuery({
        queryKey: [TRADES_QUERY_KEY, 'by-date', date],
        queryFn: () => tradesApi.getByDate(date!),
        enabled: !!date,
    });
}

/**
 * Hook to update a trade (auto-save).
 */
export function useUpdateTrade() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: TradeUpdate }) =>
            tradesApi.update(id, data),
        onSuccess: () => {
            // Invalidate all trades queries to refresh data
            queryClient.invalidateQueries({ queryKey: [TRADES_QUERY_KEY] });
            // Also invalidate metrics since trade changes affect them
            queryClient.invalidateQueries({ queryKey: ['metrics'] });
        },
    });
}

/**
 * Hook to delete a trade.
 */
export function useDeleteTrade() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => tradesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [TRADES_QUERY_KEY] });
            queryClient.invalidateQueries({ queryKey: ['metrics'] });
        },
    });
}
