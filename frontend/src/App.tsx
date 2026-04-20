/**
 * Main App component - Root of the Trading Journal application.
 */
import { useState, useEffect, Component, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Sidebar } from '@/components/Dashboard/Sidebar';
import { Dashboard } from '@/components/Dashboard/Dashboard';
import { TradesTable } from '@/components/Dashboard/TradesTable';
import { StrategyStats } from '@/components/Dashboard/StrategyStats';
import { Settings } from '@/components/Dashboard/Settings';
import { AssetsPage } from '@/components/Dashboard/AssetsPage';
import { StrikeCalculator } from '@/components/Dashboard/StrikeCalculator';
import { LoginPage } from '@/components/Auth/LoginPage';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/lib/i18n';
import { settingsApi, syncApi, tradesApi, getActiveAccountId, getAccessToken, authApi } from '@/lib/api';
import { Portfolio } from '@/components/Portfolio/Portfolio';
import { Onboarding } from '@/components/Dashboard/Onboarding';
import {
    ToastProvider,
    ToastViewport,
    Toast,
    ToastTitle,
    ToastDescription,
} from '@/components/ui/Toast';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { cn } from '@/lib/utils';

// Simple Error Boundary to catch component crashes
interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

function ErrorFallback({ error }: { error: Error | null }) {
    const { t } = useTranslation();
    return (
        <div className="p-6 text-center">
            <h2 className="text-xl font-bold text-destructive mb-2">{t('app.errorBoundary.title')}</h2>
            <p className="text-muted-foreground text-sm mb-4">
                {error?.message || 'Unknown error'}
            </p>
            <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
                {t('app.errorBoundary.reload')}
            </button>
        </div>
    );
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || <ErrorFallback error={this.state.error} />;
        }
        return this.props.children;
    }
}

type View = 'dashboard' | 'trades' | 'strategies' | 'settings' | 'assets' | 'strike-calculator' | 'portfolio';

interface ToastState {
    open: boolean;
    title: string;
    description: string;
    variant: 'default' | 'success' | 'destructive';
}

// Auth gate: renders LoginPage until a valid session is confirmed, then mounts
// AppContent. Kept as a separate component so that AppContent always renders
// with the same number of hooks — flipping isAuthenticated false→true would
// otherwise violate React's Rules of Hooks and cause a blank screen.
function App() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getAccessToken());

    // On mount: if a token exists, verify it against /api/auth/me.
    // Clears auth state if the token is expired and cannot be refreshed.
    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        authApi.me().catch(() => {
            setIsAuthenticated(false);
        });
    }, []);

    if (!isAuthenticated) {
        return <LoginPage onAuthenticated={() => setIsAuthenticated(true)} />;
    }

    return <AppContent />;
}

