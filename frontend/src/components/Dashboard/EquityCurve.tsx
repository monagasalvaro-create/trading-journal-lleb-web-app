/**
 * Equity Curve Chart using Recharts.
 * Displays account balance over time with multiple time perspectives.
 */
import { useMemo } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNAVHistory } from '@/hooks/useMetrics';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useTranslation, useMonthNames } from '@/lib/i18n';
import { Calendar, CalendarDays, CalendarRange, History, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';

type TimePerspective = 'month' | 'days' | 'thisWeek' | 'months' | 'years';

interface EquityCurveProps {
    showAdjusted?: boolean;
    className?: string;
    externalPeriodPnl?: number;
    externalPeriodPercentage?: number;
}

interface ChartDataPoint {
    date: string;
    periodFormatted: string;
    accountBalance: number;
    dailyChange: number;
}

export function EquityCurve({ className, externalPeriodPnl, externalPeriodPercentage }: EquityCurveProps) {
    const { t } = useTranslation();
    const monthNames = useMonthNames();
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [perspective, setPerspective] = usePersistedState<TimePerspective>('tj_equityCurve_perspective', 'month');
    const [selectedMonthYear, setSelectedMonthYear] = usePersistedState<{ year: number; month: number }>('tj_equityCurve_selectedMonthYear', {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
    });
    const { data: navHistory, isLoading } = useNAVHistory();

    const chartData = useMemo(() => {
        if (!navHistory?.data || navHistory.data.length === 0) return [];

        const sorted = [...navHistory.data].sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        const now = new Date();

        let filtered = sorted;
        let baselineBalance = 0;
        let startDate: Date | null = null;

        if (perspective === 'month' || perspective === 'thisWeek') {
            let startDateRef: Date;
            let endDateRef: Date | null = null;

            if (perspective === 'month') {
                startDateRef = new Date(selectedMonthYear.year, selectedMonthYear.month, 1);
                endDateRef = new Date(selectedMonthYear.year, selectedMonthYear.month + 1, 0);
            } else {
                const day = now.getDay();
                const diff = now.getDate() - day;
                startDateRef = new Date(now);
                startDateRef.setDate(diff);
                startDateRef.setHours(0, 0, 0, 0);
            }

            startDate = startDateRef;
            const startStr = `${startDateRef.getFullYear()}-${String(startDateRef.getMonth() + 1).padStart(2, '0')}-${String(startDateRef.getDate()).padStart(2, '0')}`;
            const endStr = endDateRef
                ? `${endDateRef.getFullYear()}-${String(endDateRef.getMonth() + 1).padStart(2, '0')}-${String(endDateRef.getDate()).padStart(2, '0')}`
                : null;

            const prePeriodRecords = sorted.filter(d => d.date < startStr);
            if (prePeriodRecords.length > 0) {
                baselineBalance = prePeriodRecords[prePeriodRecords.length - 1].total_equity;
            } else {
                baselineBalance = sorted.find(d => d.date >= startStr)?.total_equity || 0;
            }

            filtered = sorted.filter(d => d.date >= startStr && (endStr ? d.date <= endStr : true));
        } else {
            baselineBalance = sorted.length > 0 ? sorted[0].total_equity : 0;
        }

        const dataPoints: ChartDataPoint[] = [];

        if ((perspective === 'month' || perspective === 'thisWeek') && baselineBalance > 0 && startDate) {
            dataPoints.push({
                date: startDate.toISOString().split('T')[0],
                periodFormatted: t('equityCurve.start'),
                accountBalance: baselineBalance,
                dailyChange: 0
            });
        }

        let prevBalance = baselineBalance > 0 ? baselineBalance : (filtered.length > 0 ? filtered[0].total_equity : 0);

        filtered.forEach((d) => {
            const [year, month, day] = d.date.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const dailyChange = d.total_equity - prevBalance;

            let periodFormatted: string;
            let periodKey: string;

            switch (perspective) {
                case 'month':
                case 'thisWeek':
                    periodFormatted = perspective === 'month' ? `${date.getDate()}` : `${date.getMonth() + 1}/${date.getDate()}`;
                    periodKey = d.date;
                    break;
                case 'months': {
                    periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                    periodFormatted = `${shortMonths[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
                    break;
                }
                case 'years':
                    periodKey = date.getFullYear().toString();
                    periodFormatted = date.getFullYear().toString();
                    break;
                default:
                    periodKey = d.date;
                    periodFormatted = formatDate(d.date);
            }

            if (perspective === 'months' || perspective === 'years') {
                const existingIdx = dataPoints.findIndex(p => p.date === periodKey);
                if (existingIdx >= 0) {
                    dataPoints[existingIdx].accountBalance = d.total_equity;
                    dataPoints[existingIdx].dailyChange += dailyChange;
                } else {
                    dataPoints.push({ date: periodKey, periodFormatted, accountBalance: d.total_equity, dailyChange });
                }
            } else {
                dataPoints.push({ date: d.date, periodFormatted, accountBalance: d.total_equity, dailyChange });
            }

            prevBalance = d.total_equity;
        });

        return dataPoints;
    }, [navHistory, perspective, selectedMonthYear, t]);

    const summaryStats = useMemo(() => {
        if (!chartData || chartData.length === 0) return null;

        const lastBalance = chartData[chartData.length - 1].accountBalance;

        const isCurrentMonth = perspective === 'month'
            && selectedMonthYear.year === new Date().getFullYear()
            && selectedMonthYear.month === new Date().getMonth();

        if (isCurrentMonth && externalPeriodPnl !== undefined && externalPeriodPercentage !== undefined) {
            return { currentBalance: lastBalance, totalChange: externalPeriodPnl, percentChange: externalPeriodPercentage };
        }

        const firstBalance = chartData[0].accountBalance;
        const totalChange = lastBalance - firstBalance;
        const percentChange = firstBalance > 0 ? (totalChange / firstBalance) * 100 : 0;

        return { currentBalance: lastBalance, totalChange, percentChange };
    }, [chartData, perspective, externalPeriodPnl, externalPeriodPercentage, selectedMonthYear]);

    const perspectiveOptions: { value: TimePerspective; label: string; icon: React.ReactNode }[] = [
        { value: 'month', label: t('equityCurve.perspective.month'), icon: <CalendarCheck className="w-3.5 h-3.5" /> },
        { value: 'days', label: t('equityCurve.perspective.days'), icon: <CalendarDays className="w-3.5 h-3.5" /> },
        { value: 'thisWeek', label: t('equityCurve.perspective.thisWeek'), icon: <CalendarRange className="w-3.5 h-3.5" /> },
        { value: 'months', label: t('equityCurve.perspective.months'), icon: <Calendar className="w-3.5 h-3.5" /> },
        { value: 'years', label: t('equityCurve.perspective.years'), icon: <History className="w-3.5 h-3.5" /> },
    ];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0]?.payload as ChartDataPoint;
            return (
                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-medium mb-2">{data?.periodFormatted}</p>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-muted-foreground">{t('equityCurve.tooltip.balance')}</span>
                            <span className="font-mono font-medium text-foreground">
                                {formatCurrency(data?.accountBalance || 0)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <div className="w-2 h-2 rounded-full bg-muted" />
                            <span className="text-muted-foreground">{t('equityCurve.tooltip.change')}</span>
                            <span className={cn('font-mono font-medium', (data?.dailyChange ?? 0) >= 0 ? 'text-success' : 'text-destructive')}>
                                {(data?.dailyChange ?? 0) >= 0 ? '+' : ''}{formatCurrency(data?.dailyChange || 0)}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (isLoading) {
        return (
            <Card glass className={cn('h-full', className)}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('equityCurve.title')}</CardTitle>
                </CardHeader>
                <CardContent className="h-[350px] flex items-center justify-center">
                    <div className="shimmer w-full h-full rounded-lg bg-muted" />
                </CardContent>
            </Card>
        );
    }

    if (!chartData || chartData.length === 0) {
        return (
            <Card glass className={cn('h-full', className)}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t('equityCurve.title')}</CardTitle>
                </CardHeader>
                <CardContent className="h-[350px] flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-muted-foreground">{t('equityCurve.noData')}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t('equityCurve.syncHint')}</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const balances = chartData.map(d => d.accountBalance);
    const minBalance = Math.min(...balances);
    const maxBalance = Math.max(...balances);
    const padding = (maxBalance - minBalance) * 0.1 || 1000;
    const yDomain = [Math.floor((minBalance - padding) / 1000) * 1000, Math.ceil((maxBalance + padding) / 1000) * 1000];

    return (
        <Card glass className={cn('h-full', className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">{t('equityCurve.title')}</CardTitle>

                    <div className="flex items-center gap-2">
                        {perspective === 'month' && (
                            <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-md">
                                <button
                                    onClick={() => {
                                        const prev = new Date(selectedMonthYear.year, selectedMonthYear.month - 1);
                                        setSelectedMonthYear({ year: prev.getFullYear(), month: prev.getMonth() });
                                    }}
                                    className="p-1 hover:bg-background/50 rounded transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-semibold px-2 min-w-[120px] text-center">
                                    {monthNames[selectedMonthYear.month]} {selectedMonthYear.year}
                                </span>
                                <button
                                    onClick={() => {
                                        const next = new Date(selectedMonthYear.year, selectedMonthYear.month + 1);
                                        setSelectedMonthYear({ year: next.getFullYear(), month: next.getMonth() });
                                    }}
                                    className="p-1 hover:bg-background/50 rounded transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg">
                            {perspectiveOptions.map((option) => (
                                <Button
                                    key={option.value}
                                    variant={perspective === option.value ? 'default' : 'ghost'}
                                    size="sm"
                                    className={cn(
                                        'h-7 px-2.5 text-xs gap-1.5',
                                        perspective === option.value && 'shadow-sm'
                                    )}
                                    onClick={() => setPerspective(option.value)}
                                >
                                    {option.icon}
                                    {option.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                {summaryStats && (
                    <div className="flex gap-6 mt-2">
                        <div>
                            <span className="text-xs text-muted-foreground">{t('equityCurve.current')} </span>
                            <span className="text-sm font-semibold text-foreground">
                                {formatCurrency(summaryStats.currentBalance)}
                            </span>
                        </div>
                        <div>
                            <span className="text-xs text-muted-foreground">{t('equityCurve.periodChange')} </span>
                            <span className={cn('text-sm font-semibold', summaryStats.totalChange >= 0 ? 'text-success' : 'text-destructive')}>
                                {summaryStats.totalChange >= 0 ? '+' : ''}{formatCurrency(summaryStats.totalChange)}
                                <span className="text-xs ml-1">
                                    ({summaryStats.percentChange >= 0 ? '+' : ''}{summaryStats.percentChange.toFixed(2)}%)
                                </span>
                            </span>
                        </div>
                    </div>
                )}
            </CardHeader>
            <CardContent className="h-[350px] pb-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(243, 75%, 59%)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(243, 75%, 59%)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="periodFormatted"
                            tick={{ fontSize: 10, fill: 'hsl(215, 20.2%, 65.1%)' }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            domain={yDomain}
                            tick={{ fontSize: 10, fill: 'hsl(215, 20.2%, 65.1%)' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                            width={50}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="accountBalance"
                            stroke="hsl(243, 75%, 59%)"
                            strokeWidth={2}
                            fill="url(#balanceGradient)"
                            name="Account Balance"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
