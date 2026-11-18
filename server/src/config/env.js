'use strict';

/**
 * Central configuration.
 *
 * This module must be the first thing every entrypoint imports so that
 * `.env` is loaded before any other module reads `process.env`.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const projectRoot = path.resolve(__dirname, '../../..');
const serverRoot = path.resolve(__dirname, '../..');

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function resolvePythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;

  const candidates = [
    path.join(projectRoot, 'python', 'venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, 'python', 'venv', 'bin', 'python'),
    path.join(projectRoot, 'python', '.venv', 'Scripts', 'python.exe'),
    path.join(projectRoot, 'python', '.venv', 'bin', 'python'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate))
    || (process.platform === 'win32' ? 'python' : 'python3');
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set in production.');
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is not set. Using an ephemeral development secret; tokens will be invalid after restart.');
}

const config = {
  nodeEnv,
  isProduction,
  port: toInt(process.env.PORT, 5000),
  trustProxy: toBool(process.env.TRUST_PROXY, false),

  corsOrigins: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  storage: {
    photosBucket: process.env.PHOTOS_BUCKET || 'vision',
    avatarsBucket: process.env.AVATARS_BUCKET || 'avatars',
  },

  upload: {
    dir: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(serverRoot, 'uploads'),
    tempDir: process.env.TEMP_DIR ? path.resolve(process.env.TEMP_DIR) : path.join(serverRoot, 'tmp'),
    maxBytes: toInt(process.env.MAX_UPLOAD_MB, 15) * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  face: {
    matchThreshold: Number.parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.6'),
    pythonExecutable: resolvePythonExecutable(),
    workerScript: path.join(projectRoot, 'python', 'services', 'face_worker.py'),
    model: process.env.FACE_MODEL || 'buffalo_l',
    ctxId: toInt(process.env.FACE_CTX_ID, -1),
    detSize: toInt(process.env.FACE_DET_SIZE, 640),
    extractTimeoutMs: toInt(process.env.FACE_EXTRACT_TIMEOUT_MS, 120000),
    cropTimeoutMs: toInt(process.env.FACE_CROP_TIMEOUT_MS, 30000),
    warmup: toBool(process.env.FACE_WARMUP, true),
  },

  video: {
    width: toInt(process.env.VIDEO_WIDTH, 1280),
    height: toInt(process.env.VIDEO_HEIGHT, 720),
    secondsPerPhoto: toInt(process.env.VIDEO_SECONDS_PER_PHOTO, 4),
    downloadConcurrency: toInt(process.env.VIDEO_DOWNLOAD_CONCURRENCY, 4),
  },

  projectRoot,
  serverRoot,
  tempRoot: os.tmpdir(),
};

module.exports = config;
