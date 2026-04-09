/**
 * Trading Activity Calendar with multiple views.
 * Shows P&L per day in a calendar grid with time perspective options.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useHeatmap, useNAVActivity, useAnnualMetrics } from '@/hooks/useMetrics';
import type { NAVActivityDay } from '@/lib/types';
import { useSettings } from '@/hooks/useSettings';
import { useTradesByDate } from '@/hooks/useTrades';
import { cn, formatCurrency, formatDate, formatOptionSymbol } from '@/lib/utils';
import { syncApi } from '@/lib/api';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, CalendarRange, History, RefreshCw, Clock } from 'lucide-react';

function formatTimeAgo(dateString: string): string {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
}

type TimePerspective = 'days' | 'weeks' | 'months' | 'years';

interface HeatmapCalendarProps {
    className?: string;
    compact?: boolean;
    onDayClick?: (date: string) => void;
    onSync?: () => void;
    isSyncing?: boolean;
}

export function HeatmapCalendar({ className, compact = false, onDayClick, onSync, isSyncing = false }: HeatmapCalendarProps) {
    const [year, setYear] = usePersistedState('tj_heatmap_year', new Date().getFullYear());
    const [month, setMonth] = usePersistedState('tj_heatmap_month', new Date().getMonth());
    const [perspective, setPerspective] = usePersistedState<TimePerspective>('tj_heatmap_perspective', 'days');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const { data: heatmapData, isLoading: isHeatmapLoading } = useHeatmap(year);
    const { data: navActivityData, isLoading: isNAVLoading } = useNAVActivity(year);
    const { data: annualMetrics } = useAnnualMetrics();
    const { data: trades } = useTradesByDate(selectedDate);
    const { data: settings } = useSettings();

    // Use NAV data as primary source (consistent with Equity Curve)
    // Fall back to heatmap data if NAV is not available
    const hasNAVData = navActivityData && navActivityData.days.length > 0;
    const isLoading = isNAVLoading || isHeatmapLoading;

    // Last sync data
    const { data: lastSyncData } = useQuery({
        queryKey: ['last-sync'],
        queryFn: syncApi.getLastSync,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    const [timeAgoText, setTimeAgoText] = useState<string | null>(null);

    useEffect(() => {
        const update = () => {
            if (lastSyncData?.last_sync) {
                setTimeAgoText(formatTimeAgo(lastSyncData.last_sync));
            } else {
                setTimeAgoText(null);
            }
        };
        update();
        const interval = setInterval(update, 30_000);
        return () => clearInterval(interval);
    }, [lastSyncData]);

    // Helper to parse date string YYYY-MM-DD as local date (noon to avoid DST issues)
    const parseDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
    };

    // Create a map for quick lookup — use heatmap data to show realized trades in Days view
    const dayMap = useMemo(() => {
        if (!heatmapData?.days) return new Map();
        return new Map(heatmapData.days.map((d) => [d.date, d]));
    }, [heatmapData]);

    // Helper to get starting balance for a period (used for percentage calculations)
    const getStartingBalance = (startDate: Date) => {
        // When using NAV data, get the balance from the first NAV record before the period
        if (hasNAVData) {
            const targetStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            // Find the last NAV record before or on the target date
            const sortedDays = [...navActivityData.days].sort((a, b) => a.date.localeCompare(b.date));
            const priorDay = [...sortedDays].reverse().find(d => d.date < targetStr);
            if (priorDay) return priorDay.starting_balance + priorDay.pnl; // end-of-day balance
            // Fallback: use first day's starting_balance
            if (sortedDays.length > 0) return sortedDays[0].starting_balance;
        }
        return settings?.base_account_balance || 25000;
    };

    // Generate calendar grid for the current month (days view)
    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();

        // Shift so Monday is the first column
        const emptyDays = (startDayOfWeek + 6) % 7;

        const days: { date: string | null; day: number | null }[] = [];

        for (let i = 0; i < emptyDays; i++) {
            days.push({ date: null, day: null });
        }

        for (let day = 1; day <= daysInMonth; day++) {
            // Create strings manually to avoid timezone shifts
            const mStr = String(month + 1).padStart(2, '0');
            const dStr = String(day).padStart(2, '0');
            const dateStr = `${year}-${mStr}-${dStr}`;
            days.push({ date: dateStr, day });
        }

        return days;
    }, [year, month]);

    // Generate weeks data — uses NAV data when available for Equity Curve consistency
    const weeksData = useMemo(() => {
        const sourceDays = hasNAVData ? navActivityData.days : heatmapData?.days;
        if (!sourceDays || sourceDays.length === 0) return [];

        const weekMap = new Map<string, { pnl: number; trades: number; startDate: string; startingBalance: number }>();

        sourceDays.forEach((d) => {
            const date = parseDate(d.date);
            const day = date.getDay();
            // Calculate how many days to subtract to get to Monday (0 is Sunday, 1 is Monday...)
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const weekStart = new Date(date);
            weekStart.setDate(diff); // Monday start
            const weekKey = weekStart.toISOString().split('T')[0];

            const existing = weekMap.get(weekKey);
            if (existing) {
                existing.pnl += d.pnl;
                existing.trades += d.trade_count;
            } else {
                const startBalance = 'starting_balance' in d ? (d as NAVActivityDay).starting_balance : 0;
                weekMap.set(weekKey, { pnl: d.pnl, trades: d.trade_count, startDate: weekKey, startingBalance: startBalance });
            }
        });

        return Array.from(weekMap.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
    }, [navActivityData, heatmapData, hasNAVData]);

    // Generate months data — uses NAV data when available for Equity Curve consistency
    const monthsData = useMemo(() => {
        const sourceDays = hasNAVData ? navActivityData.days : heatmapData?.days;
        if (!sourceDays || sourceDays.length === 0) return [];

        const monthMap = new Map<string, { pnl: number; trades: number; month: number; startingBalance: number }>();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        sourceDays.forEach((d) => {
            const [y, m] = d.date.split('-').map(Number);

            if (y === year) {
                const monthKey = `${y}-${m - 1}`;

                const existing = monthMap.get(monthKey);
                if (existing) {
                    existing.pnl += d.pnl;
                    existing.trades += d.trade_count;
                } else {
                    const startBalance = 'starting_balance' in d ? (d as NAVActivityDay).starting_balance : 0;
                    monthMap.set(monthKey, { pnl: d.pnl, trades: d.trade_count, month: m - 1, startingBalance: startBalance });
                }
            }
        });

        return monthNames.map((name, i) => {
            const data = monthMap.get(`${year}-${i}`);
            return { name, pnl: data?.pnl || 0, trades: data?.trades || 0, startingBalance: data?.startingBalance || 0 };
        });
    }, [navActivityData, heatmapData, year, hasNAVData]);

    const handleDayClick = (date: string | null) => {
        if (!date) return;
        setSelectedDate(date);
        onDayClick?.(date);
    };

    const handlePrevMonth = () => {
        if (month === 0) {
            setMonth(11);
            setYear(year - 1);
        } else {
            setMonth(month - 1);
        }
    };

    const handleNextMonth = () => {
        if (month === 11) {
            setMonth(0);
            setYear(year + 1);
        } else {
            setMonth(month + 1);
        }
    };

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];



    const perspectiveOptions: { value: TimePerspective; label: string; icon: React.ReactNode }[] = [
        { value: 'days', label: 'Days', icon: <CalendarDays className="w-3.5 h-3.5" /> },
        { value: 'weeks', label: 'Weeks', icon: <CalendarRange className="w-3.5 h-3.5" /> },
        { value: 'months', label: 'Months', icon: <Calendar className="w-3.5 h-3.5" /> },
        { value: 'years', label: 'Years', icon: <History className="w-3.5 h-3.5" /> },
    ];

    // Compact view for mini calendar
    if (compact) {
        return (
            <Card glass className={cn('h-full', className)}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Trading Activity
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => onSync?.()}
                                disabled={isSyncing || !onSync}
                                title="Sync IBKR Data"
                            >
                                <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
                            </Button>
                        </CardTitle>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePrevMonth}>
                                <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs font-medium min-w-[80px] text-center">
                                {monthNames[month].slice(0, 3)} {year}
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNextMonth}
                                disabled={year >= new Date().getFullYear() && month >= new Date().getMonth()}>
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                </CardHeader>
                <CardContent className="pt-0">
                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {dayNames.map((day) => (
                            <div key={day} className="text-center text-[10px] text-muted-foreground font-medium">
                                {day.charAt(0)}
                            </div>
                        ))}
                    </div>
                    {/* Mini calendar grid */}
                    <div className="grid grid-cols-7 gap-0.5">
                        {calendarDays.map(({ date, day }, index) => {
                            const dayData = date ? dayMap.get(date) : null;
                            const pnl = dayData?.pnl || 0;
                            const isToday = date === new Date().toISOString().split('T')[0];

                            return (
                                <div
                                    key={index}
                                    onClick={() => handleDayClick(date)}
                                    className={cn(
                                        'aspect-square rounded text-[10px] flex flex-col items-center justify-center cursor-pointer transition-all',
                                        !date && 'invisible',
                                        date && 'hover:ring-1 hover:ring-primary/50',
                                        dayData && pnl > 0 && 'bg-success/30 text-success',
                                        dayData && pnl < 0 && 'bg-destructive/30 text-destructive',
                                        !dayData && date && 'bg-muted/30 text-muted-foreground',
                                        isToday && 'ring-1 ring-primary',
                                        selectedDate === date && 'ring-2 ring-primary'
                                    )}
                                >
                                    <span className="font-medium">{day}</span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded bg-success/40" />
                            <span>Profit</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded bg-destructive/40" />
                            <span>Loss</span>
                        </div>
                    </div>

                    {/* Sync Button */}
                    <button
                        onClick={() => onSync?.()}
                        disabled={isSyncing || !onSync}
                        className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-primary bg-secondary/30 hover:bg-secondary/60 border border-white/5 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
                        {isSyncing ? 'Syncing...' : 'Sync IBKR Data'}
                    </button>
                    {/* Last Sync Indicator */}
                    {timeAgoText && (
                        <div
                            className="flex items-center justify-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground/60"
                            title={`Last sync: ${lastSyncData?.last_sync ?? 'N/A'}`}
                        >
                            <Clock className="w-3 h-3" />
                            <span>Last sync: {timeAgoText}</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Full expanded view
    return (
        <Card glass className={cn('h-full', className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <CardTitle className="text-base">Trading Activity</CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => onSync?.()}
                            disabled={isSyncing || !onSync}
                            title="Sync IBKR Data"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
                        </Button>
                    </div>

                    {/* Time Perspective Selector */}
                    <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg">
                        {perspectiveOptions.map((option) => (
                            <Button
                                key={option.value}
                                variant={perspective === option.value ? 'default' : 'ghost'}
                                size="sm"
                                className={cn('h-7 px-2.5 text-xs gap-1.5', perspective === option.value && 'shadow-sm')}
                                onClick={() => setPerspective(option.value)}
                            >
                                {option.icon}
                                {option.label}
                            </Button>
                        ))}
                    </div>

                    {/* Month/Year Navigation */}
                    {perspective === 'days' && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[120px] text-center">
                                {monthNames[month]} {year}
                            </span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}
                                disabled={year >= new Date().getFullYear() && month >= new Date().getMonth()}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                    {(perspective === 'weeks' || perspective === 'months') && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year - 1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-medium min-w-[60px] text-center">{year}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year + 1)}
                                disabled={year >= new Date().getFullYear()}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Monthly Summary */}

            </CardHeader>

            <CardContent>
                {isLoading ? (
                    <div className="shimmer h-64 w-full rounded-lg bg-muted" />
                ) : (
                    <>
                        {/* Days View */}
                        {perspective === 'days' && (
                            <>
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {dayNames.map((day) => (
                                        <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                    {calendarDays.map(({ date, day }, index) => {
                                        const dayData = date ? dayMap.get(date) : null;
                                        const pnl = dayData?.pnl || 0;
                                        const tradeCount = dayData?.trade_count || 0;
                                        const isSelected = selectedDate === date;
                                        const isToday = date === new Date().toISOString().split('T')[0];

                                        return (
                                            <div
                                                key={index}
                                                onClick={() => handleDayClick(date)}
                                                className={cn(
                                                    'relative rounded-lg border transition-all duration-200 cursor-pointer min-h-[70px] p-1.5',
                                                    !date && 'invisible',
                                                    date && 'hover:border-primary/50 hover:bg-accent/50',
                                                    isSelected && 'ring-2 ring-primary border-primary',
                                                    isToday && 'border-primary/30',
                                                    dayData && pnl > 0 && 'bg-success/5 border-success/20',
                                                    dayData && pnl < 0 && 'bg-destructive/5 border-destructive/20',
                                                    !dayData && date && 'border-border/50'
                                                )}
                                            >
                                                {date && (
                                                    <>
                                                        <div className={cn('text-xs font-medium mb-1', isToday && 'text-primary', !isToday && 'text-muted-foreground')}>
                                                            {day}
                                                        </div>
                                                        {dayData && (
                                                            <div className="space-y-0.5">
                                                                <div className={cn('text-sm font-bold font-mono',
                                                                    pnl > 0 && 'text-success', pnl < 0 && 'text-destructive', pnl === 0 && 'text-muted-foreground'
                                                                )}>
                                                                    {pnl > 0 && '+'}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                                </div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    {tradeCount} trade{tradeCount !== 1 ? 's' : ''}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Weeks View */}
                        {perspective === 'weeks' && (
                            <div className="grid grid-cols-4 gap-2">
                                {weeksData.slice(-16).map((week, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            'p-3 rounded-lg border transition-all',
                                            week.pnl > 0 && 'bg-success/5 border-success/20',
                                            week.pnl < 0 && 'bg-destructive/5 border-destructive/20',
                                            week.pnl === 0 && 'border-border/50'
                                        )}
                                    >
                                        <div className="text-xs text-muted-foreground mb-1">
                                            Week of {formatDate(week.startDate)}
                                        </div>
                                        <div className={cn('text-lg font-bold font-mono',
                                            week.pnl > 0 && 'text-success', week.pnl < 0 && 'text-destructive'
                                        )}>
                                            {week.pnl >= 0 ? '+' : ''}{formatCurrency(week.pnl)}
                                        </div>
                                        {(() => {
                                            const balance = week.startingBalance || getStartingBalance(new Date(week.startDate));
                                            return balance > 0 ? (
                                                <div className={cn('text-xs font-mono', week.pnl >= 0 ? 'text-success/70' : 'text-destructive/70')}>
                                                    {week.pnl >= 0 ? '+' : ''}{((week.pnl / balance) * 100).toFixed(2)}%
                                                </div>
                                            ) : null;
                                        })()}
                                        <div className="text-xs text-muted-foreground mt-1">{week.trades} trades</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Months View */}
                        {perspective === 'months' && (
                            <div className="grid grid-cols-4 gap-2">
                                {monthsData.map((m, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            'p-3 rounded-lg border transition-all',
                                            m.pnl > 0 && 'bg-success/5 border-success/20',
                                            m.pnl < 0 && 'bg-destructive/5 border-destructive/20',
                                            m.trades === 0 && 'opacity-50 border-border/30'
                                        )}
                                    >
                                        <div className="text-sm font-medium text-muted-foreground mb-1">{m.name}</div>
                                        <div className={cn('text-lg font-bold font-mono',
                                            m.pnl > 0 && 'text-success', m.pnl < 0 && 'text-destructive',
                                            m.trades === 0 && 'text-muted-foreground'
                                        )}>
                                            {m.trades > 0 ? (m.pnl >= 0 ? '+' : '') + formatCurrency(m.pnl) : '-'}
                                        </div>
                                        {m.trades > 0 && (() => {
                                            const balance = m.startingBalance || getStartingBalance(new Date(year, index, 1));
                                            return balance > 0 ? (
                                                <div className={cn('text-xs font-mono', m.pnl >= 0 ? 'text-success/70' : 'text-destructive/70')}>
                                                    {m.pnl >= 0 ? '+' : ''}{((m.pnl / balance) * 100).toFixed(2)}%
                                                </div>
                                            ) : null;
                                        })()}
                                        <div className="text-xs text-muted-foreground mt-1">{m.trades} trades</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Years View */}
                        {perspective === 'years' && (
                            <div className="grid grid-cols-3 gap-3">
                                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 5 + i).reverse().map((y) => {
                                    // Find data for this year
                                    const yearData = annualMetrics?.data?.find(d => d.year === y);

                                    const totalPnl = yearData?.net_pnl || 0;
                                    const totalTrades = yearData?.trade_count || 0;

                                    return (
                                        <div
                                            key={y}
                                            className={cn(
                                                'p-4 rounded-lg border transition-all',
                                                totalPnl > 0 && 'bg-success/5 border-success/20',
                                                totalPnl < 0 && 'bg-destructive/5 border-destructive/20',
                                                totalTrades === 0 && 'opacity-50 border-border/30'
                                            )}
                                        >
                                            <div className="text-lg font-bold text-foreground mb-1">{y}</div>
                                            <div className={cn('text-2xl font-bold font-mono',
                                                totalPnl > 0 && 'text-success', totalPnl < 0 && 'text-destructive',
                                                totalTrades === 0 && 'text-muted-foreground'
                                            )}>
                                                {totalTrades > 0 ? (totalPnl >= 0 ? '+' : '') + formatCurrency(totalPnl) : '-'}
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1">{totalTrades} trades</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Legend */}
                        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded bg-success/20 border border-success/30" />
                                <span>Profit</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                                <span>Loss</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded border border-border/50" />
                                <span>No trades</span>
                            </div>
                        </div>
                    </>
                )}

                {/* Selected day detail (only in days view) */}
                {perspective === 'days' && selectedDate && trades && trades.length > 0 && (
                    <DayDetails
                        date={selectedDate}
                        trades={trades}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                    />
                )}
            </CardContent>
        </Card>
    );
}



function DayDetails({ date, trades, formatDate, formatCurrency }: any) {
    const [expanded, setExpanded] = useState(false);

    // Reset expansion when date changes (handled by key or effect? simpler to just let user manually expand)
    // Actually, if I change day, I want it collapsed by default.
    // Use key={date} on the wrapper div to reset state.

    const visibleTrades = expanded ? trades : trades.slice(0, 5);
    const hiddenCount = trades.length - 5;

    return (
        <div key={date} className="mt-4 p-3 rounded-lg bg-secondary/50 animate-fade-in">
            <h4 className="text-sm font-medium mb-2">{formatDate(date)}</h4>
            <div className="space-y-1.5">
                {visibleTrades.map((trade: any) => (
                    <div key={trade.id} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{formatOptionSymbol(trade.ticker)}</span>
                            {trade.is_error && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                    {trade.psychology_tag}
                                </span>
                            )}
                        </div>
                        <span className={cn('font-mono font-medium', trade.net_pnl >= 0 ? 'text-success' : 'text-destructive')}>
                            {trade.net_pnl >= 0 ? '+' : ''}{formatCurrency(trade.net_pnl)}
                        </span>
                    </div>
                ))}
                {!expanded && hiddenCount > 0 && (
                    <button
                        onClick={() => setExpanded(true)}
                        className="text-xs text-muted-foreground pt-1 hover:text-primary transition-colors flex items-center gap-1"
                    >
                        +{hiddenCount} more trades
                    </button>
                )}
                {expanded && trades.length > 5 && (
                    <button
                        onClick={() => setExpanded(false)}
                        className="text-xs text-muted-foreground pt-1 hover:text-primary transition-colors flex items-center gap-1"
                    >
                        Show less
                    </button>
                )}
            </div>
        </div>
    );
}
