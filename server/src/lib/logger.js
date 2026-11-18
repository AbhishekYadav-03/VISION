'use strict';

const config = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (config.isProduction ? LEVELS.info : LEVELS.debug);

function serializeMeta(meta) {
  if (!meta) return '';
  if (meta instanceof Error) {
    return config.isProduction ? ` ${meta.name}: ${meta.message}` : `\n${meta.stack}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function write(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}${serializeMeta(meta)}`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
