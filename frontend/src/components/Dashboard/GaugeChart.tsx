/**
 * Profit Factor Gauge Chart component.
 * Semicircular gauge that glows green when > 2.0, red when < 1.0.
 */

import { cn } from '@/lib/utils';

interface GaugeChartProps {
    value: number;
    max?: number;
    label?: string;
    className?: string;
}

export function GaugeChart({
    value,
    max = 4,
    label = 'Profit Factor',
    className,
}: GaugeChartProps) {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(value, 0), max);

    // Calculate rotation angle (0 to 180 degrees)
    const angle = (clampedValue / max) * 180;

    // Determine color based on profit factor thresholds
    const getColor = () => {
        if (value >= 2.0) return 'hsl(var(--success))';
        if (value >= 1.0) return 'hsl(var(--warning))';
        return 'hsl(var(--destructive))';
    };

    const getGlowClass = () => {
        if (value >= 2.0) return 'shadow-glow-success';
        if (value < 1.0) return 'shadow-glow-danger';
        return '';
    };

    return (
        <div className={cn('flex flex-col items-center', className)}>
            <div className={cn('gauge-container', getGlowClass())}>
                {/* Background arc */}
                <div className="gauge-background" />

                {/* Filled arc */}
                <div
                    className="gauge-fill"
                    style={{
                        borderColor: getColor(),
                        transform: `rotate(${angle - 180}deg)`,
                    }}
                />

                {/* Center point indicator */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-background border-2 border-foreground/20" />
            </div>

            {/* Value display */}
            <div className="text-center mt-2">
                <span
                    className="text-2xl font-bold number-display"
                    style={{ color: getColor() }}
                >
                    {value.toFixed(2)}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>

            {/* Scale markers */}
            <div className="flex justify-between w-32 text-xs text-muted-foreground mt-1">
                <span>0</span>
                <span>1.0</span>
                <span>2.0</span>
                <span>{max}</span>
            </div>
        </div>
    );
}
