import { useMemo } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useTrades } from '@/hooks/useTrades';
import { cn, formatCurrency, getTradeType } from '@/lib/utils';
import { ALL_STRATEGIES, getStrategyDirection } from '@/lib/strategies';
import { Activity, AlertTriangle, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation, useMonthNames } from '@/lib/i18n';

interface StrategyStatsProps {
    className?: string;
}

interface StrategyData {
    name: string;
    direction: 'CALL' | 'PUT' | null;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
}

export type TimeFilter = 'month' | 'week' | 'last_year' | 'all';

export function StrategyStats({ className }: StrategyStatsProps) {
    const { t } = useTranslation();
    const monthNames = useMonthNames();
    const [timeFilter, setTimeFilter] = usePersistedState<TimeFilter>('tj_strategyStats_timeFilter', 'month');
    const [selectedDateStr, setSelectedDateStr] = usePersistedState<string>('tj_strategyStats_selectedDate', new Date().toISOString());
    const selectedDate = useMemo(() => new Date(selectedDateStr), [selectedDateStr]);
    const setSelectedDate = (d: Date) => setSelectedDateStr(d.toISOString());

    const getPsychologyTagLabel = (tag: string) => t(`psychTag.${tag}`);

    const dateRange = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();

        const fmt = (d: Date) => d.toISOString().split('T')[0];

        switch (timeFilter) {
            case 'month':
                return {
                    start_date: fmt(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)),
                    end_date: fmt(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0))
                };
            case 'week': {
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(now.setDate(diff));
                const sunday = new Date(now.setDate(monday.getDate() + 6));
                return {
                    start_date: fmt(monday),
                    end_date: fmt(sunday)
                };
            }
            case 'last_year':
                return {
                    start_date: `${currentYear - 1}-01-01`,
                    end_date: `${currentYear - 1}-12-31`
                };
            case 'all':
            default:
                return {};
        }
    }, [timeFilter, selectedDate]);

    const handlePrevMonth = () => {
        setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
        if (next <= new Date()) {
            setSelectedDate(next);
        }
    };

    const { data: tradesData, isLoading } = useTrades({
        page_size: 5000,
        ...dateRange
    });

    const { strategyStats, typeStats, errorStats, totalErrors } = useMemo(() => {
        if (!tradesData?.trades) return {
            strategyStats: [],
            typeStats: { CALL: { count: 0, pnl: 0 }, PUT: { count: 0, pnl: 0 }, STOCK: { count: 0, pnl: 0 } },
            errorStats: [],
            totalErrors: 0
        };

        const statsMap = new Map<string, StrategyData>();
        const tStats = {
            CALL: { count: 0, pnl: 0 },
            PUT: { count: 0, pnl: 0 },
            STOCK: { count: 0, pnl: 0 },
        };
        const eStats = new Map<string, number>();
        let errCount = 0;

        ALL_STRATEGIES.forEach((strategy) => {
            statsMap.set(strategy, {
                name: strategy,
                direction: getStrategyDirection(strategy),
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                totalPnl: 0,
                avgPnl: 0,
            });
        });

        tradesData.trades.forEach((trade) => {
            if (trade.strategy) {
                const stats = statsMap.get(trade.strategy);
                if (stats) {
                    stats.totalTrades++;
                    stats.totalPnl += trade.net_pnl;
                    if (trade.net_pnl > 0) stats.winningTrades++;
                    else if (trade.net_pnl < 0) stats.losingTrades++;
                }
            }

            const type = getTradeType(trade);
            if (tStats[type]) {
                tStats[type].count++;
                tStats[type].pnl += trade.net_pnl;
            }

            if (trade.psychology_tag && trade.psychology_tag !== 'none') {
                eStats.set(trade.psychology_tag, (eStats.get(trade.psychology_tag) || 0) + 1);
                errCount++;
            }
        });

        const result: StrategyData[] = [];
        statsMap.forEach((stats) => {
            if (stats.totalTrades > 0) {
                stats.winRate = (stats.winningTrades / stats.totalTrades) * 100;
                stats.avgPnl = stats.totalPnl / stats.totalTrades;
            }
            result.push(stats);
        });

        const errorResult = Array.from(eStats.entries()).map(([tag, count]) => ({
            tag,
            count,
            percentage: (count / errCount) * 100
        })).sort((a, b) => b.count - a.count);

        return {
            strategyStats: result.sort((a, b) => b.totalTrades - a.totalTrades),
            typeStats: tStats,
            errorStats: errorResult,
            totalErrors: errCount
        };
    }, [tradesData]);

    const totals = useMemo(() => {
        return strategyStats.reduce(
            (acc, s) => ({
                trades: acc.trades + s.totalTrades,
                wins: acc.wins + s.winningTrades,
                losses: acc.losses + s.losingTrades,
                pnl: acc.pnl + s.totalPnl,
            }),
            { trades: 0, wins: 0, losses: 0, pnl: 0 }
        );
    }, [strategyStats]);

    const activeStrategies = strategyStats.filter((s) => s.totalTrades > 0);
    const callStrategies = activeStrategies.filter((s) => s.direction === 'CALL');
    const putStrategies = activeStrategies.filter((s) => s.direction === 'PUT');

    const filterLabels: Record<TimeFilter, string> = {
        month: t('dashboard.filter.month'),
        week: t('strategyStats.thisWeek'),
        last_year: t('strategyStats.filter.lastYear'),
        all: t('strategyStats.allTime'),
    };

    const periodLabel = {
        all: t('strategyStats.allTime'),
        last_year: t('strategyStats.previousYear'),
        week: t('strategyStats.thisWeek'),
        month: t('strategyStats.currentMonth'),
    }[timeFilter] ?? '';

    if (isLoading) {
        return (
            <Card glass className={cn('h-full', className)}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        {t('strategyStats.title')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="shimmer h-48 w-full rounded-lg bg-muted" />
                </CardContent>
            </Card>
        );
    }

    const renderStrategyRow = (strategy: StrategyData, totalTrades: number) => {
        const percentage = totalTrades > 0 ? (strategy.totalTrades / totalTrades) * 100 : 0;
        return (
            <div
                key={strategy.name}
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{strategy.name}</span>
                        <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            strategy.direction === 'CALL' && 'bg-success/10 text-success',
                            strategy.direction === 'PUT' && 'bg-destructive/10 text-destructive'
                        )}>
                            {strategy.direction}
                        </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all duration-500',
                                strategy.totalPnl >= 0 ? 'bg-success' : 'bg-destructive'
                            )}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <div className="text-center min-w-[50px]">
                        <div className="font-semibold">{strategy.totalTrades}</div>
                        <div className="text-muted-foreground">{percentage.toFixed(1)}%</div>
                    </div>
                    <div className="text-center min-w-[50px]">
                        <div className={cn('font-mono font-semibold', strategy.avgPnl >= 0 ? 'text-success' : 'text-destructive')}>
                            {formatCurrency(strategy.avgPnl)}
                        </div>
                        <div className="text-muted-foreground">{t('strategyStats.avg')}</div>
                    </div>
                    <div className="text-center min-w-[70px]">
                        <div className={cn('font-mono font-semibold', strategy.totalPnl >= 0 ? 'text-success' : 'text-destructive')}>
                            {strategy.totalPnl >= 0 ? '+' : ''}{formatCurrency(strategy.totalPnl)}
                        </div>
                        <div className="text-muted-foreground">{t('strategyStats.total')}</div>
                    </div>
                </div>
            </div>
        );
    };

    const renderTypeCard = (type: string, data: { count: number, pnl: number }) => {
        const totalTrades = tradesData?.trades.length || 1;
        const percentage = (data.count / totalTrades) * 100;

        return (
            <div className="flex flex-col p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                        "text-xs font-bold px-1.5 py-0.5 rounded",
                        type === 'CALL' && "bg-success/10 text-success",
                        type === 'PUT' && "bg-destructive/10 text-destructive",
                        type === 'STOCK' && "bg-blue-500/10 text-blue-500"
                    )}>{type}</span>
                    <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <div className="text-xs text-muted-foreground">{t('strategyStats.totalPnl')}</div>
                        <div className={cn("text-sm font-mono font-bold", data.pnl >= 0 ? "text-success" : "text-destructive")}>
                            {formatCurrency(data.pnl)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-muted-foreground">{t('strategyStats.tradesLabel')}</div>
                        <div className="text-xs font-semibold">{data.count}</div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Card glass className={cn('h-full', className)}>
            <CardHeader className="pb-2">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            {t('strategyStats.title')}
                        </CardTitle>

                        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg">
                            {(['month', 'week', 'last_year', 'all'] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setTimeFilter(filter)}
                                    className={cn(
                                        "px-2.5 py-1 text-[10px] uppercase font-bold rounded-md transition-all",
                                        timeFilter === filter
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                >
                                    {filterLabels[filter]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/50 pt-2 bg-secondary/20 rounded-md p-1 mt-1">
                        <div className="text-xs font-medium flex items-center gap-2 w-full">
                            {timeFilter === 'month' ? (
                                <div className="flex items-center justify-between w-full">
                                    <button
                                        onClick={handlePrevMonth}
                                        className="bg-primary/20 hover:bg-primary/40 text-primary-foreground p-1 rounded transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="flex-1 text-center font-bold text-foreground mx-4">
                                        {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                                    </span>
                                    <button
                                        onClick={handleNextMonth}
                                        disabled={selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear()}
                                        className="bg-primary/20 hover:bg-primary/40 text-primary-foreground p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <span className="font-bold text-foreground">{periodLabel}</span>
                            )}
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Trade Types Section */}
                <div className="grid grid-cols-3 gap-2">
                    {renderTypeCard('CALL', typeStats.CALL)}
                    {renderTypeCard('PUT', typeStats.PUT)}
                    {renderTypeCard('STOCK', typeStats.STOCK)}
                </div>

                {/* Strategy Section */}
                <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        {t('strategyStats.breakdown')}
                    </h3>
                    <div className="space-y-4">
                        {activeStrategies.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                                {t('strategyStats.noData')}
                            </div>
                        ) : (
                            <>
                                {callStrategies.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="text-xs font-semibold text-muted-foreground ml-1 mb-1">{t('strategyStats.callStrategies')}</div>
                                        {callStrategies.map((s) => renderStrategyRow(s, totals.trades))}
                                    </div>
                                )}
                                {putStrategies.length > 0 && (
                                    <div className="space-y-1 mt-2">
                                        <div className="text-xs font-semibold text-muted-foreground ml-1 mb-1">{t('strategyStats.putStrategies')}</div>
                                        {putStrategies.map((s) => renderStrategyRow(s, totals.trades))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Error Analysis Section */}
                <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {t('strategyStats.errorAnalysis')}
                    </h3>
                    {totalErrors === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                            {t('strategyStats.noErrors')}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2 rounded bg-destructive/5 border border-destructive/10">
                                    <div className="text-[10px] text-destructive uppercase tracking-wide font-bold mb-1">{t('strategyStats.mostFrequent')}</div>
                                    <div className="text-sm font-medium">{getPsychologyTagLabel(errorStats[0].tag)}</div>
                                    <div className="text-xs text-muted-foreground">{errorStats[0].percentage.toFixed(1)}{t('strategyStats.ofErrors')}</div>
                                </div>
                                <div className="p-2 rounded bg-success/5 border border-success/10">
                                    <div className="text-[10px] text-success uppercase tracking-wide font-bold mb-1">{t('strategyStats.leastFrequent')}</div>
                                    <div className="text-sm font-medium">{getPsychologyTagLabel(errorStats[errorStats.length - 1].tag)}</div>
                                    <div className="text-xs text-muted-foreground">{errorStats[errorStats.length - 1].percentage.toFixed(1)}{t('strategyStats.ofErrors')}</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {errorStats.map((stat) => (
                                    <div key={stat.tag} className="flex items-center gap-2 text-xs">
                                        <div className="w-24 truncate text-muted-foreground">{getPsychologyTagLabel(stat.tag)}</div>
                                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-destructive/60 rounded-full"
                                                style={{ width: `${stat.percentage}%` }}
                                            />
                                        </div>
                                        <div className="w-8 text-right font-medium">{stat.percentage.toFixed(0)}%</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
