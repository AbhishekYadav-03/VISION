'use strict';

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const config = require('../config/env');
const { badRequest } = require('../lib/errors');
const { extractFaces } = require('../services/faceService');
const { recognizeFace } = require('../services/recognizeService');

async function recognize(req, res) {
  if (!req.file) {
    throw badRequest('No camera frame received. Send a multipart/form-data body with a "photo" field.');
  }

  const tempPath = path.join(config.upload.dir, `${crypto.randomUUID()}.jpg`);

  await fsp.mkdir(config.upload.dir, { recursive: true });
  await fsp.writeFile(tempPath, req.file.buffer);

  try {
    const faceData = await extractFaces(tempPath);
    const faces = [];

    for (const face of faceData.faces) {
      const person = await recognizeFace(face.embedding, req.email);
      faces.push({ bbox: face.bbox, person });
    }

    res.json({ faces });
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

module.exports = { recognize };
