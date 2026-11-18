'use strict';

const express = require('express');
const { health } = require('../controllers/healthController');
const authRoutes = require('./auth.routes');
const photoRoutes = require('./photo.routes');
const peopleRoutes = require('./people.routes');
const segregateRoutes = require('./segregate.routes');
const recognizeRoutes = require('./recognize.routes');

const router = express.Router();

router.get('/health', health);

router.use('/auth', authRoutes);
router.use('/photo', photoRoutes);
router.use('/avatars', peopleRoutes);
router.use('/segregate', segregateRoutes);
router.use('/recognize', recognizeRoutes);

module.exports = router;
