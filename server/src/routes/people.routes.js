'use strict';

const express = require('express');
const peopleController = require('../controllers/peopleController');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const rateLimit = require('../middlewares/rateLimit');
const { personIdParam, renamePersonSchema } = require('../schemas/album');

const router = express.Router();

const writeLimiter = rateLimit({ windowMs: 60_000, max: 60 });

router.get('/people', authMiddleware, peopleController.listPeople);
router.put(
  '/people/:personId',
  writeLimiter,
  authMiddleware,
  validate(personIdParam, 'params'),
  validate(renamePersonSchema),
  peopleController.renamePerson,
);

module.exports = router;
