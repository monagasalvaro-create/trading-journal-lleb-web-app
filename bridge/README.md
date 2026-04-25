# TJ Bridge

Local read-only bridge between the Trading Journal web app and Interactive Brokers TWS/Gateway. Listens on `127.0.0.1:8765` and exposes four endpoints that the web app polls on demand.

Replaces `tj-connector/` (Python + FastAPI + ib_insync). Implementation: Node.js 18 + `@stoqey/ib`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | Health check. The web app polls this to detect the bridge. |
| GET | `/portfolio` | Account summary (NetLiquidation, P&L) and current positions. |
| GET | `/positions` | Open positions plus `has_stop` flag for symbols with active stop orders. |
| GET | `/strikes/:symbol` | Current price, implied volatility, and 1-SD weekly/monthly strike levels. |

CORS is restricted to the web app origins listed in `src/cors.js`. The server only accepts `GET` and binds to `127.0.0.1` only.

## TWS / IB Gateway setup (one time)

1. Open TWS or IB Gateway.
2. Edit → Global Configuration → API → Settings.
3. Enable **"Enable ActiveX and Socket Clients"**.
4. Socket port: `7497` (TWS live), `7496` (TWS paper), `4001` (Gateway live), or `4002` (Gateway paper). The bridge auto-detects all four.
5. Add `127.0.0.1` to **Trusted IPs**.
6. Leave TWS or Gateway running while you use the web app.

## Run from source

```bash
cd bridge
npm ci
npm start
```

The bridge keeps running in the foreground. Stop with `Ctrl+C`.

## Build a standalone binary

```bash
npm run build       # all targets
npm run build:win   # Windows .exe
npm run build:mac   # macOS Intel + ARM
```

Output goes to `bridge/build/`.

## Browser support

The bridge serves plain HTTP on `127.0.0.1:8765`. Modern browsers treat `http://localhost` as a secure context and allow HTTPS pages to call it — **except Safari**, which still blocks this combination ([WebKit Bug 171934](https://bugs.webkit.org/show_bug.cgi?id=171934)).

| Browser | Supported |
| --- | --- |
| Chrome (desktop) | yes |
| Edge (desktop) | yes |
| Firefox 84+ (desktop) | yes |
| Brave / Opera / Vivaldi | yes |
| Safari (macOS) | no — open the web app in Chrome, Firefox or Edge |

## Read-only guarantee

The bridge never calls `placeOrder`, `cancelOrder`, or `modifyOrder`. CI greps `src/` for those identifiers and fails the build if any appear. See `docs/privacy_disclosure.md.resolved` in the repo root.
