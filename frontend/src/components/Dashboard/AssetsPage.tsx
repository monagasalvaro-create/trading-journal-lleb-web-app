
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { formatOptionSymbol } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { strikeCalculatorApi, fetchApi } from '@/lib/api';
import { ConfirmDialog, AlertDialog } from '@/components/ui/ConfirmDialog';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    useDroppable,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Calendar,
    Plus,
    X,
    RefreshCw,
    AlertTriangle,
    Info,
} from 'lucide-react';
import { IBKRConnectionError } from '@/components/ui/IBKRConnectionError';
import { useTranslation } from '@/lib/i18n';

// --- API Helper ---
// Using relative path to avoid CORS/Origin issues
const API_BASE = '/api/assets/';

const getUrl = (path: string = '') => {
    // If path is empty, return base (which has slash)
    if (!path) return API_BASE;
    // ensure path doesn't start with slash
    const sub = path.startsWith('/') ? path.slice(1) : path;
    return `${API_BASE}${sub}`;
};

const authFetch = async (url: string, options: RequestInit = {}) => {
    try {
        // fetchApi internal base is '/api'. If url contains '/api', remove it to avoid '/api/api/...'
        const endpoint = url.startsWith('/api') ? url.slice(4) : url;
        const data = await fetchApi(endpoint, options);
        return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data)
        } as any;
    } catch (e: any) {
        if (e.name === 'ApiError') {
            return {
                ok: false,
                status: e.status,
                json: async () => ({ detail: e.message }),
                text: async () => e.message
            } as any;
        }
        throw e;
    }
};

// --- Date Helpers ---
const formatDateAPI = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateDisplay = (d: Date) => {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const addDays = (d: Date, days: number) => {
    const newDate = new Date(d);
    newDate.setDate(d.getDate() + days);
    return newDate;
};

const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
};

// --- Types ---

type ViewFilter = 'all' | 'actual' | 'planned';

type Asset = {
    id: number;
    symbol: string;
    board_type: 'portfolio' | 'options';
    column_id: string;
    position: number;
    invested_amount?: number;
    net_pnl?: number;
    is_closed?: boolean;
    has_stop?: boolean;
    date: string;
};

type SegmentAllocation = {
    total: number;
    asset_count: number;
    per_asset: number;
    one_third_five_pct?: number;
};

type CapitalData = {
    net_liquidation: number | null;
    stocks_pct: number;
    options_pct: number;
    segments: Record<string, SegmentAllocation>;
    options_allocation: SegmentAllocation | null;
    error: string | null;
};

// --- Helpers ---

/** Extract the underlying ticker from a symbol (e.g., 'IWM   260220C00269000' → 'IWM'). */
function getUnderlying(symbol: string): string {
    return symbol.replace(/\s.*$/, '').toUpperCase();
}

// --- Subcomponents ---

