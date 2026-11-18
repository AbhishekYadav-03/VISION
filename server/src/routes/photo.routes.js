'use strict';

const express = require('express');
const photoController = require('../controllers/photoController');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const rateLimit = require('../middlewares/rateLimit');
const uploader = require('../config/multer');
const { albumIdParam, createAlbumSchema } = require('../schemas/album');
const { listQuerySchema } = require('../schemas/photo');

const router = express.Router();

const uploadLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Upload limit reached, please wait a moment.' });
const videoLimiter = rateLimit({ windowMs: 60_000, max: 5, message: 'Too many video renders in progress. Please wait.' });

router.post(
  '/upload',
  uploadLimiter,
  authMiddleware,
  uploader.single('photo'),
  photoController.upload,
);

router.get('/feed', authMiddleware, validate(listQuerySchema, 'query'), photoController.feed);

router.post('/albums', authMiddleware, validate(createAlbumSchema), photoController.createAlbum);
router.get('/albums', authMiddleware, photoController.listAlbums);
router.get(
  '/albums/:albumId/video',
  videoLimiter,
  authMiddleware,
  validate(albumIdParam, 'params'),
  photoController.downloadAlbumVideo,
);
router.get(
  '/albums/:albumId',
  authMiddleware,
  validate(albumIdParam, 'params'),
  photoController.getAlbum,
);

module.exports = router;
