'use strict';

const express = require('express');
const { corsMiddleware } = require('./cors');
const ib = require('./ibClient');

const VERSION = '0.4.0';
const DEFAULT_TWS_PORT = 7497;

function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(corsMiddleware);

  app.get('/status', (_req, res) => {
    res.json({ running: true, version: VERSION, tws_port: DEFAULT_TWS_PORT });
  });

  app.get('/portfolio', async (_req, res) => {
    const data = await ib.fetchPortfolio();
    res.json(data);
  });

  app.get('/positions', async (_req, res) => {
    const data = await ib.fetchOpenPositions();
    res.json(data);
  });

  app.get('/strikes/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase().trim();
    if (!symbol) {
      return res.status(400).json({ success: false, message: 'Missing symbol' });
    }
    const data = await ib.calculateStrikes(symbol);
    res.json(data);
  });

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  return app;
}

module.exports = { createServer };
