/**
 * Interactive trades table with inline editing for psychology tags and strategies.
 */
import { useState, useMemo } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { AlertDialog } from '@/components/ui/ConfirmDialog';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    type SortingState,
    type ColumnDef,
} from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTrades, useUpdateTrade } from '@/hooks/useTrades';
import { cn, formatCurrency, formatDate, getPnlColorClass, formatOptionSymbol } from '@/lib/utils';
import { CALL_STRATEGIES, PUT_STRATEGIES, getStrategyDirection } from '@/lib/strategies';
import type { Trade, PsychologyTag } from '@/lib/types';
import { useTranslation } from '@/lib/i18n';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUpDown,
    AlertTriangle,
    AlertCircle,
    TrendingUp,
    TrendingDown,
} from 'lucide-react';

const PSYCHOLOGY_TAGS: PsychologyTag[] = [
    'none',
    'fomo',
    'revenge_trading',
    'premature_exit',
    'rule_violation',
];

/**
 * Checks whether the entry time falls within the last 5 minutes of a 30-min bar.
 * 30-min bars start at :00 and :30, so edge minutes are :25-:29 and :55-:59.
 */
function isNearBarEdge(entryTime: string | number | null | undefined): boolean {
    if (!entryTime) return false;
    const padded = String(entryTime).padStart(6, '0');
    const minutes = parseInt(padded.slice(2, 4), 10);
    if (isNaN(minutes)) return false;
    return (minutes >= 25 && minutes <= 29) || (minutes >= 55 && minutes <= 59);
}

interface TradesTableProps {
    className?: string;
}

