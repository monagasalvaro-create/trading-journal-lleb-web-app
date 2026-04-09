// Sidebar — main navigation + quick account switcher in the footer.
import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { syncApi, accountsApi, getActiveAccountId, setActiveAccountId } from '@/lib/api';
import {
    LayoutDashboard,
    Table2,
    BarChart3,
    Settings,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Calculator,
    PieChart,
    Clock,
    CircleUser,
    ChevronUp,
    Check,
} from 'lucide-react';

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

interface SidebarProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    currentView: 'dashboard' | 'trades' | 'strategies' | 'settings' | 'assets' | 'strike-calculator' | 'portfolio';
    onViewChange: (view: 'dashboard' | 'trades' | 'strategies' | 'settings' | 'assets' | 'strike-calculator' | 'portfolio') => void;
    onAccountSwitch?: (newAccountId: string) => void;
}

export function Sidebar({
    collapsed,
    onToggleCollapse,
    currentView,
    onViewChange,
    onAccountSwitch,
}: SidebarProps) {
    const queryClient = useQueryClient();
    const [timeAgoText, setTimeAgoText] = useState<string | null>(null);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    const { data: lastSyncData } = useQuery({
        queryKey: ['last-sync'],
        queryFn: syncApi.getLastSync,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    // Active account name for sidebar badge
    const activeAccountId = getActiveAccountId();
    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsApi.getAll,
        staleTime: 60_000,
    });
    const activeAccount = accounts.find((a) => a.id === activeAccountId);
    const activeAccountName = activeAccount?.account_name ?? null;

    // Update the relative time text every 30s
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

    // Close picker on outside click
    useEffect(() => {
        if (!showAccountPicker) return;
        const handleClick = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowAccountPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showAccountPicker]);

    const handleSwitchAccount = (id: string) => {
        if (id === activeAccountId) {
            setShowAccountPicker(false);
            return;
        }
        setActiveAccountId(id);
        queryClient.clear();
        onAccountSwitch?.(id);
        setShowAccountPicker(false);
    };

    const navItems = [
        { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'portfolio' as const, label: 'Portfolio', icon: PieChart },
        { id: 'assets' as const, label: 'Portfolio Boards', icon: Table2 },
        { id: 'trades' as const, label: 'Trades', icon: Table2 },
        { id: 'strategies' as const, label: 'Performance Analysis', icon: BarChart3 },
        { id: 'strike-calculator' as const, label: 'Strike Calculator', icon: Calculator },
        { id: 'settings' as const, label: 'Settings', icon: Settings },
    ];

    const hasMultipleAccounts = accounts.length > 1;

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 h-full bg-card/95 backdrop-blur-md border-r border-border z-40 transition-all duration-300 flex flex-col',
                collapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Logo */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-primary-foreground" />
                    </div>
                    {!collapsed && (
                        <div className="animate-fade-in">
                            <h1 className="font-bold text-sm">Trading Journal</h1>
                            <p className="text-[10px] text-muted-foreground">Pro Edition</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Icon className="w-5 h-5 flex-shrink-0" />
                            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                        </button>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border space-y-2">
                {/* Account Switcher */}
                {activeAccountName && (
                    <div className="relative" ref={pickerRef}>
                        <button
                            onClick={() => {
                                if (hasMultipleAccounts) setShowAccountPicker(!showAccountPicker);
                            }}
                            className={cn(
                                'w-full flex items-center gap-2 px-3 py-1.5 rounded-md transition-all',
                                'bg-primary/10 border border-primary/20',
                                hasMultipleAccounts && 'cursor-pointer hover:bg-primary/20 hover:border-primary/40',
                                !hasMultipleAccounts && 'cursor-default',
                                collapsed && 'justify-center px-0 border-0 bg-transparent'
                            )}
                            title={hasMultipleAccounts ? 'Switch account' : `Active account: ${activeAccountName}`}
                        >
                            <CircleUser className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                            {!collapsed && (
                                <>
                                    <span className="text-[11px] font-medium text-primary truncate animate-fade-in flex-1 text-left">
                                        {activeAccountName}
                                    </span>
                                    {hasMultipleAccounts && (
                                        <ChevronUp
                                            className={cn(
                                                'w-3 h-3 text-primary/60 transition-transform duration-200 flex-shrink-0',
                                                !showAccountPicker && 'rotate-180'
                                            )}
                                        />
                                    )}
                                </>
                            )}
                        </button>

                        {/* Account dropdown (popover above the button) */}
                        {showAccountPicker && !collapsed && (
                            <div
                                className={cn(
                                    'absolute bottom-full left-0 right-0 mb-1.5',
                                    'bg-card border border-border rounded-lg shadow-xl shadow-black/20',
                                    'animate-in fade-in slide-in-from-bottom-2 duration-150',
                                    'overflow-hidden z-50'
                                )}
                            >
                                <div className="px-3 py-2 border-b border-border/50">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Switch Account
                                    </p>
                                </div>
                                <div className="py-1 max-h-48 overflow-y-auto">
                                    {accounts.map((account) => {
                                        const isSelected = account.id === activeAccountId;
                                        return (
                                            <button
                                                key={account.id}
                                                onClick={() => handleSwitchAccount(account.id)}
                                                className={cn(
                                                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                                                    isSelected
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-foreground hover:bg-secondary/80'
                                                )}
                                            >
                                                <div className={cn(
                                                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                                                    isSelected
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'bg-secondary border border-border'
                                                )}>
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </div>
                                                <span className="text-xs font-medium truncate">
                                                    {account.account_name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Last Sync Indicator */}
                {timeAgoText && (
                    <div
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 text-muted-foreground',
                            collapsed && 'justify-center px-0'
                        )}
                        title={`Last sync: ${lastSyncData?.last_sync ?? 'N/A'}`}
                    >
                        <Clock className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/60" />
                        {!collapsed && (
                            <span className="text-[11px] truncate animate-fade-in">
                                {timeAgoText}
                            </span>
                        )}
                    </div>
                )}

                {/* Collapse Toggle */}
                <button
                    onClick={onToggleCollapse}
                    className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                        'hover:bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                >
                    {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    {!collapsed && <span className="text-sm">Collapse</span>}
                </button>
            </div>
        </aside>
    );
}
