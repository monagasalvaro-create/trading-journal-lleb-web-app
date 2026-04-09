/**
 * AccountManager — UI component for managing multiple IBKR trading accounts.
 *
 * Each account card is expandable and shows:
 *   - Account name (inline rename)
 *   - IBKR Flex Token + Query ID (inline editable)
 *   - Test connection button
 *   - Sync Now shortcut
 *
 * Switching accounts clears the React Query cache so all data reloads
 * from the newly selected account automatically.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi, settingsApi, syncApi, getActiveAccountId, setActiveAccountId } from '@/lib/api';
import type { AccountSummary } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
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
    TestTube,
    Save,
    Eye,
    EyeOff,
} from 'lucide-react';

// ─── Credential Editor Panel (expanded per account) ───────────────────────────

interface CredentialPanelProps {
    accountId: string;
    hasCredentials: boolean;
    onClose: () => void;
}

function CredentialPanel({ accountId, hasCredentials, onClose }: CredentialPanelProps) {
    const queryClient = useQueryClient();

    const [flexToken, setFlexToken] = useState('');
    const [queryId, setQueryId] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    // Save credentials via the existing settings endpoint (scoped by X-Account-ID injected automatically or manually)
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

    const handleTest = async () => {
        // Save first if there are unsaved changes
        if (flexToken.trim() || queryId.trim()) {
            await saveMutation.mutateAsync();
        }
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await settingsApi.testConnection(accountId);
            setTestResult(result);
        } catch {
            setTestResult({ success: false, message: 'Connection test failed.' });
        } finally {
            setIsTesting(false);
        }
    };

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
            setTestResult({ success: true, message: 'Sync completed successfully.' });
        } catch {
            setTestResult({ success: false, message: 'Sync failed. Check credentials.' });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="mt-2 ml-5 pl-3 border-l-2 border-primary/30 space-y-3 pb-1">
            <p className="text-xs text-muted-foreground">
                {hasCredentials
                    ? 'Credentials are saved. Enter new values to update them.'
                    : 'Enter your IBKR Flex credentials to enable data sync.'}
            </p>

            {/* Flex Token */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Flex Token</label>
                <div className="relative">
                    <input
                        type={showToken ? 'text' : 'password'}
                        value={flexToken}
                        onChange={(e) => setFlexToken(e.target.value)}
                        placeholder={hasCredentials ? '•••••••• (leave empty to keep current)' : 'Enter Flex Token'}
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
                    IBKR Portal → Reports → Flex Queries → Token
                </p>
            </div>

            {/* Query ID */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Query ID</label>
                <input
                    type="text"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    placeholder={hasCredentials ? '(leave empty to keep current)' : 'Enter Flex Query ID'}
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground/70">
                    Found in your Flex Query configuration
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
                {/* Save */}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || (!flexToken.trim() && !queryId.trim())}
                    className="h-7 text-xs gap-1.5"
                >
                    {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                </Button>

                {/* Test */}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTest}
                    disabled={isTesting || saveMutation.isPending}
                    className="h-7 text-xs gap-1.5"
                >
                    {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                    Test
                </Button>

                {/* Sync */}
                {hasCredentials && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSync}
                        disabled={isSyncing || saveMutation.isPending}
                        className="h-7 text-xs gap-1.5"
                    >
                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Sync Now
                    </Button>
                )}

                {/* Close panel */}
                <button
                    onClick={onClose}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Close
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
            {/* Header row */}
            <div className="flex items-center gap-3 p-3">
                {/* Active dot */}
                <div className={cn(
                    'w-2.5 h-2.5 rounded-full flex-shrink-0',
                    isActive ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]' : 'bg-muted'
                )} />

                {/* Name */}
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
                                    ? <><Key className="w-3 h-3 text-amber-500" /> Credentials configured</>
                                    : <><AlertCircle className="w-3 h-3" /> No credentials — click to set up</>}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Toggle credentials panel */}
                        <button
                            onClick={() => setShowCredentials((v) => !v)}
                            title={showCredentials ? 'Hide credentials' : 'Edit credentials'}
                            className={cn(
                                'p-1.5 rounded-md transition-all',
                                showCredentials
                                    ? 'text-primary bg-primary/10'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                            )}
                        >
                            {showCredentials ? <ChevronDown className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
                        </button>

                        {/* Rename */}
                        <button
                            onClick={() => { setEditName(account.account_name); setIsEditing(true); }}
                            title="Rename account"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-all"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        {!isOnlyAccount && (
                            <button
                                onClick={() => onDelete(account.id, account.account_name)}
                                title="Delete account"
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {/* Select / Active badge */}
                        {!isActive ? (
                            <button
                                onClick={() => onSelect(account.id, account.account_name)}
                                className="ml-1 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-all font-medium"
                            >
                                Select <ChevronRight className="w-3 h-3" />
                            </button>
                        ) : (
                            <span className="ml-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/20 text-primary font-medium border border-primary/40">
                                Active
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Credentials panel (collapsible) */}
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
            // 1. Create the account settings row
            const newAccount = await accountsApi.create({ account_name: trimmedName });

            // 2. If credentials were provided, save them via settings
            if (flexToken.trim() || queryId.trim()) {
                await settingsApi.update({
                    ...(flexToken.trim() && { flex_token: flexToken.trim() }),
                    ...(queryId.trim() && { query_id: queryId.trim() }),
                }, newAccount.id);

                // Immediately trigger a sync for the new account and let any error surface to the UI
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
            <p className="text-sm font-medium text-primary">New Account</p>

            {/* Account name */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Account Name *</label>
                <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
                    placeholder="e.g. Paper Trading, Live Account..."
                    maxLength={100}
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            {/* Flex Token */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    Flex Token <span className="text-muted-foreground/60">(optional — can add later)</span>
                </label>
                <div className="relative">
                    <input
                        type={showToken ? 'text' : 'password'}
                        value={flexToken}
                        onChange={(e) => setFlexToken(e.target.value)}
                        placeholder="Enter IBKR Flex Token"
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
                    IBKR Portal → Reports → Flex Queries → Token
                </p>
            </div>

            {/* Query ID */}
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                    Query ID <span className="text-muted-foreground/60">(optional — can add later)</span>
                </label>
                <input
                    type="text"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    placeholder="Enter Flex Query ID"
                    className="w-full text-sm bg-background rounded-md px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Buttons */}
            <div className="flex items-center gap-2 pt-1">
                <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={step === 'saving' || !name.trim()}
                    className="gap-1.5"
                >
                    {step === 'saving'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                        : <><Check className="w-3.5 h-3.5" /> Create Account</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={step === 'saving'}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
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

            {/* New account form or trigger button */}
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
                    Add account
                </button>
            )}

            {/* Dialogs */}
            <ConfirmDialog
                open={!!pendingSwitchAccount}
                title="Switch account?"
                description={`All displayed data will reload from "${pendingSwitchAccount?.name}". Your board notes are preserved.`}
                confirmLabel="Switch"
                cancelLabel="Cancel"
                variant="default"
                onConfirm={confirmSwitch}
                onCancel={() => setPendingSwitchAccount(null)}
            />
            <ConfirmDialog
                open={!!pendingDeleteAccount}
                title={`Delete "${pendingDeleteAccount?.name}"?`}
                description="This will permanently delete this account and all its trades, NAV history, and board items. Your board notes are preserved. This cannot be undone."
                confirmLabel="Delete Account"
                cancelLabel="Cancel"
                variant="destructive"
                onConfirm={confirmDelete}
                onCancel={() => setPendingDeleteAccount(null)}
            />
        </div>
    );
}
