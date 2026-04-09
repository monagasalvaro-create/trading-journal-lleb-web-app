/**
 * Reusable confirmation dialog component.
 * Replaces native browser confirm() and alert() with a styled modal
 * consistent with the application's design system.
 */
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const confirmRef = useRef<HTMLButtonElement>(null);

    // Focus the confirm button when dialog opens, handle Escape key
    useEffect(() => {
        if (!open) return;

        const timer = setTimeout(() => confirmRef.current?.focus(), 50);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onCancel]);

    if (!open) return null;

    const IconComponent = variant === 'destructive' ? AlertTriangle : Info;
    const iconColor = variant === 'destructive' ? 'text-destructive' : 'text-primary';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-start gap-3 p-5 pb-3">
                    <div className={cn('mt-0.5 p-1.5 rounded-lg', variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10')}>
                        <IconComponent className={cn('w-4 h-4', iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        {description && (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
                        )}
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 p-4 pt-2">
                    <Button variant="ghost" size="sm" onClick={onCancel} className="min-w-[80px]">
                        {cancelLabel}
                    </Button>
                    <Button
                        ref={confirmRef}
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        size="sm"
                        onClick={onConfirm}
                        className="min-w-[80px]"
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Alert dialog (info-only, single action).
 * Replaces native browser alert() with a styled modal.
 */
interface AlertDialogProps {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    variant?: 'default' | 'destructive' | 'info';
    onClose: () => void;
}

export function AlertDialog({
    open,
    title,
    description,
    confirmLabel = 'OK',
    variant = 'info',
    onClose,
}: AlertDialogProps) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const IconComponent = variant === 'destructive' ? AlertTriangle : Info;
    const iconColor = variant === 'destructive' ? 'text-destructive' : 'text-primary';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start gap-3 p-5 pb-3">
                    <div className={cn('mt-0.5 p-1.5 rounded-lg', variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10')}>
                        <IconComponent className={cn('w-4 h-4', iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        {description && (
                            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex items-center justify-end gap-2 p-4 pt-2">
                    <Button
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        size="sm"
                        onClick={onClose}
                        className="min-w-[80px]"
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
