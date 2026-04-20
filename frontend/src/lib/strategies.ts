/**
 * Strategy definitions for trading operations.
 * Organized by direction: CALL and PUT strategies.
 */

export const CALL_STRATEGIES = [
    'Sol Naciente',
    'Amanecer Tardío',
    'Marea',
    'Amanecer PM80',
    'Tsunami',
    'Eclipse Lunar',
    'Canal en Verano',
] as const;

export const PUT_STRATEGIES = [
    'Amanecer Rojo',
    'Eclipse Solar',
    'La Cresta de la Ola',
    'Estrella Fugaz',
    'Canal en Invierno',
] as const;

export const OTHER_STRATEGIES = [
    'Otra Estrategia',
] as const;

export const ALL_STRATEGIES = [...CALL_STRATEGIES, ...PUT_STRATEGIES, ...OTHER_STRATEGIES] as const;

export type CallStrategy = typeof CALL_STRATEGIES[number];
export type PutStrategy = typeof PUT_STRATEGIES[number];
export type Strategy = typeof ALL_STRATEGIES[number];

export function isCallStrategy(strategy: string): boolean {
    return CALL_STRATEGIES.includes(strategy as CallStrategy);
}

export function isPutStrategy(strategy: string): boolean {
    return PUT_STRATEGIES.includes(strategy as PutStrategy);
}

export function getStrategyDirection(strategy: string): 'CALL' | 'PUT' | null {
    if (isCallStrategy(strategy)) return 'CALL';
    if (isPutStrategy(strategy)) return 'PUT';
    return null;
}
