/**
 * Theme hook for dark/light mode management.
 */
import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light' | 'llelb' | 'system';

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'system';
        return (localStorage.getItem('theme') as Theme) || 'system';
    });

    const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light' | 'llelb'>('dark');

    useEffect(() => {
        const root = window.document.documentElement;

        const updateResolvedTheme = () => {
            let resolvedValue: 'dark' | 'light' | 'llelb';

            if (theme === 'system') {
                resolvedValue = window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light';
            } else {
                resolvedValue = theme;
            }

            setResolvedTheme(resolvedValue);
            root.classList.remove('light', 'dark', 'llelb');
            root.classList.add(resolvedValue);
        };

        updateResolvedTheme();

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', updateResolvedTheme);

        return () => mediaQuery.removeEventListener('change', updateResolvedTheme);
    }, [theme]);

    const setTheme = useCallback((newTheme: Theme) => {
        localStorage.setItem('theme', newTheme);
        setThemeState(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((current) => {
            const next: Theme = current === 'dark' ? 'light' : current === 'light' ? 'llelb' : 'dark';
            localStorage.setItem('theme', next);
            return next;
        });
    }, []);

    return {
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        isDark: resolvedTheme === 'dark', // Keep for backward compat if needed, though explicit checking is better
        isLlelb: resolvedTheme === 'llelb',
    };
}
