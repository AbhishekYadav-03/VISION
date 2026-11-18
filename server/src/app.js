'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env');
const routes = require('./routes');
const rateLimit = require('./middlewares/rateLimit');
const { forbidden } = require('./lib/errors');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowAllOrigins = config.corsOrigins.includes('*');

// Vite falls back to the next free port (5174, 5175, ...) when 5173 is taken,
// and developers commonly open both localhost and 127.0.0.1. Accept any
// loopback origin during development; production still requires an explicit
// CORS_ORIGIN allow-list.
const loopbackOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

function originAllowed(origin) {
  if (!origin) return true;
  if (allowAllOrigins) return true;
  if (config.corsOrigins.includes(origin)) return true;
  return !config.isProduction && loopbackOrigin.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    return callback(forbidden(
      `Origin ${origin} is not allowed. Add it to CORS_ORIGIN in server/.env.`,
    ));
  },
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

app.use('/api', rateLimit({ windowMs: 60_000, max: 600 }));

app.get('/', (req, res) => {
  res.json({
    name: 'VISION API',
    description: 'Visual Information Storage, Indexing and Organisation Network',
    version: '2.0.0',
    health: '/api/health',
    docs: 'docs/API.md',
  });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