function SortableItem({ asset, onDelete, isOutOfPlan, onOutOfPlanClick, onMissingStopClick, onStrikeErrorClick }: { asset: Asset; onDelete: (id: number) => void; isOutOfPlan?: boolean; onOutOfPlanClick?: () => void; onMissingStopClick?: () => void; onStrikeErrorClick?: (error: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: asset.id, data: { asset } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // Closed-trade coloring: strictly check for true so undefined/null defaults to "open"
    const isClosed = asset.is_closed === true;
    const isFromSync = asset.invested_amount != null && asset.invested_amount > 0;
    const pnl = asset.net_pnl ?? 0;
    const isWin = isClosed && pnl > 0;
    const isLoss = isClosed && pnl < 0;
    const isBuy = !isClosed && isFromSync;

    const portfolioCols = ['60', '30', '10', 'active'];
    const isMissingStop = isBuy && portfolioCols.includes(asset.column_id) && asset.has_stop === false;

    const isOptionsBoard = asset.board_type === 'options';
    const isPlanned = !isFromSync;
    const shouldFetchStrikes = isOptionsBoard && isPlanned && ['calls', 'puts', 'underlying'].includes(asset.column_id);

    // Extract underlying ticker from full OCC option symbol (e.g. "AAPL 230115C00150000" → "AAPL")
    const underlyingTicker = asset.symbol.match(/^([A-Z]+)/)?.[1] || asset.symbol;

    const { data: strikeData, isLoading: isLoadingStrikes } = useQuery({
        queryKey: ['strike', underlyingTicker],
        queryFn: () => strikeCalculatorApi.calculate(underlyingTicker),
        enabled: shouldFetchStrikes,
        staleTime: 60000,
        refetchInterval: 60000,
        retry: 1,
    });

    const closedClass = isWin
        ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
        : isLoss
            ? 'bg-red-500/15 border-red-500/30 hover:bg-red-500/25'
            : isBuy
                ? 'bg-blue-500/10 border-blue-500/25 hover:bg-blue-500/20'
                : 'bg-card/50 hover:bg-card border-border';

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`group relative ${closedClass} border p-3 rounded-md mb-2 cursor-grab active:cursor-grabbing text-sm font-medium shadow-sm transition-colors`}
        >
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span>{formatOptionSymbol(asset.symbol)}</span>
                    {shouldFetchStrikes && (
                        <div className="flex items-center gap-1 cursor-help" title={strikeData?.price ? `Price: $${strikeData.price}` : "Fetching live strikes..."}>
                            {isLoadingStrikes ? (
                                <span className="text-[9px] text-muted-foreground bg-secondary/50 px-1 py-0.5 rounded animate-pulse">Wait...</span>
                            ) : strikeData?.success ? (
                                asset.column_id === 'calls' ? (
                                    <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono px-1.5 py-0.5 rounded shadow-sm">C: {strikeData.strike_call}</span>
                                ) : asset.column_id === 'puts' ? (
                                    <span className="text-[10px] bg-red-500/15 border border-red-500/30 text-red-400 font-mono px-1.5 py-0.5 rounded shadow-sm">P: {strikeData.strike_put}</span>
                                ) : (
                                    <span className="text-[10px] bg-zinc-500/15 border border-zinc-500/30 text-zinc-300 font-mono px-1.5 py-0.5 rounded shadow-sm">P: {strikeData.strike_put} | C: {strikeData.strike_call}</span>
                                )
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStrikeErrorClick?.(strikeData?.message || 'Unknown Error');
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="p-0.5 text-destructive/80 hover:text-destructive bg-destructive/10 rounded-md transition-all"
                                    title="Technical Error Details"
                                >
                                    <Info className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    )}
                    {isBuy && (
                        <span className="text-[9px] font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">
                            BUY
                        </span>
                    )}
                    {isMissingStop && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onMissingStopClick?.();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="flex items-center text-red-500/90 gap-1 bg-red-500/10 px-1 py-0.5 rounded hover:bg-red-500/20 transition-colors"
                            title={'Caution: Missing Stop-Loss Order'}
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-semibold">NO STOP</span>
                        </button>
                    )}
                    {isOutOfPlan && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onOutOfPlanClick?.();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="text-amber-400 hover:text-amber-300 transition-colors"
                            title="Out-of-Plan Activity Detected"
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {asset.invested_amount != null && asset.invested_amount > 0 && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                            ${asset.invested_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                    )}
                    {isClosed && asset.net_pnl != null && asset.net_pnl !== 0 && (
                        <span className={`text-[10px] font-mono font-semibold ${asset.net_pnl > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                            {asset.net_pnl > 0 ? '+' : ''}
                            ${asset.net_pnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                    )}
                </div>
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(asset.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 text-destructive rounded transition-all"
                title="Delete"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
}

function Column({
    id,
    title,
    assets,
    color,
    onAdd,
    onDelete,
    allocation,
    outOfPlanIds,
    onOutOfPlanClick,
    onMissingStopClick,
    onStrikeErrorClick,
}: {
    id: string;
    title: string;
    assets: Asset[];
    color: string;
    onAdd: (columnId: string, name: string) => void;
    onDelete: (id: number) => void;
    allocation?: SegmentAllocation | null;
    outOfPlanIds?: Set<number>;
    onOutOfPlanClick?: () => void;
    onMissingStopClick?: () => void;
    onStrikeErrorClick?: (error: string) => void;
}) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newName.trim()) {
            onAdd(id, newName.trim());
            setNewName('');
            setIsAdding(false);
        }
    };

    const activeCount = assets.length;

    return (
        <div className="flex-1 min-w-[200px] bg-secondary/20 p-4 rounded-xl flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${color}`}>
                        {title}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">{activeCount}</span>
                </div>
            </div>
            {/* Capital allocation info */}
            {allocation && allocation.total > 0 && (() => {
                const investedSum = assets.reduce((sum, a) => sum + (a.invested_amount ?? 0), 0);
                const remaining = allocation.total - investedSum;
                return (
                    <div className="mb-3 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/10">
                        <div className="text-xs font-semibold text-primary">
                            Total: ${allocation.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[11px] mt-0.5 font-medium ${remaining >= 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                            Remaining: ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                );
            })()}

            {/* Sortable Area */}
            <SortableContext items={assets.map(a => a.id)} strategy={verticalListSortingStrategy}>
                <div className="flex-1 overflow-y-auto min-h-[50px]">
                    {assets.map((asset) => (
                        <SortableItem key={asset.id} asset={asset} onDelete={onDelete} isOutOfPlan={outOfPlanIds?.has(asset.id)} onOutOfPlanClick={onOutOfPlanClick} onMissingStopClick={onMissingStopClick} onStrikeErrorClick={onStrikeErrorClick} />
                    ))}
                </div>
            </SortableContext>

            {/* Add New Button */}
            {isAdding ? (
                <form onSubmit={handleSubmit} className="mt-2">
                    <input
                        autoFocus
                        type="text"
                        className="w-full bg-background border border-primary/50 rounded px-2 py-1 text-sm outline-none ring-1 ring-primary"
                        placeholder="Symbol..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={() => !newName && setIsAdding(false)}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button type="submit" className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Done</button>
                        <button type="button" onClick={() => setIsAdding(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    </div>
                </form>
            ) : (
                <button
                    onClick={() => setIsAdding(true)}
                    className="mt-2 flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm py-1 px-2 rounded hover:bg-white/5 transition-colors w-full"
                >
                    <Plus className="w-4 h-4" /> New Item
                </button>
            )}
        </div>
    );
}

function ColumnDropWrapper(props: any) {
    const { setNodeRef } = useDroppable({
        id: props.id,
    });

    return (
        <div ref={setNodeRef} className="h-full">
            <Column {...props} allocation={props.allocation} onStrikeErrorClick={props.onStrikeErrorClick} />
        </div>
    );
}

function BoardNotes({ boardType, selectedDate }: { boardType: 'portfolio' | 'options', selectedDate: Date }) {
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    useEffect(() => {
        const dateStr = formatDateAPI(selectedDate);
        authFetch(getUrl(`/notes/${boardType}?target_date=${dateStr}`))
            .then(res => res.json())
            .then(data => setNotes(data.content || ''))
            .catch(e => {
                console.error("Failed to load notes", e);
                setNotes('');
            });
    }, [boardType, selectedDate]);

    const handleSave = async (newContent: string) => {
        setIsSaving(true);
        const dateStr = formatDateAPI(selectedDate);
        try {
            await authFetch(getUrl(`/notes/${boardType}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, content: newContent })
            });
        } catch (e) { console.error("Failed to save note", e); }
        setIsSaving(false);
    };

    const handleClearNotes = () => {
        setShowClearConfirm(true);
    };

    return (
        <div className="mt-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
            >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Notes
                {isSaving && <span className="text-[10px] text-primary animate-pulse">Saving...</span>}
            </button>
            {isOpen && (
                <div className="mt-2 bg-secondary/10 p-4 rounded-xl border border-white/5">
                    <div className="flex justify-end mb-2">
                        <button
                            onClick={handleClearNotes}
                            className="text-[10px] px-2 py-0.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onBlur={() => handleSave(notes)}
                        placeholder={`Add notes for ${boardType === 'portfolio' ? 'Portfolio' : 'Options'}...`}
                        className="w-full h-24 bg-background/50 border border-white/10 rounded-md p-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                    />
                </div>
            )}
            <ConfirmDialog
                open={showClearConfirm}
                title="Clear Notes"
                description="Are you sure you want to clear all notes?"
                confirmLabel="Clear"
                variant="destructive"
                onConfirm={() => {
                    setShowClearConfirm(false);
                    setNotes('');
                    handleSave('');
                }}
                onCancel={() => setShowClearConfirm(false)}
            />
        </div>
    );
}

// --- Main Component ---

export function AssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [activeDragItem, setActiveDragItem] = useState<Asset | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncError, setLastSyncError] = useState<string | null>(null);
    const [capitalData, setCapitalData] = useState<CapitalData | null>(null);
    const [viewFilter, setViewFilter] = useState<ViewFilter>('all');
    const { t } = useTranslation();

    // --- Dialog state for replacing native confirm()/alert() ---
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        description?: string;
        confirmLabel?: string;
        variant?: 'default' | 'destructive';
    }>({ title: '' });
    const pendingConfirmAction = useRef<(() => void) | null>(null);

    const [alertOpen, setAlertOpen] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        title: string;
        description?: string;
        variant?: 'default' | 'destructive' | 'info';
    }>({ title: '' });

    const showConfirm = useCallback((config: typeof confirmConfig, onConfirm: () => void) => {
        setConfirmConfig(config);
        pendingConfirmAction.current = onConfirm;
        setConfirmOpen(true);
    }, []);

    const showAlert = useCallback((title: string, description?: string, variant?: 'default' | 'destructive' | 'info') => {
        setAlertConfig({ title, description, variant: variant ?? 'destructive' });
        setAlertOpen(true);
    }, []);

    const fetchCapital = async (dateVal: Date) => {
        const dateStr = formatDateAPI(dateVal);
        try {
            // First get live net liquidation from local connector (if TWS is open)
            let netLiq: number | undefined;
            try {
                const portRes = await fetch('http://127.0.0.1:8765/portfolio');
                if (portRes.ok) {
                    const portData = await portRes.json();
                    if (portData.success && portData.summary) {
                        netLiq = portData.summary.net_liquidation;
                    }
                }
            } catch (e) {
                // Ignore connector errors for capital fetch, backend will return defaults
            }

            const url = `capital-allocation?target_date=${dateStr}${netLiq ? `&net_liquidation=${netLiq}` : ''}`;
            const res = await authFetch(getUrl(url));
            if (res.ok) {
                const data = await res.json();
                // Only update state if data actually changed to avoid unnecessary re-renders
                setCapitalData(prev => {
                    if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
                    return data;
                });
            }
        } catch (e) {
            console.error('Failed to fetch capital allocation', e);
        }
    };

    const fetchAssets = async (dateVal: Date, { silent = false } = {}) => {
        if (!silent) {
            setIsLoading(true);
            setError(null);
        }
        const dateStr = formatDateAPI(dateVal);
        try {
            const res = await authFetch(getUrl(`?target_date=${dateStr}`));
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();
            setAssets(data);
        } catch (e: any) {
            console.error(e);
            if (!silent) setError(e.message || "Failed to load assets");
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const pullPositionsFromConnector = async () => {
        const res = await fetch('http://127.0.0.1:8765/positions');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Could not connect to IBKR");
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to fetch positions");
        return data.positions || [];
    };

    // Silent sync: fetches live positions from IBKR without UI alerts
    const silentSyncPositions = async (dateVal: Date) => {
        const dateStr = formatDateAPI(dateVal);
        try {
            const positions = await pullPositionsFromConnector();
            await authFetch(getUrl(`/sync-client-positions?target_date=${dateStr}`), { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions })
            });
        } catch (e) {
            // Silent — errors are non-blocking during background refresh
            console.error('Silent sync failed:', e);
        }
    };

    // Fetch assets when date changes; auto-refresh every 30s when viewing today
    // When viewing today, immediately sync from IBKR on mount/date-change
    useEffect(() => {
        const initialize = async () => {
            if (isToday(selectedDate)) {
                // Sync live positions first, then fetch updated data
                await silentSyncPositions(selectedDate);
            }
            fetchAssets(selectedDate);
            fetchCapital(selectedDate);
        };
        initialize();

        if (!isToday(selectedDate)) return;

        const interval = setInterval(async () => {
            // First sync live positions from IBKR, then read the updated data
            await silentSyncPositions(selectedDate);
            fetchAssets(selectedDate, { silent: true });
            fetchCapital(selectedDate);
        }, 30_000);

        return () => clearInterval(interval);
    }, [selectedDate]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const found = assets.find(a => a.id === active.id);
        if (found) setActiveDragItem(found);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragItem(null);

        const activeId = active.id;
        const activeAsset = assets.find(a => a.id === activeId);
        if (!activeAsset) return;

        let targetColumnId: string | undefined;

        const portfolioCols = ['60', '30', '10', 'active'];
        const optionsCols = ['calls', 'puts', 'underlying'];
        const validCols = activeAsset.board_type === 'portfolio' ? portfolioCols : optionsCols;

        if (over) {
            const overId = over.id;
            const overAsset = assets.find(a => a.id === overId);

            if (overAsset) {
                if (overAsset.board_type === activeAsset.board_type) {
                    targetColumnId = overAsset.column_id;
                }
            } else {
                if (validCols.includes(String(overId))) {
                    targetColumnId = String(overId);
                }
            }
        }

        if (!targetColumnId) {
            // Default fallback if dropped outside
            // targetColumnId = activeAsset.board_type === 'portfolio' ? 'active' : 'underlying';
            // Actually, if dropped outside, do nothing (cancel move)
            return;
        }

        // --- Move Logic ---

        // 1. Moving between columns
        if (activeAsset.column_id !== targetColumnId) {
            // Optimistic update
            const updated = assets.map(a =>
                a.id === activeAsset.id ? { ...a, column_id: targetColumnId! } : a
            );
            setAssets(updated);

            // API Call
            try {
                const res = await authFetch(getUrl(`/${activeAsset.id}/move`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ column_id: targetColumnId, position: 0 })
                });

                if (!res.ok) {
                    console.error("Failed to save move:", res.status);
                }
                // Refresh capital allocation after move
                fetchCapital(selectedDate);
            } catch (e) {
                console.error("Network error moving item", e);
            }
        }
        // 2. Reordering within same column (not implemented in backend adequately usually, but frontend can reflect it)
        else if (over && active.id !== over.id) {
            const oldIndex = assets.findIndex(a => a.id === active.id);
            const newIndex = assets.findIndex(a => a.id === over.id);

            // Ensure drag is within same board context
            const overAsset = assets.find(a => a.id === over.id);
            if (overAsset && overAsset.board_type === activeAsset.board_type) {
                setAssets((items) => arrayMove(items, oldIndex, newIndex));
                // Save position if API supported exact indexing
            }
        }
    };

    const handleAdd = async (columnId: string, name: string) => {
        const boardType = ['calls', 'puts', 'underlying'].includes(columnId) ? 'options' : 'portfolio';

        try {
            const res = await authFetch(getUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: name,
                    board_type: boardType,
                    column_id: columnId,
                    date: formatDateAPI(selectedDate)
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error("API error adding:", res.status, errText);
                showAlert('Error saving item', `Server returned status ${res.status}`);
                return;
            }

            const newAsset = await res.json();
            if (newAsset && typeof newAsset.id === 'number') {
                setAssets(prev => [...prev, newAsset]);
                // Refresh capital allocation after adding asset
                fetchCapital(selectedDate);
            } else {
                showAlert('Invalid response', 'Server response was not in the expected format');
            }
        } catch (e) {
            console.error("Network error adding", e);
            showAlert('Network error', 'Could not save item. Check your connection.');
        }
    };

    const handleClear = async (boardType: 'portfolio' | 'options') => {
        showConfirm(
            {
                title: 'Clear Board',
                description: 'Are you sure you want to clear all items from this board? This action cannot be undone.',
                confirmLabel: 'Clear All',
                variant: 'destructive',
            },
            async () => {
                const dateStr = formatDateAPI(selectedDate);
                try {
                    const res = await authFetch(getUrl(`/board/${boardType}?target_date=${dateStr}`), { method: 'DELETE' });
                    if (!res.ok) {
                        showAlert('Clear failed', 'Failed to clear board');
                        return;
                    }
                    setAssets(assets.filter(a => a.board_type !== boardType));
                    fetchCapital(selectedDate);
                } catch (e) {
                    console.error("Failed to clear board", e);
                    showAlert('Network error', 'Could not clear board. Check your connection.');
                }
            }
        );
    };

    const handleReset = async (boardType: 'portfolio' | 'options') => {
        const dateStr = formatDateAPI(selectedDate);
        try {
            const res = await authFetch(getUrl(`/board/${boardType}/reset?target_date=${dateStr}`), { method: 'POST' });
            if (!res.ok) {
                showAlert('Reset failed', 'Failed to reset board');
                return;
            }
            const defaultCol = boardType === 'portfolio' ? 'active' : 'underlying';
            setAssets(prevAssets =>
                prevAssets.map(a =>
                    a.board_type === boardType ? { ...a, column_id: defaultCol } : a
                )
            );
        } catch (e) {
            console.error("Failed to reset board", e);
            showAlert('Network error', 'Could not reset board. Check your connection.');
        }
    };

    const handleDelete = async (id: number) => {
        showConfirm(
            {
                title: 'Delete Item',
                description: 'Are you sure you want to delete this item?',
                confirmLabel: 'Delete',
                variant: 'destructive',
            },
            async () => {
                try {
                    const res = await authFetch(getUrl(`/${id}`), { method: 'DELETE' });
                    if (!res.ok) {
                        showAlert('Delete failed', 'Failed to delete item');
                        return;
                    }
                    setAssets(prev => prev.filter(a => a.id !== id));
                    fetchCapital(selectedDate);
                } catch (e) {
                    console.error("Failed to delete item", e);
                    showAlert('Network error', 'Could not delete item. Check your connection.');
                }
            }
        );
    };

    const handleSyncPositions = async () => {
        setLastSyncError(null);
        try {
            const positions = await pullPositionsFromConnector();
            const res = await authFetch(getUrl(`/sync-client-positions?target_date=${formatDateAPI(selectedDate)}`), { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Sync failed on server");
            }
            const data = await res.json();
            await fetchAssets(selectedDate);
            await fetchCapital(selectedDate);
            showAlert('Sync Complete', data.message, 'info');
        } catch (e: any) {
            console.error("Failed to sync positions", e);
            setLastSyncError(e.message || "Unknown error");
            showAlert('Sync Failed', `Failed to sync positions: ${e.message}`);
        }
    };

    const handleOutOfPlanClick = useCallback(() => {
        showAlert(
            'Out-of-Plan Activity Detected',
            'This asset was bought in a different column than where you had originally planned it. Review your allocation to ensure it aligns with your trading plan.',
            'info'
        );
    }, [showAlert]);

    const handleMissingStopClick = useCallback(() => {
        showAlert(
            'Warning: No Stop Loss',
            'No stop loss order is placed for this position. This could lead to losses exceeding your risk limit.',
            'destructive'
        );
    }, [showAlert]);

    const handleStrikeErrorClick = useCallback((technicalError: string) => {
        showAlert(
            t('error.ibkrDisconnected'),
            `${t('error.ibkrDisconnectedDescription')}\n\nTechnical Details: ${technicalError}`,
            'destructive'
        );
    }, [showAlert, t]);

    // --- Render ---

    // Out-of-plan detection: synced items whose underlying was manually
    // placed in a DIFFERENT column → conflict.
    const outOfPlanIds = useMemo(() => {
        const ids = new Set<number>();
        const manualItems = assets.filter(a => !(a.invested_amount != null && a.invested_amount > 0));
        const syncedItems = assets.filter(a => a.invested_amount != null && a.invested_amount > 0);

        // Build lookup: underlying → Set of column_ids where manual items exist
        const manualByUnderlying = new Map<string, Set<string>>();
        for (const m of manualItems) {
            const u = getUnderlying(m.symbol);
            if (!manualByUnderlying.has(u)) manualByUnderlying.set(u, new Set());
            manualByUnderlying.get(u)!.add(m.column_id);
        }

        for (const s of syncedItems) {
            const u = getUnderlying(s.symbol);
            const manualCols = manualByUnderlying.get(u);
            if (manualCols && !manualCols.has(s.column_id)) {
                ids.add(s.id);
            }
        }
        return ids;
    }, [assets]);

    if (isLoading && assets.length === 0) {
        return (
            <div className="h-full p-6 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading boards...</p>
                </div>
            </div>
        );
    }

    if (error) {
        const isIbkrError = error.includes('Could not connect to IBKR') || error.includes('10061');
        
        return (
            <div className="h-full p-6 flex items-center justify-center">
                <div className="max-w-2xl w-full space-y-6">
                    {isIbkrError ? (
                        <IBKRConnectionError error={error} />
                    ) : (
                        <div className="text-center p-8 bg-destructive/5 rounded-xl border border-destructive/10">
                            <p className="text-destructive mb-2 font-semibold">Error loading boards</p>
                            <p className="text-muted-foreground text-sm">{error}</p>
                        </div>
                    )}
                    <div className="flex justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium shadow-sm hover:translate-y-[-1px] active:translate-y-[1px] transition-all"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const portfolioAssets = assets.filter(a => a.board_type === 'portfolio').filter(a => {
        if (viewFilter === 'all') return true;
        const isFromSync = a.invested_amount != null && a.invested_amount > 0;
        return viewFilter === 'actual' ? isFromSync : !isFromSync;
    });
    const optionsAssets = assets.filter(a => a.board_type === 'options').filter(a => {
        if (viewFilter === 'all') return true;
        const isFromSync = a.invested_amount != null && a.invested_amount > 0;
        return viewFilter === 'actual' ? isFromSync : !isFromSync;
    });


    return (
        <div className="h-full p-6 space-y-8 overflow-y-auto">
            {/* Date Navigation */}
            <div className="flex items-center justify-center gap-4">
                <button
                    onClick={() => setSelectedDate(prev => addDays(prev, -1))}
                    className="p-2 hover:bg-secondary/50 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    title="Previous Day"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2 rounded-lg border border-white/5 shadow-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono font-medium min-w-[100px] text-center text-sm">
                        {formatDateDisplay(selectedDate)}
                    </span>
                </div>

                <button
                    onClick={() => setSelectedDate(prev => addDays(prev, 1))}
                    className="p-2 hover:bg-secondary/50 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                    title="Next Day"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>

                {!isToday(selectedDate) && (
                    <button
                        onClick={() => setSelectedDate(new Date())}
                        className="text-xs text-primary hover:underline ml-2 font-medium"
                    >
                        Today
                    </button>
                )}

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSyncPositions}
                        className="ml-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-2 shadow-sm"
                        title="Fetch open positions from IBKR"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Sync Positions
                    </button>
                    {lastSyncError && (
                        <button
                            onClick={() => showAlert('Technical Details', lastSyncError, 'info')}
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-full transition-all"
                            title="See error details"
                        >
                            <Info className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* View Filter */}
                <div className="flex items-center gap-1 ml-4 bg-secondary/30 rounded-lg px-1 py-0.5 border border-white/5">
                    {(['all', 'actual', 'planned'] as ViewFilter[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setViewFilter(mode)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${viewFilter === mode
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {mode === 'all' ? 'All' : mode === 'actual' ? 'Actual' : 'Planned'}
                        </button>
                    ))}
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold">Portfolio</h2>
                            {capitalData?.net_liquidation && (
                                <span className="text-sm font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                                    NetLiq: ${capitalData.net_liquidation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            )}
                            {capitalData?.stocks_pct != null && (
                                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    {capitalData.stocks_pct}% Stocks
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleReset('portfolio')} className="text-xs px-3 py-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors">
                                Reset
                            </button>
                            <button onClick={() => handleClear('portfolio')} className="text-xs px-3 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md transition-colors">
                                Clear All
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <ColumnDropWrapper id="60" title="60%" color="bg-emerald-500" assets={portfolioAssets.filter(a => a.column_id === '60')} onAdd={handleAdd} onDelete={handleDelete} allocation={capitalData?.segments?.['60'] ?? null} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onMissingStopClick={handleMissingStopClick} onStrikeErrorClick={handleStrikeErrorClick} />
                        <ColumnDropWrapper id="30" title="30%" color="bg-blue-600" assets={portfolioAssets.filter(a => a.column_id === '30')} onAdd={handleAdd} onDelete={handleDelete} allocation={capitalData?.segments?.['30'] ?? null} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onMissingStopClick={handleMissingStopClick} onStrikeErrorClick={handleStrikeErrorClick} />
                        <ColumnDropWrapper id="10" title="10%" color="bg-orange-600" assets={portfolioAssets.filter(a => a.column_id === '10')} onAdd={handleAdd} onDelete={handleDelete} allocation={capitalData?.segments?.['10'] ?? null} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onMissingStopClick={handleMissingStopClick} onStrikeErrorClick={handleStrikeErrorClick} />
                        <ColumnDropWrapper id="active" title="Active" color="bg-zinc-600" assets={portfolioAssets.filter(a => a.column_id === 'active')} onAdd={handleAdd} onDelete={handleDelete} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onMissingStopClick={handleMissingStopClick} onStrikeErrorClick={handleStrikeErrorClick} />
                    </div>
                    <BoardNotes boardType="portfolio" selectedDate={selectedDate} />
                </div>

                {/* Board 2: Options */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold">Options</h2>
                            {capitalData?.options_allocation && capitalData.options_allocation.total > 0 && (
                                <span className="text-sm font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded flex items-center gap-2">
                                    <span>${capitalData.options_allocation.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    {capitalData.options_allocation.one_third_five_pct !== undefined && (
                                        <span className="text-xs opacity-75 border-l border-violet-500/30 pl-2" title="1/3 of 5% of Total Options Allocation">
                                            ${capitalData.options_allocation.one_third_five_pct.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[10px]">(1/3 of 5%)</span>
                                        </span>
                                    )}
                                </span>
                            )}
                            {capitalData?.options_pct != null && (
                                <span className="text-xs font-mono text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                                    {capitalData.options_pct}% Options
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleReset('options')} className="text-xs px-3 py-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md transition-colors">
                                Reset
                            </button>
                            <button onClick={() => handleClear('options')} className="text-xs px-3 py-1 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md transition-colors">
                                Clear All
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <ColumnDropWrapper id="calls" title="CALLS" color="bg-emerald-700" assets={optionsAssets.filter(a => a.column_id === 'calls')} onAdd={handleAdd} onDelete={handleDelete} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onStrikeErrorClick={handleStrikeErrorClick} />
                        <ColumnDropWrapper id="puts" title="PUTS" color="bg-red-800" assets={optionsAssets.filter(a => a.column_id === 'puts')} onAdd={handleAdd} onDelete={handleDelete} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onStrikeErrorClick={handleStrikeErrorClick} />
                        <ColumnDropWrapper id="underlying" title="Underlying" color="bg-zinc-600" assets={optionsAssets.filter(a => a.column_id === 'underlying')} onAdd={handleAdd} onDelete={handleDelete} outOfPlanIds={outOfPlanIds} onOutOfPlanClick={handleOutOfPlanClick} onStrikeErrorClick={handleStrikeErrorClick} />
                    </div>
                    <BoardNotes boardType="options" selectedDate={selectedDate} />
                </div>

                <DragOverlay>
                    {activeDragItem ? (
                        <div className="bg-card border border-primary p-3 rounded-md shadow-xl opacity-80 rotate-2 cursor-grabbing">
                            {activeDragItem.symbol}
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Custom Dialogs — replaces native confirm()/alert() */}
            <ConfirmDialog
                open={confirmOpen}
                title={confirmConfig.title}
                description={confirmConfig.description}
                confirmLabel={confirmConfig.confirmLabel}
                variant={confirmConfig.variant}
                onConfirm={() => {
                    setConfirmOpen(false);
                    pendingConfirmAction.current?.();
                    pendingConfirmAction.current = null;
                }}
                onCancel={() => {
                    setConfirmOpen(false);
                    pendingConfirmAction.current = null;
                }}
            />
            <AlertDialog
                open={alertOpen}
                title={alertConfig.title}
                description={alertConfig.description}
                variant={alertConfig.variant}
                onClose={() => setAlertOpen(false)}
            />
        </div>
    );
}
