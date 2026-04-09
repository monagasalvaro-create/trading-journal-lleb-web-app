import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import type { SettingsUpdate } from '@/lib/types';

export const SETTINGS_QUERY_KEY = 'settings';

export function useSettings() {
    return useQuery({
        queryKey: [SETTINGS_QUERY_KEY],
        queryFn: () => settingsApi.get(),
    });
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: SettingsUpdate) => settingsApi.update(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_KEY] });
        },
    });
}
