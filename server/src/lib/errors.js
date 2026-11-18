'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
const forbidden = (message = 'You do not have access to this resource') => new HttpError(403, message);
const notFound = (message = 'Resource not found') => new HttpError(404, message);
const conflict = (message, details) => new HttpError(409, message, details);
const payloadTooLarge = (message) => new HttpError(413, message);
const unsupportedMedia = (message) => new HttpError(415, message);
const unprocessable = (message, details) => new HttpError(422, message, details);
const badGateway = (message, details) => new HttpError(502, message, details);
const serviceUnavailable = (message, details) => new HttpError(503, message, details);
const gatewayTimeout = (message) => new HttpError(504, message);

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  payloadTooLarge,
  unsupportedMedia,
  unprocessable,
  badGateway,
  serviceUnavailable,
  gatewayTimeout,
};
