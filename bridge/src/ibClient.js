'use strict';

/**
 * IB API wrapper (read-only) — replaces tj-connector/ibkr_bridge.py and
 * tj-connector/strike_engine.py. Each public function opens a single-shot
 * connection to TWS/Gateway, runs the request, and disconnects.
 *
 * Read-only by design: this module never imports placeOrder / cancelOrder /
 * modifyOrder. The audit grep in CI must return zero hits in this file.
 */

const { IBApiNext, SecType } = require('@stoqey/ib');
const { firstValueFrom } = require('rxjs');
const { take, timeout } = require('rxjs/operators');

const HOST = '127.0.0.1';
const TWS_PORTS = [7497, 7496, 4001, 4002];
const CONNECT_TIMEOUT_MS = 2500;
const REQUEST_TIMEOUT_MS = 10000;

function randomClientId(base) {
  return base + Math.floor(Math.random() * 100);
}

async function connectAny(clientIdBase) {
  for (const port of TWS_PORTS) {
    const clientId = randomClientId(clientIdBase);
    const api = new IBApiNext({ host: HOST, port, reconnectInterval: 0 });

    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS);
        const sub = api.connectionState.subscribe((state) => {
          if (state === 2) {
            clearTimeout(t);
            sub.unsubscribe();
            resolve();
          }
        });
        api.connect(clientId);
      });
      return { api, port };
    } catch (_err) {
      try { api.disconnect(); } catch { /* ignore */ }
    }
  }
  return null;
}

function safeDisconnect(api) {
  try { api.disconnect(); } catch { /* ignore */ }
}

function buildConnectError(extra = {}) {
  return {
    success: false,
    message: `Cannot connect to TWS. Ports ${TWS_PORTS.join(', ')} are unreachable. Enable API in TWS Settings.`,
    ...extra,
  };
}

/** Read a numeric account-summary value, preferring USD. Returns null if missing. */
function readAccountValue(valueMap, tag) {
  if (!valueMap) return null;
  for (const tagMap of valueMap.values()) {
    const byCurrency = tagMap.get(tag);
    if (!byCurrency) continue;
    const usd = byCurrency.get('USD') || byCurrency.get('BASE');
    if (usd?.value != null) {
      const n = Number(usd.value);
      if (!Number.isNaN(n)) return n;
    }
    for (const v of byCurrency.values()) {
      if (v?.value != null) {
        const n = Number(v.value);
        if (!Number.isNaN(n)) return n;
      }
    }
  }
  return null;
}

/** Flatten a portfolio map (Map<account, Position[]>) into a plain array. */
function flattenPortfolio(portfolioMap) {
  const out = [];
  if (!portfolioMap) return out;
  for (const positions of portfolioMap.values()) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) out.push(pos);
  }
  return out;
}

/** Wait for an AccountUpdate that contains real data (account values or portfolio).
 *  Returns the accumulated snapshot or null on timeout. */
async function waitForAccountSnapshot(api, maxWaitMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let latest = null;
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      try { sub.unsubscribe(); } catch { /* ignore */ }
      clearTimeout(deadline);
      clearInterval(check);
      resolve(v);
    };
    const sub = api.getAccountUpdates().subscribe({
      next: (u) => {
        latest = u?.all || latest;
      },
      error: () => finish(latest),
    });
    const isReady = () => {
      if (!latest) return false;
      const hasValues = latest.value && latest.value.size > 0;
      const hasPortfolio = latest.portfolio && latest.portfolio.size > 0;
      // ready when at least account values are populated; portfolio may legitimately be empty
      return hasValues || hasPortfolio;
    };
    const check = setInterval(() => { if (isReady()) finish(latest); }, 200);
    const deadline = setTimeout(() => finish(latest), maxWaitMs);
  });
}

// ─── Portfolio ─────────────────────────────────────────────────────────────
async function fetchPortfolio() {
  const conn = await connectAny(200);
  if (!conn) return buildConnectError({ positions: [] });
  const { api } = conn;

  try {
    const acct = await waitForAccountSnapshot(api);

    const accountValues = acct?.value;
    const netLiq = readAccountValue(accountValues, 'NetLiquidation');
    const unrealized = readAccountValue(accountValues, 'UnrealizedPnL');
    const realized = readAccountValue(accountValues, 'RealizedPnL');

    const positions = flattenPortfolio(acct?.portfolio).map((pos) => ({
      symbol: pos.contract?.symbol,
      secType: pos.contract?.secType,
      position: pos.pos,
      marketValue: pos.marketValue ?? null,
      unrealizedPNL: pos.unrealizedPNL ?? null,
      realizedPNL: pos.realizedPNL ?? null,
      averageCost: pos.avgCost ?? null,
    }));

    return {
      success: true,
      net_liquidation: netLiq,
      unrealized_pnl: unrealized,
      realized_pnl: realized,
      positions,
    };
  } catch (err) {
    return { success: false, message: String(err?.message || err), positions: [] };
  } finally {
    safeDisconnect(api);
  }
}

