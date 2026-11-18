'use strict';

const express = require('express');
const recognizeController = require('../controllers/recognizeController');
const authMiddleware = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');
const uploader = require('../config/multer');

const router = express.Router();

const recognizeLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  message: 'Recognition is being sampled too quickly. Reduce the camera frame rate.',
});

router.post('/', recognizeLimiter, authMiddleware, uploader.single('photo'), recognizeController.recognize);

module.exports = router;
