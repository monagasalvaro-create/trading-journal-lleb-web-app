#!/usr/bin/env node
/**
 * TJ Bridge — entry point.
 *
 * Spawns an HTTP server on 127.0.0.1:8765 that exposes a small read-only
 * REST API on top of Interactive Brokers TWS/Gateway. The web app polls
 * /status to detect the bridge and then calls /portfolio, /positions or
 * /strikes/:symbol on demand.
 *
 * Binds to loopback only — never 0.0.0.0. CORS is restricted to the web
 * app origins (see cors.js). All IB calls are read-only.
 */
'use strict';

const { createServer } = require('./server');

const HOST = '127.0.0.1';
const PORT = Number(process.env.BRIDGE_PORT) || 8765;

const app = createServer();

const server = app.listen(PORT, HOST, () => {
  const addr = server.address();
  console.log(`[bridge] Listening on http://${addr.address}:${addr.port}`);
  console.log(`[bridge] Open TWS/Gateway with the API enabled (ports 7497/7496/4001/4002)`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[bridge] Port ${PORT} is already in use. Another bridge instance may be running.`);
    process.exit(1);
  }
  console.error('[bridge] Server error:', err.message);
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`[bridge] Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
