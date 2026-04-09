import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { portfolioApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { Loader2, RefreshCw, Wallet, PiggyBank, PieChart } from 'lucide-react';

interface PortfolioSummary {
    net_liquidation: number;
    cash_balance: number;
    invested_capital: number;
    buying_power: number;
    currency: string;
}

interface PortfolioPosition {
    conId: number;
    symbol: string;
    secType: string;
    expiry?: string;
    strike?: number;
    right?: string;
    position: number;
    avgCost: number;
    marketPrice: number;
    marketValue: number;
    unrealizedPNL: number;
    unrealizedPNLPercent: number;
    currency: string;
}

interface PortfolioData {
    success: boolean;
    summary: PortfolioSummary;
    positions: PortfolioPosition[];
    updated_at: string;
}

export function Portfolio() {
    const [data, setData] = useState<PortfolioData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        try {
            const response = await portfolioApi.getLivePortfolio();
            if (response.success) {
                setData(response);
                setError(null);
            } else {
                setError(response.message || 'Failed to load portfolio data');
            }
        } catch (err: any) {
            console.error('Failed to fetch portfolio:', err);
            setError(err.message || 'Failed to load portfolio data');
        } finally {
            setLoading(false);
            if (isRefresh) setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => fetchData(true), 30000); // Auto-refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={() => fetchData()}>Retry</Button>
            </div>
        );
    }

    if (!data) return null;

    const { summary, positions } = data;

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                >
                    <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Net Liquidation</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.net_liquidation)}</div>
                        <p className="text-xs text-muted-foreground">Total account value</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Cash</CardTitle>
                        <PiggyBank className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.cash_balance)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Invested Capital</CardTitle>
                        <PieChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(summary.invested_capital)}</div>
                        <div className="flex items-center text-xs text-muted-foreground">
                            {((summary.invested_capital / summary.net_liquidation) * 100).toFixed(1)}% allocation
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Holdings Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Positions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm">
                            <thead className="[&_tr]:border-b">
                                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Symbol</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Qty</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Avg Cost</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Price</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Value</th>
                                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Unrealized P&L</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {positions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-muted-foreground">No active positions.</td>
                                    </tr>
                                ) : (
                                    positions.map((pos) => (
                                        <tr key={pos.conId} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                                            <td className="p-4 align-middle font-medium">
                                                <div className="flex flex-col">
                                                    <span>{pos.symbol}</span>
                                                    {pos.secType === 'OPT' && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {pos.expiry} {pos.strike} {pos.right}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle text-right">{pos.position}</td>
                                            <td className="p-4 align-middle text-right">{formatCurrency(pos.avgCost)}</td>
                                            <td className="p-4 align-middle text-right">{formatCurrency(pos.marketPrice)}</td>
                                            <td className="p-4 align-middle text-right">{formatCurrency(pos.marketValue)}</td>
                                            <td className="p-4 align-middle text-right">
                                                <div className={cn(
                                                    "flex items-center justify-end gap-1",
                                                    pos.unrealizedPNL >= 0 ? "text-green-500" : "text-red-500"
                                                )}>
                                                    <span>{formatCurrency(pos.unrealizedPNL)}</span>
                                                    <span className="text-xs">
                                                        ({pos.unrealizedPNLPercent.toFixed(2)}%)
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
