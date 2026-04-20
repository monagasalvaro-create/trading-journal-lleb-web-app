import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format currency value.
 */
export function formatCurrency(value: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/**
 * Parses OCC option symbols (e.g., SPY 260128P00681000) into a readable format.
 * Returns the original symbol if it doesn't match the standard OCC format.
 * Format: Ticker MmmDD'YY Strike Type (e.g. SPY Feb04'26 678 C)
 */
export function formatOptionSymbol(symbol: string): string {
    // Regex for "SPY 260128P00681000" or similar
    // Ticker (any alphabetic), optional space, YYMMDD, C/P, 8 digits
    const regex = /^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
    const match = symbol.match(regex);

    if (!match) return symbol;

    const [_, ticker, yy, mm, dd, type, strikeRaw] = match;

    // Parse Date
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthStr = months[parseInt(mm, 10) - 1];

    // Parse Strike
    const strikeVal = parseInt(strikeRaw, 10) / 1000;
    // Determine if we show decimal (only if non-integer)
    const strikeStr = strikeVal % 1 === 0 ? strikeVal.toString() : strikeVal.toFixed(1);

    return `${ticker} ${monthStr}${dd}'${yy} ${strikeStr} ${type}`;
}

/**
 * Format percentage value.
 */
export function formatPercent(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value / 100);
}

/**
 * Format number with sign indicator.
 */
export function formatDelta(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatCurrency(value)}`;
}

/**
 * Format date for display.
 * Parses date string directly to avoid timezone issues.
 */
export function formatDate(dateString: string): string {
    // Parse date parts directly to avoid timezone issues
    // dateString format: "YYYY-MM-DD"
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

/**
 * Get color class based on P&L value.
 */
export function getPnlColorClass(value: number): string {
    if (value > 0) return 'text-success';
    if (value < 0) return 'text-destructive';
    return 'text-muted-foreground';
}

/**
 * Get psychology tag display name.
 */
export function getPsychologyTagLabel(tag: string): string {
    const labels: Record<string, string> = {
        none: 'No Error',
        fomo: 'FOMO',
        revenge_trading: 'Revenge Trading',
        premature_exit: 'Premature Exit',
        rule_violation: 'Rule Violation',
    };
    return labels[tag] || tag;
}

/**
 * Debounce function for search inputs.
 */
export function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Determine trade type (CALL, PUT, STOCK) from trade details.
 */
export function getTradeType(trade: {
    asset_class?: string;
    put_call?: string | null;
    ticker: string
}): 'CALL' | 'PUT' | 'STOCK' {
    let type: 'CALL' | 'PUT' | 'STOCK' = 'STOCK';

    // Check if it's an option
    if (trade.asset_class === 'OPT' || trade.ticker.match(/\d+[CP]\d+/)) {
        // Priority to explicit put_call field
        if (trade.put_call) {
            type = trade.put_call === 'C' ? 'CALL' : 'PUT';
        }
        // Fallback to ticker parsing
        else if (trade.ticker.match(/[0-9]{6}C[0-9]{8}/)) {
            type = 'CALL';
        } else if (trade.ticker.match(/[0-9]{6}P[0-9]{8}/)) {
            type = 'PUT';
        } else {
            // Heuristic fallback
            type = trade.ticker.includes('C') && !trade.ticker.includes('P') ? 'CALL' : 'PUT';
        }
    }

    return type;
}
