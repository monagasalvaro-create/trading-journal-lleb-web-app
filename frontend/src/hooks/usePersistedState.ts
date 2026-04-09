/**
 * Custom hook to persist state in localStorage.
 * Works as a drop-in replacement for useState with automatic
 * serialization/deserialization via JSON.
 */
import { useState, useCallback, useEffect } from 'react';

export function usePersistedState<T>(
    key: string,
    defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
    // Lazy initializer: read from localStorage on first render only
    const [state, setStateRaw] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
                return JSON.parse(stored) as T;
            }
        } catch {
            // Corrupted data — fall back to default
        }
        return defaultValue;
    });

    // Sync to localStorage whenever state changes
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch {
            // Storage full or unavailable — silently ignore
        }
    }, [key, state]);

    // Wrapper that accepts both direct values and updater functions
    const setState = useCallback(
        (value: T | ((prev: T) => T)) => {
            setStateRaw(value);
        },
        []
    );

    return [state, setState];
}
