/**
 * TJ Connector client for the Trading Journal web app frontend.
 *
 * The TJ Connector is a lightweight local process that bridges the web app
 * to the user's TWS/IB Gateway instance. It runs on localhost:8765.
 *
 * Usage:
 *   import { isConnectorRunning, connectorApi } from '@/lib/connector';
 *
 *   const active = await isConnectorRunning();
 *   if (active) {
 *     const portfolio = await connectorApi.getPortfolio();
 *   } else {
 *     // Render download prompt
 *   }
 */

const CONNECTOR_URL = 'http://localhost:8765';

/** Detect if the TJ Connector process is running on the user's machine.
 *  Uses a short timeout so the UI loads quickly even without the connector. */
export async function isConnectorRunning(): Promise<boolean> {
    try {
        const res = await fetch(`${CONNECTOR_URL}/status`, {
            signal: AbortSignal.timeout(800),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Fetch the connector status payload (version, tws_port, etc.) */
export async function getConnectorStatus(): Promise<{
    running: boolean;
    version: string;
    tws_port: number;
} | null> {
    try {
        const res = await fetch(`${CONNECTOR_URL}/status`, {
            signal: AbortSignal.timeout(800),
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

/** API methods that call the TJ Connector instead of the main backend server.
 *  These are for real-time data that requires a local TWS connection. */
export const connectorApi = {
    /** Live portfolio summary: net liquidation, P&L, open positions. */
    getPortfolio: (): Promise<{
        success: boolean;
        net_liquidation?: number;
        unrealized_pnl?: number;
        realized_pnl?: number;
        positions?: Array<{
            symbol: string;
            secType: string;
            position: number;
            marketValue: number;
            unrealizedPNL: number;
        }>;
        message?: string;
    }> =>
        fetch(`${CONNECTOR_URL}/portfolio`).then((r) => r.json()),

    /** Open positions with stop order detection. */
    getPositions: (): Promise<{
        success: boolean;
        positions: Array<{
            symbol: string;
            secType: string;
            position: number;
            avgCost: number;
            has_stop: boolean;
        }>;
        message?: string;
    }> =>
        fetch(`${CONNECTOR_URL}/positions`).then((r) => r.json()),

    /** Strike calculator: current price + IV + 1-SD strike levels. */
    getStrikes: (symbol: string): Promise<{
        success: boolean;
        symbol: string;
        current_price?: number;
        implied_volatility?: number;
        weekly_move?: number;
        monthly_move?: number;
        strikes?: {
            '1sd_weekly_up': number;
            '1sd_weekly_down': number;
            '1sd_monthly_up': number;
            '1sd_monthly_down': number;
        };
        message?: string;
    }> =>
        fetch(`${CONNECTOR_URL}/strikes/${symbol}`).then((r) => r.json()),
};
