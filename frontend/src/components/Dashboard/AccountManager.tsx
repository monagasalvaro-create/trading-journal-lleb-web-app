/**
 * AccountManager — UI component for managing multiple IBKR trading accounts.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, settingsApi, syncApi, getActiveAccountId, setActiveAccountId } from '@/lib/api';
import type { AccountSummary } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
    Plus,
    Pencil,
    Trash2,
    Check,
    X,
    Loader2,
    ChevronRight,
    ChevronDown,
    Key,
    AlertCircle,
    RefreshCw,
    Eye,
    EyeOff,
} from 'lucide-react';

// ─── Credential Editor Panel ───────────────────────────────────────────────────

interface CredentialPanelProps {
    accountId: string;
    hasCredentials: boolean;
    onClose: () => void;
}

function CredentialPanel({ accountId, hasCredentials, onClose }: CredentialPanelProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [flexToken, setFlexToken] = useState('');
    const [queryId, setQueryId] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const saveMutation = useMutation({
        mutationFn: () =>
            settingsApi.update({
                ...(flexToken.trim() && { flex_token: flexToken.trim() }),
                ...(queryId.trim() && { query_id: queryId.trim() }),
            }, accountId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            setFlexToken('');
            setQueryId('');
            setTestResult(null);
        },
    });


    const handleSync = async () => {
        if (flexToken.trim() || queryId.trim()) {
            await saveMutation.mutateAsync();
        }
        setIsSyncing(true);
        try {
            await syncApi.sync(accountId);
            queryClient.invalidateQueries({ queryKey: ['trades'] });
            queryClient.invalidateQueries({ queryKey: ['metrics'] });
            queryClient.invalidateQueries({ queryKey: ['last-sync'] });
            setTestResult({ success: true, message: t('accountManager.syncCompleted') });
        } catch {
            setTestResult({ success: false, message: t('accountManager.syncFailed') });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="mt-2 ml-5 pl-3 border-l-2 border-primary/30 space-y-3 pb-1">
            <p className="text-xs text-muted-foreground">
                {hasCredentials
                    ? t('accountManager.credentialsSaved')
                    : t('accountManager.credentialsEmpty')}
            </p>

            {/* Flex Token */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('accountManager.flexToken')}</label>
                <div className="relative">
                    <input
                        type={showToken ? 'text' : 'password'}
                        value={flexToken}
                        onChange={(e) => setFlexToken(e.target.value)}
                        placeholder={hasCredentials ? t('accountManager.tokenSavedPlaceholder') : t('accountManager.tokenPlaceholder')}
                        className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary pr-16"
                    />
                    <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                        {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                    {t('accountManager.flexTokenHint')}
                </p>
            </div>

            {/* Query ID */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('accountManager.queryId')}</label>
                <input
                    type="text"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    placeholder={hasCredentials ? t('accountManager.queryIdSavedPlaceholder') : t('accountManager.queryIdPlaceholder')}
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground/70">
                    {t('accountManager.queryIdHint')}
                </p>
            </div>

            {/* Test result banner */}
            {testResult && (
                <div className={cn(
                    'flex items-center gap-2 text-xs p-2 rounded-md',
                    testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'
                )}>
                    {testResult.success ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span>{testResult.message}</span>
                </div>
            )}

            {/* Actions row */}
            <div className="flex items-center gap-2 flex-wrap pt-1">

                <Button
                    size="sm"
                    onClick={handleSync}
                    disabled={isSyncing || saveMutation.isPending}
                    className="h-8 px-4 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all font-semibold"
                >
                    {isSyncing || saveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    {saveMutation.isPending ? t('common.saving') : t('accountManager.syncNow')}
                </Button>

                <button
                    onClick={onClose}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    {t('accountManager.close')}
                </button>
            </div>
        </div>
    );
}

// ─── Account Row ──────────────────────────────────────────────────────────────

interface AccountRowProps {
    account: AccountSummary;
    isActive: boolean;
    onSelect: (id: string, name: string) => void;
    onDelete: (id: string, name: string) => void;
    isOnlyAccount: boolean;
}

function AccountRow({ account, isActive, onSelect, onDelete, isOnlyAccount }: AccountRowProps) {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(account.account_name);
    const [showCredentials, setShowCredentials] = useState(false);
    const queryClient = useQueryClient();

    const renameMutation = useMutation({
        mutationFn: (name: string) => accountsApi.rename(account.id, { account_name: name }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setIsEditing(false);
        },
    });

    const handleSaveName = () => {
        const name = editName.trim();
        if (name && name !== account.account_name) {
            renameMutation.mutate(name);
        } else {
            setIsEditing(false);
        }
    };

    return (
        <div className={cn(
            'rounded-lg border transition-all',
            isActive ? 'border-primary/60 bg-primary/10' : 'border-border bg-card/30'
        )}>
            <div className="flex items-center gap-3 p-3">
                <div className={cn(
                    'w-2.5 h-2.5 rounded-full flex-shrink-0',
                    isActive ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]' : 'bg-muted'
                )} />

                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                autoFocus
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveName();
                                    if (e.key === 'Escape') setIsEditing(false);
                                }}
                                maxLength={100}
                                className="flex-1 text-sm bg-background rounded-md px-2.5 py-1 border border-primary focus:outline-none"
                            />
                            <button
                                onClick={handleSaveName}
                                disabled={renameMutation.isPending || !editName.trim()}
                                className="text-green-500 hover:opacity-80 disabled:opacity-40"
                            >
                                {renameMutation.isPending
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setIsEditing(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-0.5">
                            <span className={cn('text-sm font-medium truncate', isActive && 'text-primary')}>
                                {account.account_name}
                            </span>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                {account.has_credentials
                                    ? <><Key className="w-3 h-3 text-amber-500" /> {t('accountManager.credentialsConfigured')}</>
                                    : <><AlertCircle className="w-3 h-3" /> {t('accountManager.noCredentials')}</>}
                            </span>
                        </div>
                    )}
                </div>

                {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={() => setShowCredentials((v) => !v)}
                            title={showCredentials ? t('accountManager.hideCredentials') : t('accountManager.editCredentials')}
                            className={cn(
                                'p-1.5 rounded-md transition-all',
                                showCredentials
                                    ? 'text-primary bg-primary/10'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                            )}
                        >
                            {showCredentials ? <ChevronDown className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                        </button>

                        <button
                            onClick={() => { setEditName(account.account_name); setIsEditing(true); }}
                            title={t('accountManager.renameAccount')}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-all"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {!isOnlyAccount && (
                            <button
                                onClick={() => onDelete(account.id, account.account_name)}
                                title={t('accountManager.deleteAccount')}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {!isActive ? (
                            <button
                                onClick={() => onSelect(account.id, account.account_name)}
                                className="ml-1 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-all font-medium"
                            >
                                {t('accountManager.select')} <ChevronRight className="w-3 h-3" />
                            </button>
                        ) : (
                            <span className="ml-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/20 text-primary font-medium border border-primary/40">
                                {t('accountManager.active')}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {showCredentials && (
                <div className="px-3 pb-3">
                    <CredentialPanel
                        accountId={account.id}
                        hasCredentials={account.has_credentials}
                        onClose={() => setShowCredentials(false)}
                    />
                </div>
            )}
        </div>
    );
}

// ─── New Account Form ─────────────────────────────────────────────────────────

interface NewAccountFormProps {
    onCancel: () => void;
    onCreate: (accountId: string) => void;
}

function NewAccountForm({ onCancel, onCreate }: NewAccountFormProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [name, setName] = useState('');
    const [flexToken, setFlexToken] = useState('');
    const [queryId, setQueryId] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [step, setStep] = useState<'create' | 'saving'>('create');
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        setStep('saving');
        setError(null);

        try {
            const newAccount = await accountsApi.create({ account_name: trimmedName });

            if (flexToken.trim() || queryId.trim()) {
                await settingsApi.update({
                    ...(flexToken.trim() && { flex_token: flexToken.trim() }),
                    ...(queryId.trim() && { query_id: queryId.trim() }),
                }, newAccount.id);

                await syncApi.sync(newAccount.id);
            }

            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            onCreate(newAccount.id);
        } catch (err: any) {
            setError(err.message || 'Failed to create account or sync');
            setStep('create');
        }
    };

    return (
        <div className="p-4 rounded-lg border border-dashed border-primary/50 bg-primary/5 space-y-3">
            <p className="text-sm font-medium text-primary">{t('accountManager.newAccount')}</p>

            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t('accountManager.accountName')}</label>
                <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
                    placeholder={t('accountManager.namePlaceholder')}
                    maxLength={100}
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    {t('accountManager.flexTokenOptional')}
                </label>
                <div className="relative">
                    <input
                        type={showToken ? 'text' : 'password'}
                        value={flexToken}
                        onChange={(e) => setFlexToken(e.target.value)}
                        placeholder={t('accountManager.flexTokenPlaceholder')}
                        className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                        {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                    {t('accountManager.flexTokenHint')}
                </p>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    {t('accountManager.queryIdOptional')}
                </label>
                <input
                    type="text"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    placeholder={t('accountManager.queryIdPlaceholder')}
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            {error && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </div>
            )}

            <div className="flex items-center gap-2 pt-1">
                <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={step === 'saving' || !name.trim()}
                    className="gap-1.5"
                >
                    {step === 'saving'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('accountManager.creating')}</>
                        : <><Check className="w-3.5 h-3.5" /> {t('accountManager.createAccount')}</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={step === 'saving'}>
                    <X className="w-3.5 h-3.5 mr-1" /> {t('common.cancel')}
                </Button>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AccountManagerProps {
    onAccountSwitch?: (newAccountId: string) => void;
}

export function AccountManager({ onAccountSwitch }: AccountManagerProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [activeId, setActiveId] = useState(getActiveAccountId());
    const [showNewForm, setShowNewForm] = useState(false);
    const [pendingSwitchAccount, setPendingSwitchAccount] = useState<{ id: string; name: string } | null>(null);
    const [pendingDeleteAccount, setPendingDeleteAccount] = useState<{ id: string; name: string } | null>(null);

    const { data: accounts = [], isLoading } = useQuery({
        queryKey: ['accounts'],
        queryFn: accountsApi.getAll,
        staleTime: 30_000,
    });

    const deleteMutation = useMutation({
        mutationFn: (accountId: string) => accountsApi.delete(accountId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    });

    const confirmSwitch = () => {
        if (!pendingSwitchAccount) return;
        const { id } = pendingSwitchAccount;
        setActiveAccountId(id);
        setActiveId(id);
        queryClient.clear();
        onAccountSwitch?.(id);
        setPendingSwitchAccount(null);
    };

    const confirmDelete = async () => {
        if (!pendingDeleteAccount) return;
        const { id } = pendingDeleteAccount;
        await deleteMutation.mutateAsync(id);
        if (id === activeId) {
            const remaining = accounts.filter((a) => a.id !== id);
            if (remaining.length > 0) {
                setActiveAccountId(remaining[0].id);
                setActiveId(remaining[0].id);
                queryClient.clear();
                onAccountSwitch?.(remaining[0].id);
            }
        }
        setPendingDeleteAccount(null);
    };

    return (
        <div className="space-y-3">
            {isLoading ? (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-2">
                    {accounts.map((account) => (
                        <AccountRow
                            key={account.id}
                            account={account}
                            isActive={account.id === activeId}
                            isOnlyAccount={accounts.length <= 1}
                            onSelect={(id, name) => setPendingSwitchAccount({ id, name })}
                            onDelete={(id, name) => setPendingDeleteAccount({ id, name })}
                        />
                    ))}
                </div>
            )}

            {showNewForm ? (
                <NewAccountForm
                    onCancel={() => setShowNewForm(false)}
                    onCreate={(newId) => {
                        setShowNewForm(false);
                        setActiveAccountId(newId);
                        setActiveId(newId);
                        queryClient.clear();
                        onAccountSwitch?.(newId);
                    }}
                />
            ) : (
                <button
                    onClick={() => setShowNewForm(true)}
                    className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    {t('accountManager.addAccount')}
                </button>
            )}

            {/* Dialogs */}
            <ConfirmDialog
                open={!!pendingSwitchAccount}
                title={t('accountManager.switchTitle')}
                description={t('accountManager.switchDescription', { name: pendingSwitchAccount?.name ?? '' })}
                confirmLabel={t('accountManager.switchConfirm')}
                cancelLabel={t('common.cancel')}
                variant="default"
                onConfirm={confirmSwitch}
                onCancel={() => setPendingSwitchAccount(null)}
            />
            <ConfirmDialog
                open={!!pendingDeleteAccount}
                title={t('accountManager.deleteTitle', { name: pendingDeleteAccount?.name ?? '' })}
                description={t('accountManager.deleteDescription')}
                confirmLabel={t('accountManager.deleteConfirm')}
                cancelLabel={t('common.cancel')}
                variant="destructive"
                onConfirm={confirmDelete}
                onCancel={() => setPendingDeleteAccount(null)}
            />
        </div>
    );
}
