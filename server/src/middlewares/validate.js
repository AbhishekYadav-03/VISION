'use strict';

const { unprocessable } = require('../lib/errors');

/**
 * Replaces `req[source]` with the parsed value when the payload is valid.
 */
function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(unprocessable('Request validation failed', details));
    }

    // Express 5 exposes req.query as a getter, so a plain assignment throws.
    // Defining an own property shadows the getter for this request.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    return next();
  };
}

module.exports = validate;
