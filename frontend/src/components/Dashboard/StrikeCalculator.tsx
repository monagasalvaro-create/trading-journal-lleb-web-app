/**
 * StrikeCalculator — calculates expected strike levels via IBKR API.
 * 
 * Displays: current price, annual IV, daily IV, deviation, strike call, strike put.
 * Auto-refreshes every 30 seconds after the first successful calculation.
 * Handles loading, error, and empty states.
 */
import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { strikeCalculatorApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { IBKRConnectionError } from '@/components/ui/IBKRConnectionError';
import type { StrikeCalculatorResult } from '@/lib/types';
import {
    Calculator,
    Search,
    Loader2,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    BarChart3,
    Target,
    Activity,
    RefreshCw,
} from 'lucide-react';

const AUTO_REFRESH_INTERVAL_MS = 30_000;

interface StrikeCalculatorProps {
    className?: string;
    /** When false the 30-second auto-refresh is paused (component stays mounted). */
    isActive?: boolean;
}

export function StrikeCalculator({ className, isActive = true }: StrikeCalculatorProps) {
    const [symbol, setSymbol] = useState('');
    const [result, setResult] = useState<StrikeCalculatorResult | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

    // Tracks the symbol that was last successfully calculated (drives auto-refresh)
    const activeSymbolRef = useRef<string | null>(null);
    const isFetchingRef = useRef(false);

    // Stable ref for the mutate function — avoids re-creating intervals every render
    const mutateFnRef = useRef<(sym: string) => void>(() => { });

    const calculateMutation = useMutation({
        mutationFn: (sym: string) => strikeCalculatorApi.calculate(sym),
        onSuccess: (data) => {
            setResult(data);
            if (data.success) {
                activeSymbolRef.current = data.symbol;
            }
            isFetchingRef.current = false;
            setIsAutoRefreshing(false);
        },
        onError: (error: Error) => {
            setResult({
                success: false,
                symbol: symbol.toUpperCase(),
                price: null,
                iv_annual: null,
                iv_daily: null,
                hv_source: null,
                deviation: null,
                strike_call: null,
                strike_put: null,
                message: error.message,
            });
            isFetchingRef.current = false;
            setIsAutoRefreshing(false);
        },
    });

    // Keep the ref always pointing to the latest mutate function
    mutateFnRef.current = calculateMutation.mutate;

    /** Manual calculation — clears previous results. */
    const handleCalculate = () => {
        const trimmed = symbol.trim();
        if (!trimmed) return;
        setResult(null);
        isFetchingRef.current = true;
        calculateMutation.mutate(trimmed);
    };

    // Immediate refresh when user returns to this tab
    useEffect(() => {
        const sym = activeSymbolRef.current;
        if (isActive && sym && !isFetchingRef.current) {
            isFetchingRef.current = true;
            setIsAutoRefreshing(true);
            mutateFnRef.current(sym);
        }
    }, [isActive]);

    // Auto-refresh interval — starts after a successful result exists.
    // No unstable deps: reads symbol & mutate from refs.
    useEffect(() => {
        if (!result?.success || !isActive) {
            setCountdown(0);
            return;
        }

        const intervalSeconds = AUTO_REFRESH_INTERVAL_MS / 1000;
        setCountdown(intervalSeconds);

        // Countdown ticker (every second)
        const countdownId = setInterval(() => {
            setCountdown((prev) => (prev > 1 ? prev - 1 : intervalSeconds));
        }, 1_000);

        // Data refresh ticker (every 30s)
        const refreshId = setInterval(() => {
            const sym = activeSymbolRef.current;
            if (!sym || isFetchingRef.current) return;

            isFetchingRef.current = true;
            setIsAutoRefreshing(true);
            mutateFnRef.current(sym);
        }, AUTO_REFRESH_INTERVAL_MS);

        return () => {
            clearInterval(countdownId);
            clearInterval(refreshId);
        };
    }, [result?.success, isActive]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCalculate();
        }
    };

    const formatPercent = (value: number | null): string => {
        if (value === null) return '—';
        return `${(value * 100).toFixed(2)}%`;
    };

    const formatPrice = (value: number | null): string => {
        if (value === null) return '—';
        return `$${value.toFixed(2)}`;
    };

    return (
        <div className={cn('space-y-6', className)}>
            {/* Search Bar */}
            <Card glass>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Strike Calculator
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        Enter a stock symbol to calculate expected strike levels based on
                        historical volatility (HV) at 2 standard deviations.
                    </p>
                    <div className="flex gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                onKeyDown={handleKeyDown}
                                placeholder="e.g. AAPL, MSFT, SPY..."
                                maxLength={10}
                                className="w-full bg-secondary text-foreground text-sm rounded-lg pl-10 pr-4 py-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary uppercase tracking-wider font-mono"
                            />
                        </div>
                        <Button
                            onClick={handleCalculate}
                            disabled={!symbol.trim() || calculateMutation.isPending}
                        >
                            {calculateMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Target className="w-4 h-4 mr-2" />
                            )}
                            {calculateMutation.isPending ? 'Calculating...' : 'Calculate'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Error Message */}
            {result && !result.success && (
                <div className="animate-fade-in">
                    {(result.message?.includes('Could not connect to IBKR') || result.message?.includes('10061')) ? (
                        <IBKRConnectionError error={result.message} />
                    ) : (
                        <Card glass>
                            <CardContent className="p-5">
                                <div className="flex items-start gap-3 text-destructive">
                                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Calculation Failed</p>
                                        <p className="text-xs text-destructive/80">
                                            {result.message || 'Unknown error occurred.'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Results */}
            {result && result.success && (
                <div className="space-y-4 animate-fade-in">
                    {/* Symbol & Price Header */}
                    <Card glass>
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Activity className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold tracking-wide">{result.symbol}</h3>
                                        <p className="text-xs text-muted-foreground">Current Market Data</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {/* Auto-refresh indicator */}
                                    {result.success && countdown > 0 && (
                                        <div className="flex items-center gap-1.5 text-muted-foreground" title="Auto-refreshes every 30 seconds">
                                            <RefreshCw className={cn(
                                                'w-3.5 h-3.5',
                                                isAutoRefreshing && 'animate-spin text-primary',
                                            )} />
                                            <span className="text-xs font-mono tabular-nums">
                                                {isAutoRefreshing ? 'Updating…' : `${countdown}s`}
                                            </span>
                                        </div>
                                    )}
                                    <div className="text-right">
                                        <p className="text-2xl font-bold">{formatPrice(result.price)}</p>
                                        <p className="text-xs text-muted-foreground">Last Price</p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Volatility Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card glass>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                        Annual HV
                                    </span>
                                    {result.hv_source === 'FALLBACK' && (
                                        <span className="text-[9px] bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono px-1 py-0.5 rounded" title="Could not fetch live data — using estimated 25%">est.</span>
                                    )}
                                    {result.hv_source === 'PRICE' && (
                                        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono px-1 py-0.5 rounded" title="Annualized HV computed from 30-day price history">30d</span>
                                    )}
                                    {result.hv_source === 'IBKR' && (
                                        <span className="text-[9px] bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono px-1 py-0.5 rounded" title="30-day Historical Volatility from IBKR">IBKR</span>
                                    )}
                                </div>
                                <p className="text-xl font-bold">{formatPercent(result.iv_annual)}</p>
                            </CardContent>
                        </Card>
                        <Card glass>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide" title="Daily HV = Annual HV ÷ √252">
                                        Daily HV
                                    </span>
                                </div>
                                <p className="text-xl font-bold">{formatPercent(result.iv_daily)}</p>
                            </CardContent>
                        </Card>
                        <Card glass>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Target className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                        Deviation (2σ)
                                    </span>
                                </div>
                                <p className="text-xl font-bold">{formatPrice(result.deviation)}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Strike Levels */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card glass className="border-l-4 border-l-green-500">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <TrendingUp className="w-4 h-4 text-green-500" />
                                            <span className="text-sm font-medium text-muted-foreground">
                                                Expected Strike Call
                                            </span>
                                        </div>
                                        <p className="text-3xl font-bold text-green-500">
                                            {formatPrice(result.strike_call)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">Price + Deviation</p>
                                        <p className="text-xs text-green-500/70 font-mono">
                                            {result.price !== null && result.deviation !== null
                                                ? `${formatPrice(result.price)} + ${formatPrice(result.deviation)}`
                                                : '—'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card glass className="border-l-4 border-l-red-500">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <TrendingDown className="w-4 h-4 text-red-500" />
                                            <span className="text-sm font-medium text-muted-foreground">
                                                Expected Strike Put
                                            </span>
                                        </div>
                                        <p className="text-3xl font-bold text-red-500">
                                            {formatPrice(result.strike_put)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground">Price − Deviation</p>
                                        <p className="text-xs text-red-500/70 font-mono">
                                            {result.price !== null && result.deviation !== null
                                                ? `${formatPrice(result.price)} − ${formatPrice(result.deviation)}`
                                                : '—'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>


                </div>
            )}

            {/* Empty State */}
            {!result && !calculateMutation.isPending && (
                <Card glass className="animate-fade-in">
                    <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                            <Target className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-lg font-semibold text-muted-foreground mb-1">
                            Enter a Symbol
                        </h3>
                        <p className="text-sm text-muted-foreground/70 max-w-sm">
                            Type a stock ticker above and click Calculate to get expected
                        strike levels based on real-time historical volatility (HV) from IBKR.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
