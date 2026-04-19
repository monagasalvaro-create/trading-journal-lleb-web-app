/**
 * Connection status banner.
 * Periodically pings /api/health to detect backend disconnection.
 * Shows a red banner when disconnected and a brief green banner on reconnection.
 */
import { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

type ConnectionState = 'connected' | 'disconnected' | 'reconnected';

const HEALTH_URL = '/api/health';
const PING_INTERVAL_MS = 10_000;
const RECONNECTED_DISPLAY_MS = 3_000;

export function ConnectionStatus() {
    const { t } = useTranslation();
    const [state, setState] = useState<ConnectionState>('connected');
    const wasDisconnected = useRef(false);

    useEffect(() => {
        let reconnectedTimer: ReturnType<typeof setTimeout>;

        const checkHealth = async () => {
            try {
                const response = await fetch(HEALTH_URL, {
                    method: 'GET',
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5_000),
                });

                if (response.ok) {
                    if (wasDisconnected.current) {
                        // Was disconnected, now reconnected
                        wasDisconnected.current = false;
                        setState('reconnected');
                        reconnectedTimer = setTimeout(() => setState('connected'), RECONNECTED_DISPLAY_MS);
                    } else {
                        setState('connected');
                    }
                } else {
                    wasDisconnected.current = true;
                    setState('disconnected');
                }
            } catch {
                wasDisconnected.current = true;
                setState('disconnected');
            }
        };

        // Initial check
        checkHealth();

        const interval = setInterval(checkHealth, PING_INTERVAL_MS);

        return () => {
            clearInterval(interval);
            clearTimeout(reconnectedTimer);
        };
    }, []);

    // Don't render anything when connected (normal state)
    if (state === 'connected') return null;

    return (
        <div
            className={cn(
                'fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 animate-in slide-in-from-top',
                state === 'disconnected' && 'bg-destructive text-destructive-foreground',
                state === 'reconnected' && 'bg-success text-white'
            )}
        >
            {state === 'disconnected' && (
                <>
                    <WifiOff className="w-4 h-4" />
                    <span>{t('connection.lost')}</span>
                    <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />
                </>
            )}
            {state === 'reconnected' && (
                <>
                    <Wifi className="w-4 h-4" />
                    <span>{t('connection.reconnected')}</span>
                </>
            )}
        </div>
    );
}
