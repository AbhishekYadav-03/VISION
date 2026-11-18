'use strict';

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { unauthorized } = require('../lib/errors');

/**
 * Validates a `Authorization: Bearer <token>` header and exposes the
 * authenticated account email as `req.email`.
 */
function authMiddleware(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    return next(unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (!payload || typeof payload !== 'object' || !payload.email) {
      return next(unauthorized('Token does not contain an account identity'));
    }
    req.email = String(payload.email).toLowerCase();
    req.auth = payload;
    return next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError'
      ? 'Session expired, please sign in again'
      : 'Invalid authentication token';
    return next(unauthorized(message));
  }
}

module.exports = authMiddleware;