function AppContent() {
    const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState('tj_sidebarCollapsed', false);
    const [currentView, setCurrentView] = usePersistedState<View>('tj_currentView', 'dashboard');
    const [_activeAccountId, setActiveAccountId] = useState(() => getActiveAccountId());
    const [toast, setToast] = useState<ToastState>({
        open: false,
        title: '',
        description: '',
        variant: 'default',
    });

    const { theme, setTheme } = useTheme();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // --- Onboarding logic ---
    // "Lock" pattern: once onboarding becomes visible, it stays visible
    // until the user explicitly completes or skips it. This prevents the
    // wizard from disappearing mid-flow when saving credentials changes
    // has_credentials to true.
    const [onboardingDismissed, setOnboardingDismissed] = useState(
        () => localStorage.getItem('tj_onboardingComplete') === 'true'
    );
    const [onboardingForced, setOnboardingForced] = useState(
        () => localStorage.getItem('tj_onboardingForced') === 'true'
    );
    const [onboardingLocked, setOnboardingLocked] = useState(false);

    const { data: settingsData, isLoading: settingsLoading } = useQuery({
        queryKey: ['settings', 'onboarding-check'],
        queryFn: settingsApi.get,
        enabled: !onboardingDismissed && !onboardingLocked && !onboardingForced,
        staleTime: Infinity,
    });

    const { data: tradesData, isLoading: tradesLoading } = useQuery({
        queryKey: ['trades', 'onboarding-check'],
        queryFn: () => tradesApi.getAll({ page: 1, page_size: 1 }),
        enabled: !onboardingDismissed && !onboardingLocked && !onboardingForced,
        staleTime: Infinity,
    });

    // Once we determine the user needs onboarding, lock it visible
    const shouldShowOnboarding =
        onboardingForced || (
            !onboardingDismissed &&
            !settingsLoading &&
            !tradesLoading &&
            settingsData &&
            !settingsData.has_credentials &&
            (tradesData?.total ?? 0) === 0
        );

    if (shouldShowOnboarding && !onboardingLocked) {
        setOnboardingLocked(true);
    }

    const showOnboarding = onboardingLocked;

    // Sync mutation - uses stored credentials from Settings
    const syncMutation = useMutation({
        mutationFn: () => syncApi.sync(),
        onSuccess: (data) => {
            queryClient.invalidateQueries();
            if (data.success) {
                showToast(t('app.toast.syncComplete'), data.message, 'success');
            } else {
                showToast(t('app.toast.syncFailed'), data.message, 'destructive');
            }
        },
        onError: (error: Error) => {
            if (error.message.includes('No IBKR credentials')) {
                showToast(t('app.toast.setupRequired'), t('app.toast.setupMessage'), 'destructive');
            } else {
                showToast(t('app.toast.syncError'), error.message, 'destructive');
            }
        },
    });

    const showToast = (
        title: string,
        description: string,
        variant: 'default' | 'success' | 'destructive' = 'default'
    ) => {
        setToast({ open: true, title, description, variant });
        setTimeout(() => setToast((t) => ({ ...t, open: false })), 4000);
    };

    const handleSync = () => {
        syncMutation.mutate();
    };

    return (
        <ToastProvider>
            {/* Onboarding wizard for first-time users */}
            {showOnboarding && (
                <Onboarding
                    onComplete={() => {
                        setOnboardingLocked(false);
                        setOnboardingDismissed(true);
                        setOnboardingForced(false);
                        localStorage.removeItem('tj_onboardingForced');
                        queryClient.invalidateQueries();
                    }}
                />
            )}
            <div className="min-h-screen bg-background">
                {/* Backend connection banner */}
                <ConnectionStatus />
                <Sidebar
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                    currentView={currentView}
                    onViewChange={setCurrentView}
                    onAccountSwitch={(newId) => setActiveAccountId(newId)}
                />

                {/* Main Content */}
                <main
                    className={cn(
                        'flex-1 transition-all duration-300',
                        sidebarCollapsed ? 'ml-16' : 'ml-64'
                    )}
                >
                    {currentView === 'dashboard' && <Dashboard onSync={handleSync} isSyncing={syncMutation.isPending} />}
                    {currentView === 'portfolio' && <Portfolio />}
                    {currentView === 'trades' && (
                        <div className="p-6 animate-fade-in">
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold">{t('app.views.tradeHistory')}</h1>
                            </div>
                            <TradesTable />
                        </div>
                    )}
                    {currentView === 'strategies' && (
                        <div className="p-6 animate-fade-in">
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold">{t('app.views.strategyPerformance')}</h1>
                            </div>
                            <StrategyStats />
                        </div>
                    )}
                    {currentView === 'settings' && (
                        <div className="p-6 animate-fade-in">
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold">{t('app.views.settings')}</h1>
                                <p className="text-sm text-muted-foreground">
                                    {t('app.views.settingsDescription')}
                                </p>
                            </div>
                            <Settings
                                currentTheme={theme}
                                onThemeChange={setTheme}
                                onAccountSwitch={(newId) => {
                                    // React Query cache is already cleared by AccountManager.
                                    // Update local state so useQuery keys re-fire with new account.
                                    setActiveAccountId(newId);
                                }}
                            />
                        </div>
                    )}
                    {currentView === 'assets' && (
                        <ErrorBoundary>
                            <AssetsPage />
                        </ErrorBoundary>
                    )}
                    {/* StrikeCalculator: always mounted to preserve state; hidden via CSS when inactive */}
                    <div className={currentView === 'strike-calculator' ? 'p-6 animate-fade-in' : 'hidden'}>
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold">{t('app.views.strikeCalculator')}</h1>
                        </div>
                        <StrikeCalculator isActive={currentView === 'strike-calculator'} />
                    </div>
                </main>

                {/* Toast Notifications */}
                <Toast
                    open={toast.open}
                    onOpenChange={(open: boolean) => setToast((t) => ({ ...t, open }))}
                    variant={toast.variant}
                >
                    <ToastTitle>{toast.title}</ToastTitle>
                    <ToastDescription>{toast.description}</ToastDescription>
                </Toast>
                <ToastViewport />
            </div>
        </ToastProvider>
    );
}

export default App;
