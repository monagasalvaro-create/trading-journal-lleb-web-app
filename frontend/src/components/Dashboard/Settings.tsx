/**
 * Settings component for configuring IBKR credentials and app preferences.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

import { settingsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Theme } from '@/hooks/useTheme';
import { AccountManager } from '@/components/Dashboard/AccountManager';
import {
    Settings as SettingsIcon,
    X,
    Loader2,
    Save,
    Sun,
    Moon,
    Palette,
    Zap,
    Plug,
    PieChart,
    ChevronDown,
    ChevronUp,
    Users,
} from 'lucide-react';

// Time formatting removed as lastSync logic moved to AccountManager
interface CollapsibleSectionProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border border-border rounded-lg overflow-hidden bg-card/30">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {icon}
                    <span className="font-semibold text-sm">{title}</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {isOpen && (
                <div className="p-4 pt-0 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="pt-4">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}

interface SettingsProps {
    className?: string;
    onClose?: () => void;
    currentTheme?: Theme;
    onThemeChange?: (theme: Theme) => void;
    onAccountSwitch?: (newAccountId: string) => void;
}

export function Settings({
    className,
    onClose,
    currentTheme,
    onThemeChange,
    onAccountSwitch,
}: SettingsProps) {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        ibkr_socket_port: 7497,
        portfolio_stocks_pct: 70,
        portfolio_options_pct: 30,
    });
    const { data: settings, isLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: settingsApi.get,
    });

    // Update form when settings load
    useEffect(() => {
        if (settings) {
            setFormData({
                ibkr_socket_port: settings.ibkr_socket_port || 7497,
                portfolio_stocks_pct: settings.portfolio_stocks_pct ?? 70,
                portfolio_options_pct: settings.portfolio_options_pct ?? 30,
            });
        }
    }, [settings]);

    const updateMutation = useMutation({
        mutationFn: settingsApi.update,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
    });

    const buildUpdatePayload = () => ({
        ibkr_socket_port: formData.ibkr_socket_port,
        portfolio_stocks_pct: formData.portfolio_stocks_pct,
        portfolio_options_pct: formData.portfolio_options_pct,
    });

    const handleSave = () => {
        updateMutation.mutate(buildUpdatePayload());
    };

    if (isLoading) {
        return (
            <Card glass className={cn('w-full max-w-2xl', className)}>
                <CardContent className="p-8 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card glass className={cn('w-full max-w-2xl', className)}>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <SettingsIcon className="w-5 h-5" />
                        Settings
                    </CardTitle>
                    {onClose && (
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-8">
                {/* Accounts Section — always first */}
                <CollapsibleSection
                    title="Accounts"
                    icon={<Users className="w-4 h-4 text-blue-400" />}
                    defaultOpen={true}
                >
                    <AccountManager onAccountSwitch={onAccountSwitch} />
                </CollapsibleSection>

                {/* Appearance Section */}
                <CollapsibleSection
                    title="Appearance"
                    icon={<Palette className="w-4 h-4 text-primary" />}
                >
                    <div className="flex flex-col gap-4">
                        <div>
                            <h4 className="text-sm font-medium mb-1">Theme Preference</h4>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => onThemeChange?.('light')}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                                    currentTheme === 'light'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-background border-border hover:bg-secondary/80"
                                )}
                            >
                                <Sun className="w-5 h-5" />
                                <span className="text-xs font-medium">Light</span>
                            </button>

                            <button
                                onClick={() => onThemeChange?.('dark')}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                                    currentTheme === 'dark'
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "bg-background border-border hover:bg-secondary/80"
                                )}
                            >
                                <Moon className="w-5 h-5" />
                                <span className="text-xs font-medium">Dark</span>
                            </button>

                            <button
                                onClick={() => onThemeChange?.('llelb')}
                                className={cn(
                                    "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                                    currentTheme === 'llelb'
                                        ? "bg-green-500/20 border-green-500 text-green-500"
                                        : "bg-background border-border hover:bg-secondary/80"
                                )}
                            >
                                <Zap className="w-5 h-5" />
                                <span className="text-xs font-medium">LLELB</span>
                            </button>
                        </div>
                    </div>
                </CollapsibleSection>


                {/* IBKR TWS API Section */}
                <CollapsibleSection
                    title="IBKR TWS API"
                    icon={<Plug className="w-4 h-4 text-cyan-500" />}
                >
                    <div className="space-y-3">
                        <div>
                            <h4 className="text-sm font-medium mb-1">Socket Port</h4>
                            <p className="text-xs text-muted-foreground mb-3">
                                Required for Portfolio, Portfolio Boards (real-time), and Strike Calculator.
                            </p>
                            <input
                                type="number"
                                value={formData.ibkr_socket_port}
                                onChange={(e) => setFormData({ ...formData, ibkr_socket_port: parseInt(e.target.value) || 7497 })}
                                placeholder="7497"
                                min={1}
                                max={65535}
                                className="w-full max-w-[200px] bg-secondary text-foreground text-sm rounded-lg px-4 py-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, ibkr_socket_port: 7497 })}
                                className={cn(
                                    "text-xs px-3 py-1.5 rounded-md border transition-all",
                                    formData.ibkr_socket_port === 7497
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "border-border hover:bg-secondary/80 text-muted-foreground"
                                )}
                            >
                                TWS (7497)
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, ibkr_socket_port: 4002 })}
                                className={cn(
                                    "text-xs px-3 py-1.5 rounded-md border transition-all",
                                    formData.ibkr_socket_port === 4002
                                        ? "bg-primary/10 border-primary text-primary"
                                        : "border-border hover:bg-secondary/80 text-muted-foreground"
                                )}
                            >
                                Gateway (4002)
                            </button>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Portfolio Division Section */}
                <CollapsibleSection
                    title="Portfolio Division"
                    icon={<PieChart className="w-4 h-4 text-emerald-500" />}
                    defaultOpen={true}
                >

                    <div className="grid grid-cols-2 gap-6">
                        {/* Stocks Input Group */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                                Stocks
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.portfolio_stocks_pct}
                                    onChange={(e) => {
                                        let val = parseInt(e.target.value);
                                        if (isNaN(val)) val = 0;
                                        if (val > 100) val = 100;
                                        if (val < 0) val = 0;
                                        setFormData({
                                            ...formData,
                                            portfolio_stocks_pct: val,
                                            portfolio_options_pct: 100 - val,
                                        });
                                    }}
                                    className="w-full bg-secondary text-2xl font-bold p-3 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-center"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                            </div>

                        </div>

                        {/* Options Input Group */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shadow-sm" />
                                Options
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.portfolio_options_pct}
                                    onChange={(e) => {
                                        let val = parseInt(e.target.value);
                                        if (isNaN(val)) val = 0;
                                        if (val > 100) val = 100;
                                        if (val < 0) val = 0;
                                        setFormData({
                                            ...formData,
                                            portfolio_options_pct: val,
                                            portfolio_stocks_pct: 100 - val,
                                        });
                                    }}
                                    className="w-full bg-secondary text-2xl font-bold p-3 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-center"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                            </div>

                        </div>
                    </div>
                </CollapsibleSection>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        className="flex-1"
                    >
                        {updateMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Settings
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
