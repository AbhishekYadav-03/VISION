'use strict';

const multer = require('multer');
const config = require('../config/env');
const logger = require('../lib/logger');
const { HttpError } = require('../lib/errors');

function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let message = 'Internal Server Error';
  let details;

  if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = error.code === 'LIMIT_FILE_SIZE'
      ? `File is too large. Maximum size is ${Math.round(config.upload.maxBytes / (1024 * 1024))} MB`
      : `Upload rejected: ${error.message}`;
  } else if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
    details = error.details;
  } else if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    status = 504;
    message = 'Upstream request timed out';
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, error);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} rejected with ${status}: ${message}`);
  }

  const body = { message };
  if (details !== undefined) body.details = details;
  if (!config.isProduction && status >= 500) body.error = error?.message;

  return res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
