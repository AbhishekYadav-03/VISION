'use strict';

const logger = require('../lib/logger');
const { badRequest } = require('../lib/errors');
const uploadService = require('../services/uploadService');
const photoService = require('../services/photoService');
const albumService = require('../services/albumService');
const { createAlbumVideoJob } = require('../services/videoService');

async function upload(req, res) {
  if (!req.file) {
    throw badRequest('No image uploaded. Send a multipart/form-data body with a "photo" field.');
  }

  const result = await uploadService.ingestPhoto({ email: req.email, file: req.file });
  res.status(201).json(result);
}

async function feed(req, res) {
  const photos = await photoService.listFeed(req.email, req.query);
  res.json(photos);
}

async function createAlbum(req, res) {
  const album = await albumService.createAlbum(req.email, req.body);
  res.status(201).json({ message: 'Album created successfully', album });
}

async function listAlbums(req, res) {
  const albums = await albumService.listAlbums(req.email);
  res.json(albums);
}

async function getAlbum(req, res) {
  const result = await albumService.getAlbumWithPhotos(req.email, req.params.albumId);
  res.json(result);
}

async function downloadAlbumVideo(req, res) {
  const { album, photos } = await albumService.getAlbumWithPhotos(req.email, req.params.albumId);

  if (!photos.length) {
    throw badRequest('Album is empty and cannot be compiled into a video');
  }

  const job = await createAlbumVideoJob({ album, photos });
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    job.cleanup();
  };

  // If the browser cancels mid-encode or mid-download, stop FFmpeg and remove
  // the temporary directory immediately instead of leaking work.
  res.on('close', () => {
    if (!res.writableEnded) {
      job.kill();
      finish();
    }
  });
  res.on('finish', finish);

  try {
    await job.start();
  } catch (error) {
    finish();
    throw error;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.download(job.outputPath, job.filename, (error) => {
    finish();
    if (error) {
      logger.warn(`Album video delivery failed: ${error.message}`);
    }
  });
}

module.exports = { upload, feed, createAlbum, listAlbums, getAlbum, downloadAlbumVideo };
