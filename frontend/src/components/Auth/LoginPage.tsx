/**
 * Login & Registration screen for Trading Journal Pro.
 * Shown before the main app when no valid auth token exists.
 * Design matches the app's dark-mode aesthetic.
 */
import { useState } from 'react';
import { authApi } from '@/lib/api';

interface LoginPageProps {
    onAuthenticated: () => void;
}

type AuthMode = 'login' | 'register';

export function LoginPage({ onAuthenticated }: LoginPageProps) {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsLoading(true);

        try {
            if (mode === 'login') {
                await authApi.login(email, password);
            } else {
                await authApi.register(email, password);
            }
            onAuthenticated();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Authentication failed';
            setErrorMessage(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            id="login-page"
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
                fontFamily: "'Inter', system-ui, sans-serif",
            }}
        >
            <div
                id="login-card"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '20px',
                    padding: '48px',
                    width: '100%',
                    maxWidth: '420px',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                }}
            >
                {/* Logo / Title */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <div
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            fontSize: '24px',
                            fontWeight: 'bold',
                            color: 'white',
                        }}
                    >
                        TJ
                    </div>
                    <h1 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>
                        Trading Journal Pro
                    </h1>
                    <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                        {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
                    </p>
                </div>

                {/* Tab Switch */}
                <div
                    style={{
                        display: 'flex',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '10px',
                        padding: '4px',
                        marginBottom: '28px',
                    }}
                >
                    {(['login', 'register'] as AuthMode[]).map((m) => (
                        <button
                            key={m}
                            id={`auth-tab-${m}`}
                            onClick={() => { setMode(m); setErrorMessage(null); }}
                            style={{
                                flex: 1,
                                padding: '8px 0',
                                borderRadius: '7px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                transition: 'all 0.2s',
                                background: mode === m
                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                    : 'transparent',
                                color: mode === m ? 'white' : '#94a3b8',
                            }}
                        >
                            {m === 'login' ? 'Sign In' : 'Register'}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label
                            htmlFor="auth-email"
                            style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
                        >
                            Email
                        </label>
                        <input
                            id="auth-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@example.com"
                            style={{
                                width: '100%',
                                padding: '11px 14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.06)',
                                color: '#f1f5f9',
                                fontSize: '14px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s',
                            }}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="auth-password"
                            style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}
                        >
                            Password
                        </label>
                        <input
                            id="auth-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                            style={{
                                width: '100%',
                                padding: '11px 14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.06)',
                                color: '#f1f5f9',
                                fontSize: '14px',
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {/* Error message */}
                    {errorMessage && (
                        <div
                            id="auth-error"
                            style={{
                                padding: '10px 14px',
                                borderRadius: '8px',
                                background: 'rgba(239,68,68,0.15)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: '#fca5a5',
                                fontSize: '13px',
                            }}
                        >
                            {errorMessage}
                        </div>
                    )}

                    <button
                        id="auth-submit"
                        type="submit"
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '13px',
                            borderRadius: '10px',
                            border: 'none',
                            background: isLoading
                                ? 'rgba(99,102,241,0.5)'
                                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            marginTop: '4px',
                        }}
                    >
                        {isLoading
                            ? 'Please wait…'
                            : mode === 'login'
                                ? 'Sign In'
                                : 'Create Account'}
                    </button>
                </form>
            </div>
        </div>
    );
}
