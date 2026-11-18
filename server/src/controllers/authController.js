'use strict';

const authService = require('../services/authService');
const profileService = require('../services/profileService');
const { publicUser } = require('../lib/serializers');

async function signup(req, res) {
  const { token, user } = await authService.signup(req.body);
  res.status(201).json({
    message: 'Signup successful',
    token,
    user: publicUser(user),
  });
}

async function login(req, res) {
  const { token, user } = await authService.login(req.body);
  res.json({
    message: 'Login successful',
    token,
    user: publicUser(user),
  });
}

async function me(req, res) {
  const user = await profileService.getProfile(req.email);
  res.json({ data: publicUser(user) });
}

module.exports = { signup, login, me };
