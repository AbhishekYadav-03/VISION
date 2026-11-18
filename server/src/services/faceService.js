'use strict';

const { spawn } = require('child_process');
const config = require('../config/env');
const logger = require('../lib/logger');
const { HttpError, serviceUnavailable, gatewayTimeout, unprocessable } = require('../lib/errors');

/**
 * Persistent Python worker bridge.
 *
 * A single FaceAnalysis model is loaded once per Node process. Requests are
 * serialised by the worker, which is the correct model for a CPU-bound model
 * and avoids the multi-second model load that the old per-upload subprocess
 * implementation paid on every request.
 */

let child = null;
let stdoutBuffer = '';
let stderrTail = '';
let ready = false;
let sequence = 0;
let disposed = false;
let warmupPromise = null;

const pending = new Map();

function settle(id, error, value) {
  const waiter = pending.get(id);
  if (!waiter) return;
  pending.delete(id);
  clearTimeout(waiter.timer);
  if (error) waiter.reject(error);
  else waiter.resolve(value);
}

function rejectAll(reason) {
  for (const id of [...pending.keys()]) settle(id, reason);
}

function handleMessage(message) {
  if (message.type === 'ready') {
    ready = true;
    logger.info(`Face worker ready (model=${message.model}, ctx_id=${message.ctx_id})`);
    return;
  }

  if (message.type === 'fatal') {
    ready = false;
    logger.error(`Face worker failed to start: ${message.error}`);
    rejectAll(serviceUnavailable('Face processing worker is unavailable', message.error));
    return;
  }

  if (message.id !== undefined) {
    if (message.ok === false) {
      const error = new HttpError(
        message.errorType === 'FileNotFoundError' ? 422 : 500,
        message.errorType === 'FileNotFoundError'
          ? 'The uploaded image could not be decoded'
          : 'Face processing failed',
        message.error,
      );
      settle(message.id, error);
    } else {
      settle(message.id, null, message);
    }
  }
}

function handleStdout(chunk) {
  stdoutBuffer += chunk;
  let newline = stdoutBuffer.indexOf('\n');

  while (newline !== -1) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);

    if (line) {
      try {
        handleMessage(JSON.parse(line));
      } catch {
        logger.debug(`Face worker stdout: ${line}`);
      }
    }

    newline = stdoutBuffer.indexOf('\n');
  }
}

function handleExit(code, signal) {
  child = null;
  ready = false;
  stdoutBuffer = '';
  rejectAll(serviceUnavailable(`Face worker stopped (code=${code}, signal=${signal || 'none'})`));

  if (!disposed) {
    logger.warn(`Face worker exited unexpectedly (code=${code}, signal=${signal || 'none'}). It will restart on the next request.`);
  }
}

function spawnWorker() {
  if (child) return child;

  disposed = false;
  ready = false;
  stderrTail = '';

  child = spawn(config.face.pythonExecutable, [config.face.workerScript], {
    cwd: config.projectRoot,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      FACE_MODEL: config.face.model,
      FACE_CTX_ID: String(config.face.ctxId),
      FACE_DET_SIZE: String(config.face.detSize),
    },
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', handleStdout);

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-4000);
    logger.debug(`Face worker stderr: ${chunk.trim()}`);
  });

  child.on('error', (error) => {
    logger.error(`Could not spawn face worker (${config.face.pythonExecutable})`, error);
  });

  child.on('exit', handleExit);
  logger.info(`Face worker started (pid=${child.pid})`);

  return child;
}

function send(command, timeoutMs) {
  const worker = spawnWorker();
  const id = ++sequence;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(gatewayTimeout('Face processing timed out'));
    }, timeoutMs);
    timer.unref?.();

    pending.set(id, { resolve, reject, timer });

    try {
      worker.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
    } catch (error) {
      settle(id, serviceUnavailable('Could not reach the face processing worker', stderrTail));
    }
  });
}

async function extractFaces(imagePath) {
  const response = await send({ cmd: 'extract', path: imagePath }, config.face.extractTimeoutMs);

  if (!Array.isArray(response.faces)) {
    throw new HttpError(502, 'Face worker returned an invalid response');
  }

  return { count: response.count ?? response.faces.length, faces: response.faces };
}

async function cropFace(imagePath, bbox, outputPath) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw unprocessable('Invalid face bounding box');
  }

  const response = await send(
    { cmd: 'crop', path: imagePath, bbox, out: outputPath },
    config.face.cropTimeoutMs,
  );

  return response.out || outputPath;
}

function warmup() {
  if (!config.face.warmup) return Promise.resolve(false);
  if (warmupPromise) return warmupPromise;

  warmupPromise = send({ cmd: 'ping' }, config.face.extractTimeoutMs)
    .then(() => true)
    .catch((error) => {
      logger.warn(`Face worker warmup failed: ${error.message}`);
      return false;
    });

  return warmupPromise;
}

function getStatus() {
  return {
    ready,
    pid: child?.pid ?? null,
    pending: pending.size,
    executable: config.face.pythonExecutable,
    model: config.face.model,
  };
}

async function dispose() {
  disposed = true;
  warmupPromise = null;

  if (!child) return;

  const worker = child;
  try {
    worker.stdin.write(`${JSON.stringify({ id: ++sequence, cmd: 'shutdown' })}\n`);
  } catch {
    // The process is already gone.
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { worker.kill('SIGKILL'); } catch { /* already stopped */ }
      resolve();
    }, 1500);
    timer.unref?.();

    worker.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

module.exports = { extractFaces, cropFace, warmup, getStatus, dispose };
