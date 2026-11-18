'use strict';

// Config (and therefore dotenv) must be loaded before anything else.
const config = require('./src/config/env');
const logger = require('./src/lib/logger');
const app = require('./src/app');
const faceService = require('./src/services/faceService');

const server = app.listen(config.port, () => {
  logger.info(`VISION API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  logger.info(`Health check: http://localhost:${config.port}/api/health`);

  if (config.face.warmup) {
    faceService.warmup().then((ok) => {
      if (ok) logger.info('Face model is warm and ready');
    });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(
      `Port ${config.port} is already in use. Stop the other process or set PORT in server/.env.`,
    );
    process.exit(1);
  }

  logger.error('HTTP server error', error);
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await faceService.dispose();
    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

module.exports = server;
