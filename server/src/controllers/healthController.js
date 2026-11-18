'use strict';

const config = require('../config/env');
const { getStatus } = require('../services/faceService');

function health(req, res) {
  res.json({
    status: 'ok',
    service: 'vision-api',
    env: config.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    faceWorker: getStatus(),
  });
}

module.exports = { health };