// ─── Open Positions ────────────────────────────────────────────────────────
async function fetchOpenPositions() {
  const conn = await connectAny(220);
  if (!conn) return buildConnectError({ positions: [] });
  const { api } = conn;

  try {
    const acct = await waitForAccountSnapshot(api);

    let openOrders = [];
    try {
      const orders$ = api.getAllOpenOrders().pipe(take(1), timeout(REQUEST_TIMEOUT_MS));
      openOrders = (await firstValueFrom(orders$)) || [];
    } catch (_err) {
      // permissions may block openOrders; continue without stop info
    }

    const stopSymbols = new Set();
    for (const o of openOrders) {
      const t = String(o?.order?.orderType || '').toUpperCase();
      if (t === 'STP' || t === 'STP LMT' || t === 'TRAIL') {
        const sym = o?.contract?.symbol;
        if (sym) stopSymbols.add(sym);
      }
    }

    const positions = flattenPortfolio(acct?.portfolio).map((pos) => ({
      symbol: pos.contract?.symbol,
      secType: pos.contract?.secType,
      position: pos.pos,
      avgCost: pos.avgCost ?? null,
      marketValue: pos.marketValue ?? null,
      unrealizedPNL: pos.unrealizedPNL ?? null,
      has_stop: stopSymbols.has(pos.contract?.symbol),
    }));

    return { success: true, positions };
  } catch (err) {
    return { success: false, message: String(err?.message || err), positions: [] };
  } finally {
    safeDisconnect(api);
  }
}

// ─── Strike Calculator ─────────────────────────────────────────────────────

/** Annualized HV from IBKR's HISTORICAL_VOLATILITY bars (decimal, e.g. 0.25 = 25%). */
async function fetchHVFromIBKR(api, contract) {
  const bars = await Promise.race([
    api.getHistoricalData(contract, '', '30 D', '1 day', 'HISTORICAL_VOLATILITY', 1, 1),
    new Promise((_, rej) => setTimeout(() => rej(new Error('hv timeout')), 8000)),
  ]);
  if (!Array.isArray(bars) || bars.length === 0) return null;
  const last = bars[bars.length - 1]?.close;
  if (!(last > 0)) return null;
  // IBKR returns HV as decimal (0.25 = 25%). Normalize if returned as percentage (> 5.0).
  return last > 5.0 ? last / 100 : last;
}

/** Annualized HV calculated from 90-day closing prices (log-return std dev × √252). */
async function fetchHVFromPrices(api, contract) {
  const bars = await Promise.race([
    api.getHistoricalData(contract, '', '90 D', '1 day', 'TRADES', 1, 1),
    new Promise((_, rej) => setTimeout(() => rej(new Error('price history timeout')), 10000)),
  ]);
  if (!Array.isArray(bars) || bars.length < 20) return null;
  const closes = bars.map(b => b.close).filter(c => c > 0);
  if (closes.length < 20) return null;
  const logR = [];
  for (let i = 1; i < closes.length; i++) logR.push(Math.log(closes[i] / closes[i - 1]));
  const mean = logR.reduce((a, b) => a + b, 0) / logR.length;
  const variance = logR.reduce((s, r) => s + (r - mean) ** 2, 0) / (logR.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function calculateStrikes(symbol) {
  const conn = await connectAny(300);
  if (!conn) return { success: false, symbol, message: buildConnectError().message };
  const { api } = conn;

  try {
    const contract = {
      symbol,
      secType: SecType.STK,
      exchange: 'SMART',
      currency: 'USD',
    };

    // 1. Current price from market data snapshot
    const snapshot = await api.getMarketDataSnapshot(contract, '', false);
    let price = null;
    if (snapshot && typeof snapshot.entries === 'function') {
      for (const [field, tickValue] of snapshot.entries()) {
        const v = Number(tickValue?.value);
        if (Number.isNaN(v) || v <= 0) continue;
        // tick types: 4=last, 9=close, 37=markPrice
        if ((field === 4 || field === 9 || field === 37) && price == null) price = v;
      }
    }
    if (price == null) {
      return { success: false, symbol, message: 'Could not fetch market price from TWS' };
    }

    // 2. Historical volatility: try IBKR's built-in HV, then compute from prices, then fallback
    let hvAnnual = null;
    try { hvAnnual = await fetchHVFromIBKR(api, contract); } catch { /* fall through */ }
    if (!hvAnnual) {
      try { hvAnnual = await fetchHVFromPrices(api, contract); } catch { /* fall through */ }
    }
    const ivUsed = hvAnnual || 0.25;

    const weeklyMove = price * ivUsed * Math.sqrt(7 / 365);
    const monthlyMove = price * ivUsed * Math.sqrt(30 / 365);
    const round2 = (n) => Math.round(n * 100) / 100;

    return {
      success: true,
      symbol,
      current_price: round2(price),
      implied_volatility: round2(ivUsed * 100), // percentage (e.g. 25.3 for 25.3% HV)
      weekly_move: round2(weeklyMove),
      monthly_move: round2(monthlyMove),
      strikes: {
        '1sd_weekly_up': round2(price + weeklyMove),
        '1sd_weekly_down': round2(price - weeklyMove),
        '1sd_monthly_up': round2(price + monthlyMove),
        '1sd_monthly_down': round2(price - monthlyMove),
      },
    };
  } catch (err) {
    return { success: false, symbol, message: `Cannot connect to TWS or calculate strikes: ${err?.message || err}` };
  } finally {
    safeDisconnect(api);
  }
}

module.exports = { fetchPortfolio, fetchOpenPositions, calculateStrikes };
