/**
 * KPI Card component with glassmorphism effect and delta indicators.
 */
import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { cn, formatCurrency, formatPercent, formatDelta, getPnlColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: number | string;
    delta?: number;
    deltaLabel?: string;
    format?: 'currency' | 'percent' | 'number' | 'none';
    icon?: React.ReactNode;
    className?: string;
    glowing?: boolean;
}

export function KPICard({
    title,
    value,
    delta,
    deltaLabel,
    format = 'currency',
    icon,
    className,
    glowing = false,
}: KPICardProps) {
    const formattedValue = React.useMemo(() => {
        if (typeof value === 'string') return value;
        switch (format) {
            case 'currency':
                return formatCurrency(value);
            case 'percent':
                return formatPercent(value);
            case 'number':
                return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
            default:
                return String(value);
        }
    }, [value, format]);

    const deltaDirection = delta ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral') : null;
    const DeltaIcon = deltaDirection === 'up' ? TrendingUp : deltaDirection === 'down' ? TrendingDown : Minus;

    return (
        <Card
            glass
            className={cn(
                'hover-lift overflow-hidden relative group',
                glowing && typeof value === 'number' && value > 0 && 'glow-profit',
                glowing && typeof value === 'number' && value < 0 && 'glow-loss',
                className
            )}
        >
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
                        <p
                            className={cn(
                                'text-2xl font-bold number-display animate-number-up',
                                typeof value === 'number' && getPnlColorClass(value)
                            )}
                        >
                            {formattedValue}
                        </p>

                        {delta !== undefined && (
                            <div className="flex items-center gap-1 mt-2">
                                <DeltaIcon
                                    className={cn(
                                        'w-3 h-3',
                                        deltaDirection === 'up' && 'text-success',
                                        deltaDirection === 'down' && 'text-destructive',
                                        deltaDirection === 'neutral' && 'text-muted-foreground'
                                    )}
                                />
                                <span
                                    className={cn(
                                        'text-xs font-medium',
                                        deltaDirection === 'up' && 'text-success',
                                        deltaDirection === 'down' && 'text-destructive',
                                        deltaDirection === 'neutral' && 'text-muted-foreground'
                                    )}
                                >
                                    {formatDelta(delta)} {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
                                </span>
                            </div>
                        )}
                    </div>

                    {icon && (
                        <div className="text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors">
                            {icon}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