export function TradesTable({ className }: TradesTableProps) {
    const { t } = useTranslation();
    const [sorting, setSorting] = usePersistedState<SortingState>('tj_tradesTable_sorting', []);
    const [globalFilter, setGlobalFilter] = useState('');
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null);
    const [page, setPage] = usePersistedState('tj_tradesTable_page', 1);
    const [barEdgeAlertOpen, setBarEdgeAlertOpen] = useState(false);

    const { data: tradesData, isLoading } = useTrades({ page, page_size: 20 });
    const updateTrade = useUpdateTrade();

    const getPsychologyTagLabel = (tag: string) => t(`psychTag.${tag}`);

    const handleTagChange = async (tradeId: string, tag: PsychologyTag) => {
        await updateTrade.mutateAsync({
            id: tradeId,
            data: { psychology_tag: tag },
        });
        setEditingTagId(null);
    };

    const handleStrategyChange = async (tradeId: string, strategy: string) => {
        await updateTrade.mutateAsync({
            id: tradeId,
            data: { strategy: strategy || undefined },
        });
        setEditingStrategyId(null);
    };

    const columns = useMemo<ColumnDef<Trade>[]>(
        () => [
            {
                accessorKey: 'entry_date',
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="px-0 hover:bg-transparent"
                    >
                        {t('trades.col.date')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                ),
                cell: ({ row }) => formatDate(row.getValue('entry_date')),
            },
            {
                accessorKey: 'entry_time',
                header: t('trades.col.time'),
                cell: ({ row }) => {
                    const time = row.original.entry_time;
                    if (!time) return <span className="font-mono text-xs text-muted-foreground">-</span>;

                    const padded = String(time).padStart(6, '0');
                    const hours = padded.slice(0, 2);
                    const minutes = padded.slice(2, 4);
                    const isBuyEntry = row.original.net_pnl === 0;
                    const nearEdge = isNearBarEdge(time) && isBuyEntry;

                    return (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            {hours}:{minutes}
                            {nearEdge && (
                                <button
                                    type="button"
                                    onClick={() => setBarEdgeAlertOpen(true)}
                                    title={t('trades.barEdgeAlert.title')}
                                    className="text-warning hover:text-warning/80 transition-colors cursor-help"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                </button>
                            )}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'ticker',
                header: t('trades.col.ticker'),
                cell: ({ row }) => (
                    <span className="font-mono font-medium">{formatOptionSymbol(row.getValue('ticker'))}</span>
                ),
            },
            {
                id: 'type',
                header: t('trades.col.type'),
                cell: ({ row }) => {
                    const trade = row.original;
                    let type = 'STOCK';
                    if (trade.asset_class === 'OPT' || trade.ticker.match(/\d+[CP]\d+/)) {
                        type = trade.put_call === 'C' || trade.ticker.includes('C') && !trade.ticker.includes('P') ? 'CALL' : 'PUT';
                        if (trade.put_call) {
                            type = trade.put_call === 'C' ? 'CALL' : 'PUT';
                        } else if (trade.ticker.match(/[0-9]{6}C[0-9]{8}/)) {
                            type = 'CALL';
                        } else if (trade.ticker.match(/[0-9]{6}P[0-9]{8}/)) {
                            type = 'PUT';
                        }
                    }

                    return (
                        <span className={cn(
                            'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider',
                            type === 'CALL' && 'bg-success/10 text-success border-success/20',
                            type === 'PUT' && 'bg-destructive/10 text-destructive border-destructive/20',
                            type === 'STOCK' && 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        )}>
                            {type}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'quantity',
                header: t('trades.col.qty'),
                cell: ({ row }) => (
                    <span className="font-mono text-xs">{row.getValue('quantity')}</span>
                ),
            },
            {
                accessorKey: 'entry_price',
                header: t('trades.col.price'),
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-muted-foreground">
                        {formatCurrency(row.getValue('entry_price'))}
                    </span>
                ),
            },
            {
                accessorKey: 'strategy',
                header: t('trades.col.strategy'),
                cell: ({ row }) => {
                    const trade = row.original;
                    const strategy = trade.strategy;
                    const isEditing = editingStrategyId === trade.id;
                    const direction = strategy ? getStrategyDirection(strategy) : null;

                    if (isEditing) {
                        return (
                            <div className="relative">
                                <select
                                    autoFocus
                                    value={strategy || ''}
                                    onChange={(e) => handleStrategyChange(trade.id, e.target.value)}
                                    onBlur={() => setEditingStrategyId(null)}
                                    className="bg-secondary text-foreground text-sm rounded-md px-2 py-1 border border-border focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
                                >
                                    <option value="">{t('trades.noStrategy')}</option>
                                    <optgroup label={t('trades.strategyGroup.call')}>
                                        {CALL_STRATEGIES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label={t('trades.strategyGroup.put')}>
                                        {PUT_STRATEGIES.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label={t('trades.strategyGroup.other')}>
                                        <option value="Otra Estrategia">{t('trades.otherStrategy')}</option>
                                    </optgroup>
                                </select>
                            </div>
                        );
                    }

                    return (
                        <button
                            onClick={() => setEditingStrategyId(trade.id)}
                            className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                                strategy
                                    ? 'bg-primary/10 text-foreground hover:bg-primary/20'
                                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                            )}
                        >
                            {direction === 'CALL' && <TrendingUp className="w-3 h-3 text-success" />}
                            {direction === 'PUT' && <TrendingDown className="w-3 h-3 text-destructive" />}
                            {strategy || t('trades.selectStrategy')}
                        </button>
                    );
                },
            },
            {
                accessorKey: 'net_pnl',
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="px-0 hover:bg-transparent"
                    >
                        {t('trades.col.netPnl')}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                ),
                cell: ({ row }) => {
                    const value = row.getValue<number>('net_pnl');
                    const trade = row.original;
                    if (value === 0 && !trade.exit_date) {
                        return (
                            <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                                {t('trades.buyIndicator')}
                            </span>
                        );
                    }

                    return (
                        <span className={cn('font-mono font-medium', getPnlColorClass(value))}>
                            {formatCurrency(value)}
                        </span>
                    );
                },
            },
            {
                accessorKey: 'commissions',
                header: t('trades.col.commissions'),
                cell: ({ row }) => (
                    <span className="text-muted-foreground font-mono">
                        {formatCurrency(-Math.abs(row.getValue<number>('commissions')))}
                    </span>
                ),
            },
            {
                accessorKey: 'psychology_tag',
                header: t('trades.col.errorTag'),
                cell: ({ row }) => {
                    const trade = row.original;
                    const tag = trade.psychology_tag;
                    const isEditing = editingTagId === trade.id;

                    if (isEditing) {
                        return (
                            <div className="relative">
                                <select
                                    autoFocus
                                    value={tag}
                                    onChange={(e) => handleTagChange(trade.id, e.target.value as PsychologyTag)}
                                    onBlur={() => setEditingTagId(null)}
                                    className="bg-secondary text-foreground text-sm rounded-md px-2 py-1 border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    {PSYCHOLOGY_TAGS.map((t_) => (
                                        <option key={t_} value={t_}>
                                            {getPsychologyTagLabel(t_)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }

                    return (
                        <button
                            onClick={() => setEditingTagId(trade.id)}
                            className={cn(
                                'px-2 py-0.5 rounded-md text-xs font-medium transition-colors',
                                tag === 'none'
                                    ? 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                                    : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                            )}
                        >
                            {tag !== 'none' && <AlertTriangle className="inline w-3 h-3 mr-1" />}
                            {getPsychologyTagLabel(tag)}
                        </button>
                    );
                },
            },
        ],
        [editingTagId, editingStrategyId, t]
    );

    const table = useReactTable({
        data: tradesData?.trades ?? [],
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    if (isLoading) {
        return (
            <Card glass className={cn('h-full', className)}>
                <CardHeader>
                    <CardTitle className="text-base">{t('trades.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="shimmer h-64 w-full rounded-lg bg-muted" />
                </CardContent>
            </Card>
        );
    }

    const totalPages = Math.ceil((tradesData?.total || 0) / 20);

    return (
        <>
        <Card glass className={cn('h-full overflow-hidden', className)}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{t('trades.title')}</CardTitle>
                    <input
                        type="text"
                        placeholder={t('trades.searchPlaceholder')}
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="bg-secondary text-sm rounded-md px-3 py-1.5 w-48 border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full">
                        <thead className="bg-secondary/50">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-border">
                            {table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className={cn(
                                        'transition-colors',
                                        row.original.is_error && 'trade-row-error',
                                        !row.original.is_error && row.original.net_pnl > 0 && 'trade-row-winner',
                                        !row.original.is_error && row.original.net_pnl < 0 && 'trade-row-loser',
                                        isNearBarEdge(row.original.entry_time) && row.original.net_pnl === 0 && 'trade-row-bar-edge'
                                    )}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td key={cell.id} className="px-4 py-3 text-sm whitespace-nowrap">
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                        {t('trades.pagination.showing', {
                            from: (page - 1) * 20 + 1,
                            to: Math.min(page * 20, tradesData?.total || 0),
                            total: tradesData?.total || 0,
                        })}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage(1)}
                            disabled={page === 1}
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="mx-2 text-sm">
                            {t('trades.pagination.page', { page, total: totalPages })}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage(totalPages)}
                            disabled={page === totalPages}
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
        <AlertDialog
            open={barEdgeAlertOpen}
            title={t('trades.barEdgeAlert.title')}
            description={t('trades.barEdgeAlert.description')}
            variant="info"
            onClose={() => setBarEdgeAlertOpen(false)}
        />
        </>
    );
}
