'use strict';

const multer = require('multer');
const config = require('./env');
const { unsupportedMedia } = require('../lib/errors');

/**
 * In-memory upload handling with hard limits. The buffer is written to a
 * temporary file only for the duration of the face-processing call.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxBytes,
    files: 1,
    fields: 10,
  },
  fileFilter(req, file, callback) {
    if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
      return callback(unsupportedMedia('Only JPEG, PNG and WebP images are supported'));
    }
    return callback(null, true);
  },
});

module.exports = uploader;
