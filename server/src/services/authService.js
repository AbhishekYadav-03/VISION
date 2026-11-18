'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const supabase = require('../config/supabase');
const { conflict, unauthorized, HttpError } = require('../lib/errors');

let dummyHashPromise = null;

function signToken(email) {
  return jwt.sign({ email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    subject: email,
    issuer: 'vision',
  });
}

async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('email, firstname, lastname, hashedpassword, created_at, updated_at')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new HttpError(500, `Could not load account: ${error.message}`);
  return data;
}

/** Equalises the time spent on unknown accounts to reduce user enumeration. */
async function compareAgainstDummy(password) {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('not-a-real-password', config.bcryptRounds);
  }
  const dummyHash = await dummyHashPromise;
  await bcrypt.compare(password, dummyHash);
}

async function signup({ firstname, lastname, email, password }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw conflict('An account with this email already exists. Try signing in instead.');
  }

  const hashedpassword = await bcrypt.hash(password, config.bcryptRounds);

  const { data, error } = await supabase
    .from('users')
    .insert({ email, firstname, lastname, hashedpassword })
    .select('email, firstname, lastname, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw conflict('An account with this email already exists. Try signing in instead.');
    }
    throw new HttpError(500, `Could not create account: ${error.message}`);
  }

  return { token: signToken(data.email), user: data };
}

async function login({ email, password }) {
  const user = await findUserByEmail(email);

  if (!user) {
    await compareAgainstDummy(password);
    throw unauthorized('Invalid email or password');
  }

  const matched = await bcrypt.compare(password, user.hashedpassword);
  if (!matched) throw unauthorized('Invalid email or password');

  const { hashedpassword: _ignored, ...safeUser } = user;
  return { token: signToken(safeUser.email), user: safeUser };
}

module.exports = { signup, login, findUserByEmail };
