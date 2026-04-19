/**
 * Onboarding wizard — shown to first-time users.
 * Three steps: Welcome, Configure IBKR credentials, Sync data.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, syncApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
    ArrowRight,
    ArrowLeft,
    BarChart3,
    Shield,
    Zap,
    Key,
    RefreshCw,
    Check,
    Loader2,
    SkipForward,
    TrendingUp,
    PieChart,
    Target,
} from 'lucide-react';

interface OnboardingProps {
    onComplete: () => void;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
    return (
        <div className="flex items-center gap-2">
            {Array.from({ length: total }, (_, i) => (
                <div
                    key={i}
                    className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        i === current
                            ? 'w-8 bg-primary'
                            : i < current
                                ? 'w-2 bg-primary/60'
                                : 'w-2 bg-muted-foreground/20'
                    )}
                />
            ))}
        </div>
    );
}

function FeatureCard({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);
    const [flexToken, setFlexToken] = useState('');
    const [queryId, setQueryId] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState('');

    const queryClient = useQueryClient();

    const saveMutation = useMutation({
        mutationFn: () =>
            settingsApi.update({
                flex_token: flexToken.trim(),
                query_id: queryId.trim(),
            }),
        onSuccess: () => {
            setSaveStatus('saved');
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: () => {
            setSaveStatus('error');
        },
    });

    const syncMutation = useMutation({
        mutationFn: () => syncApi.sync(),
        onSuccess: (data) => {
            queryClient.invalidateQueries();
            setSyncStatus(data.success ? 'done' : 'error');
            setSyncMessage(data.message);
        },
        onError: (error: Error) => {
            setSyncStatus('error');
            setSyncMessage(error.message);
        },
    });

    const handleSaveCredentials = () => {
        if (!flexToken.trim() || !queryId.trim()) return;
        setSaveStatus('saving');
        saveMutation.mutate();
    };

    const handleSync = () => {
        setSyncStatus('syncing');
        syncMutation.mutate();
    };

    const handleSkip = () => {
        localStorage.setItem('tj_onboardingComplete', 'true');
        onComplete();
    };

    const handleFinish = () => {
        localStorage.setItem('tj_onboardingComplete', 'true');
        onComplete();
    };

    const canProceedFromStep1 = saveStatus === 'saved' || (flexToken.trim() && queryId.trim());

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-lg mx-4">
                <button
                    onClick={handleSkip}
                    className="absolute -top-10 right-0 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    {t('onboarding.skip')} <SkipForward className="w-3.5 h-3.5" />
                </button>

                <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-8">
                        {/* Step 0: Welcome */}
                        {step === 0 && (
                            <div className="animate-in fade-in duration-300">
                                <div className="text-center mb-8">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                                        <TrendingUp className="w-7 h-7 text-primary" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-foreground">
                                        {t('onboarding.welcome.title')}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {t('onboarding.welcome.subtitle')}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <FeatureCard
                                        icon={BarChart3}
                                        title={t('onboarding.welcome.feature1.title')}
                                        description={t('onboarding.welcome.feature1.desc')}
                                    />
                                    <FeatureCard
                                        icon={PieChart}
                                        title={t('onboarding.welcome.feature2.title')}
                                        description={t('onboarding.welcome.feature2.desc')}
                                    />
                                    <FeatureCard
                                        icon={Target}
                                        title={t('onboarding.welcome.feature3.title')}
                                        description={t('onboarding.welcome.feature3.desc')}
                                    />
                                    <FeatureCard
                                        icon={Shield}
                                        title={t('onboarding.welcome.feature4.title')}
                                        description={t('onboarding.welcome.feature4.desc')}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 1: Configure IBKR */}
                        {step === 1 && (
                            <div className="animate-in fade-in duration-300">
                                <div className="text-center mb-6">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                                        <Key className="w-7 h-7 text-primary" />
                                    </div>
                                    <h2 className="text-xl font-bold text-foreground">
                                        {t('onboarding.credentials.title')}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {t('onboarding.credentials.subtitle')}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                            {t('accountManager.flexToken')}
                                        </label>
                                        <input
                                            type="password"
                                            value={flexToken}
                                            onChange={(e) => {
                                                setFlexToken(e.target.value);
                                                setSaveStatus('idle');
                                            }}
                                            placeholder={t('onboarding.credentials.placeholder.token')}
                                            className="w-full bg-secondary text-sm rounded-lg px-3 py-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                            {t('accountManager.queryId')}
                                        </label>
                                        <input
                                            type="text"
                                            value={queryId}
                                            onChange={(e) => {
                                                setQueryId(e.target.value);
                                                setSaveStatus('idle');
                                            }}
                                            placeholder={t('onboarding.credentials.placeholder.queryId')}
                                            className="w-full bg-secondary text-sm rounded-lg px-3 py-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                                        />
                                    </div>

                                    <Button
                                        onClick={handleSaveCredentials}
                                        disabled={!flexToken.trim() || !queryId.trim() || saveStatus === 'saving'}
                                        className="w-full"
                                    >
                                        {saveStatus === 'saving' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        {saveStatus === 'saved' && <Check className="w-4 h-4 mr-2" />}
                                        {saveStatus === 'saved' ? t('onboarding.credentials.saved') : t('onboarding.credentials.save')}
                                    </Button>

                                    {saveStatus === 'error' && (
                                        <p className="text-xs text-destructive text-center">
                                            {t('onboarding.credentials.error')}
                                        </p>
                                    )}

                                    <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
                                        {t('onboarding.credentials.securityNote')}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Sync */}
                        {step === 2 && (
                            <div className="animate-in fade-in duration-300">
                                <div className="text-center mb-6">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                                        <Zap className="w-7 h-7 text-primary" />
                                    </div>
                                    <h2 className="text-xl font-bold text-foreground">
                                        {t('onboarding.sync.title')}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {t('onboarding.sync.subtitle')}
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    {syncStatus === 'idle' && (
                                        <div className="text-center space-y-4">
                                            <div className="p-6 rounded-xl bg-secondary/30 border border-border/50">
                                                <RefreshCw className="w-10 h-10 text-primary/40 mx-auto mb-3" />
                                                <p className="text-sm text-muted-foreground">
                                                    {t('onboarding.sync.description')}
                                                </p>
                                            </div>
                                            <Button onClick={handleSync} className="w-full">
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                {t('onboarding.sync.button')}
                                            </Button>
                                        </div>
                                    )}

                                    {syncStatus === 'syncing' && (
                                        <div className="text-center p-8">
                                            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                                            <p className="text-sm font-medium text-foreground">{t('onboarding.sync.syncing')}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {t('onboarding.sync.syncingSubtitle')}
                                            </p>
                                        </div>
                                    )}

                                    {syncStatus === 'done' && (
                                        <div className="text-center p-6 rounded-xl bg-success/10 border border-success/20">
                                            <Check className="w-10 h-10 text-success mx-auto mb-3" />
                                            <p className="text-sm font-semibold text-success">{t('onboarding.sync.complete')}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{syncMessage}</p>
                                        </div>
                                    )}

                                    {syncStatus === 'error' && (
                                        <div className="space-y-3">
                                            <div className="text-center p-6 rounded-xl bg-destructive/10 border border-destructive/20">
                                                <p className="text-sm font-semibold text-destructive">{t('onboarding.sync.failed')}</p>
                                                <p className="text-xs text-muted-foreground mt-1">{syncMessage}</p>
                                            </div>
                                            <Button onClick={handleSync} variant="outline" className="w-full">
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                {t('onboarding.sync.retry')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer navigation */}
                    <div className="flex items-center justify-between px-8 py-5 bg-secondary/20 border-t border-border/50">
                        <StepIndicator current={step} total={3} />

                        <div className="flex items-center gap-2">
                            {step > 0 && (
                                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                                    <ArrowLeft className="w-4 h-4 mr-1" />
                                    {t('common.back')}
                                </Button>
                            )}

                            {step === 0 && (
                                <Button size="sm" onClick={() => setStep(1)}>
                                    {t('onboarding.welcome.getStarted')}
                                    <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            )}

                            {step === 1 && (
                                <Button
                                    size="sm"
                                    onClick={() => setStep(2)}
                                    disabled={!canProceedFromStep1}
                                >
                                    {t('common.next')}
                                    <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            )}

                            {step === 2 && (
                                <Button size="sm" onClick={handleFinish}>
                                    {syncStatus === 'done' ? t('onboarding.finish.withSync') : t('onboarding.finish.withoutSync')}
                                    <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
