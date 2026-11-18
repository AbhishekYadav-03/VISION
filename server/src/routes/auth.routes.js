'use strict';

const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const rateLimit = require('../middlewares/rateLimit');
const { signupSchema, loginSchema } = require('../schemas/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  message: 'Too many authentication attempts. Please try again later.',
});

router.post('/signup', authLimiter, validate(signupSchema), authController.signup);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.get('/me', authMiddleware, authController.me);

module.exports = router;
