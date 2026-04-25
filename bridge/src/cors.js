'use strict';

const cors = require('cors');

const ALLOWED_ORIGINS = [
  'https://trading-journal-lleb-web-app-production.up.railway.app',
  'https://app.tudominio.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:8000',
];

const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  credentials: false,
  methods: ['GET'],
});

module.exports = { corsMiddleware, ALLOWED_ORIGINS };
