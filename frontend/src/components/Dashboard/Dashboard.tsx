/**
 * Main Dashboard page with reorganized layout.
 * Top: Net Liquidity and Monthly P&L %
 * Middle: Equity Curve, Calendar, Trading Activity
 * Bottom: Detailed KPIs
 */
import React, { useMemo } from 'react';
import { useMetricsSummary, useNAVHistory } from '@/hooks/useMetrics';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KPICard } from './KPICard';
import { GaugeChart } from './GaugeChart';
import { EquityCurve } from './EquityCurve';
import { HeatmapCalendar } from './HeatmapCalendar';
import { TradesTable } from './TradesTable';

import { Card, CardContent } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Target,
    Percent,
    Wallet,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

interface DashboardProps {
    className?: string;
    onSync?: () => void;
    isSyncing?: boolean;
}

export function Dashboard({ className, onSync, isSyncing }: DashboardProps) {
    // KPI Time Filter State
    const [kpiTimeFilter, setKpiTimeFilter] = usePersistedState<'week' | 'month' | 'quarter' | 'year' | 'all'>('tj_dashboard_kpiTimeFilter', 'all');
    const [selectedMonthYear, setSelectedMonthYear] = usePersistedState<{ year: number, month: number }>('tj_dashboard_selectedMonthYear', {
        year: new Date().getFullYear(),
        month: new Date().getMonth()
    });

    // Calculate dates based on filter
    const kpiDates = React.useMemo(() => {
        const now = new Date();
        const dates: { start_date?: string; end_date?: string } = {};

        // Helper to formatting date as YYYY-MM-DD
        const toDateStr = (d: Date) => {
            const year = d.getFullYear();
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        if (kpiTimeFilter === 'week') {
            // Start of current week (Sunday)
            const day = now.getDay();
            const diff = now.getDate() - day;
            const start = new Date(now);
            start.setDate(diff);
            dates.start_date = toDateStr(start);
        } else if (kpiTimeFilter === 'month') {
            // Specific selected month
            // Start date: 1st of selected month
            // End date: Last day of selected month (to filter correctly if backend supports range, 
            // otherwise just start date implies "from this date").
            // Existing logic uses `start_date` filter. If we want a specific historic month, 
            // we probably need start_date AND end_date filtering in backend.
            // Assuming backend filters >= start_date. 
            // If we select a past month, we want >= start of month AND <= end of month.
            // Currently useMetricsSummary takes start_date. Check if it takes end_date.
            // Looking at schemas, TradeFilters has start_date and end_date. 
            // But useMetricsSummary usually calls /metrics/summary?start_date=...

            const start = new Date(selectedMonthYear.year, selectedMonthYear.month, 1);
            const end = new Date(selectedMonthYear.year, selectedMonthYear.month + 1, 0);

            dates.start_date = toDateStr(start);
            dates.end_date = toDateStr(end);
        } else if (kpiTimeFilter === 'quarter') {
            // Start of current quarter
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            const start = new Date(now.getFullYear(), quarterMonth, 1);
            dates.start_date = toDateStr(start);
        } else if (kpiTimeFilter === 'year') {
            // Start of current year
            const start = new Date(now.getFullYear(), 0, 1);
            dates.start_date = toDateStr(start);
        }
        // 'all' leaves start undefined

        return dates;
    }, [kpiTimeFilter, selectedMonthYear]);

    // Pass filters to hook
    const { data: metrics, isLoading } = useMetricsSummary(
        kpiDates
    );

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const { data: navHistory } = useNAVHistory();

    // Get current account balance (latest NAV)
    const currentAccountBalance = useMemo(() => {
        if (!navHistory?.data || navHistory.data.length === 0) return null;
        // Sort by date descending to get the latest
        const sorted = [...navHistory.data].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        return sorted[0]?.total_equity ?? null;
    }, [navHistory]);

    // Calculate monthly P&L
    // Calculate monthly P&L based on NAV (account balance) difference
    // This shows the actual account change, not just trades P&L
    const monthlyPnl = useMemo(() => {
        if (!navHistory?.data || navHistory.data.length === 0) return { pnl: 0, percentage: 0 };

        // Target month prefix for filtering
        const targetMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const monthStartStr = `${targetMonthPrefix}-01`;

        // Sort NAV by date ascending
        const sortedNav = [...navHistory.data].sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        // Find starting balance (last NAV record BEFORE this month)
        const priorMonthRecords = sortedNav.filter(r => r.date < monthStartStr);
        let startingBalance = priorMonthRecords.length > 0
            ? priorMonthRecords[priorMonthRecords.length - 1].total_equity
            : 0;

        // If no prior month data, use the first record of this month as starting balance
        if (startingBalance === 0) {
            const thisMonthRecords = sortedNav.filter(r => r.date.startsWith(targetMonthPrefix));
            if (thisMonthRecords.length > 0) {
                startingBalance = thisMonthRecords[0].total_equity;
            }
        }

        // Find ending balance (latest NAV record of this month)
        const thisMonthRecords = sortedNav.filter(r => r.date.startsWith(targetMonthPrefix));
        const endingBalance = thisMonthRecords.length > 0
            ? thisMonthRecords[thisMonthRecords.length - 1].total_equity
            : startingBalance;

        // Calculate P&L as the difference
        const totalPnl = endingBalance - startingBalance;
        const percentage = startingBalance > 0 ? (totalPnl / startingBalance) * 100 : 0;

        return { pnl: totalPnl, percentage };
    }, [navHistory, currentYear, currentMonth]);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    return (
        <div className={cn('p-6 space-y-6', className)}>
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                </div>
            </div>

            {/* TOP SECTION: Account Balance & Monthly P&L */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Account Balance Card */}
                <Card glass className="relative overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Wallet className="w-4 h-4" />
                                    Account Balance
                                </p>
                                <p className="text-4xl font-bold font-mono mt-2 text-foreground">
                                    {currentAccountBalance !== null
                                        ? formatCurrency(currentAccountBalance)
                                        : '--'}
                                </p>
                            </div>
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <DollarSign className="w-8 h-8 text-primary" />
                            </div>
                        </div>
                    </CardContent>
                    {/* Glowing effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                </Card>

                {/* Monthly P&L Card */}
                <Card glass className="relative overflow-hidden">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    <CalendarDays className="w-4 h-4" />
                                    {monthNames[currentMonth]} {currentYear} P&L
                                </p>
                                <div className="flex items-baseline gap-3 mt-2">
                                    <p className={cn(
                                        'text-4xl font-bold font-mono',
                                        monthlyPnl.pnl >= 0 ? 'text-success' : 'text-destructive'
                                    )}>
                                        {monthlyPnl.pnl >= 0 ? '+' : ''}{formatCurrency(monthlyPnl.pnl)}
                                    </p>
                                    <span className={cn(
                                        'text-xl font-semibold',
                                        monthlyPnl.percentage >= 0 ? 'text-success' : 'text-destructive'
                                    )}>
                                        ({monthlyPnl.percentage >= 0 ? '+' : ''}{monthlyPnl.percentage.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>
                            <div className={cn(
                                'w-16 h-16 rounded-full flex items-center justify-center',
                                monthlyPnl.pnl >= 0 ? 'bg-success/10' : 'bg-destructive/10'
                            )}>
                                {monthlyPnl.pnl >= 0
                                    ? <TrendingUp className="w-8 h-8 text-success" />
                                    : <TrendingDown className="w-8 h-8 text-destructive" />
                                }
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* MIDDLE SECTION: Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Equity Curve - Wide */}
                <div className="lg:col-span-3">
                    <EquityCurve
                        showAdjusted={false}
                        externalPeriodPnl={monthlyPnl.pnl}
                        externalPeriodPercentage={monthlyPnl.percentage}
                    />
                </div>

                {/* Mini Heatmap Calendar - Compact */}
                <div className="lg:col-span-1">
                    <HeatmapCalendar compact onSync={onSync} isSyncing={isSyncing} />
                </div>
            </div>

            {/* Trading Activity - Full Width Expanded Calendar */}
            <HeatmapCalendar onSync={onSync} isSyncing={isSyncing} />



            {/* BOTTOM SECTION: Detailed KPIs */}
            <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-lg font-semibold">Detailed Statistics</h3>
                    <div className="flex items-center gap-2">
                        {/* Month Selector used when filter is 'month' */}
                        {kpiTimeFilter === 'month' && (
                            <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-md">
                                <button
                                    onClick={() => {
                                        const newDate = new Date(selectedMonthYear.year, selectedMonthYear.month - 1);
                                        setSelectedMonthYear({ year: newDate.getFullYear(), month: newDate.getMonth() });
                                    }}
                                    className="p-1 hover:bg-background/50 rounded transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-semibold px-2 min-w-[100px] text-center">
                                    {new Date(selectedMonthYear.year, selectedMonthYear.month).toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    onClick={() => {
                                        const newDate = new Date(selectedMonthYear.year, selectedMonthYear.month + 1);
                                        setSelectedMonthYear({ year: newDate.getFullYear(), month: newDate.getMonth() });
                                    }}
                                    className="p-1 hover:bg-background/50 rounded transition-colors text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-lg">
                            {(['week', 'month', 'quarter', 'year', 'all'] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setKpiTimeFilter(filter)}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                        kpiTimeFilter === filter
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                    )}
                                >
                                    {filter === 'all' ? 'All Time' :
                                        filter === 'year' ? 'YTD' :
                                            filter === 'week' ? 'This Week' :
                                                filter === 'month' ? 'Month' :
                                                    'This Quarter'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={cn(
                    "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4",
                    isLoading && "opacity-50 pointer-events-none transition-opacity duration-200"
                )}>
                    <KPICard
                        title="Win Rate"
                        value={metrics?.win_rate ?? 0}
                        format="percent"
                        icon={<Target className="w-5 h-5" />}
                    />

                    <KPICard
                        title="Winning Trades"
                        value={metrics?.winning_trades ?? 0}
                        format="number"
                        icon={<TrendingUp className="w-5 h-5" />}
                    />

                    <KPICard
                        title="Losing Trades"
                        value={metrics?.losing_trades ?? 0}
                        format="number"
                        icon={<TrendingDown className="w-5 h-5" />}
                    />

                    {/* Profit Factor Gauge */}
                    <div className="glass-card rounded-lg p-4 flex flex-col items-center justify-center">
                        <GaugeChart
                            value={metrics?.profit_factor ?? 0}
                            label="Profit Factor"
                        />
                    </div>

                    <KPICard
                        title="Average Win"
                        value={metrics?.average_win ?? 0}
                        icon={<TrendingUp className="w-5 h-5" />}
                    />

                    <KPICard
                        title="Average Loss"
                        value={-(metrics?.average_loss ?? 0)}
                        icon={<TrendingDown className="w-5 h-5" />}
                    />

                    <KPICard
                        title="Commissions"
                        value={-(metrics?.total_commissions ?? 0)}
                        icon={<Percent className="w-5 h-5" />}
                    />

                    <KPICard
                        title="Total Trades"
                        value={metrics?.total_trades ?? 0}
                        format="number"
                        icon={<Target className="w-5 h-5" />}
                    />
                </div>
            </div>

            {/* Trades Table - Full Width */}
            <TradesTable />
        </div>
    );
}
