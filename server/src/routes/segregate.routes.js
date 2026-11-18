'use strict';

const express = require('express');
const peopleController = require('../controllers/peopleController');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { personIdParam } = require('../schemas/album');

const router = express.Router();

router.get(
  '/people/:personId/photos',
  authMiddleware,
  validate(personIdParam, 'params'),
  peopleController.personPhotos,
);

module.exports = router;
