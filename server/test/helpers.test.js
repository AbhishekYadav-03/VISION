'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const config = require('../src/config/env');
const authMiddleware = require('../src/middlewares/auth');
const { publicUser } = require('../src/lib/serializers');
const { toVectorLiteral } = require('../src/services/personService');
const { mapLimit } = require('../src/lib/async');
const { signupSchema } = require('../src/schemas/auth');
const { listQuerySchema } = require('../src/schemas/photo');
const validate = require('../src/middlewares/validate');

function invokeAuth(header) {
  return new Promise((resolve) => {
    const req = { get: () => header };
    authMiddleware(req, {}, (error) => resolve({ error, email: req.email }));
  });
}

test('auth middleware rejects a missing header with 401', async () => {
  const { error, email } = await invokeAuth('');
  assert.equal(email, undefined);
  assert.equal(error.status, 401);
});

test('auth middleware rejects malformed headers', async () => {
  const { error } = await invokeAuth('Token abc');
  assert.equal(error.status, 401);
});

test('auth middleware accepts a valid bearer token', async () => {
  const token = jwt.sign({ email: 'person@example.com' }, config.jwtSecret, { expiresIn: '1h' });
  const { error, email } = await invokeAuth(`Bearer ${token}`);
  assert.equal(error, undefined);
  assert.equal(email, 'person@example.com');
});

test('auth middleware rejects an expired token', async () => {
  const token = jwt.sign({ email: 'person@example.com' }, config.jwtSecret, { expiresIn: -10 });
  const { error } = await invokeAuth(`Bearer ${token}`);
  assert.equal(error.status, 401);
});

test('publicUser never exposes the password hash', () => {
  const serialized = publicUser({
    email: 'a@b.co',
    firstname: 'A',
    lastname: 'B',
    hashedpassword: '$2b$10$secret',
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
  });

  assert.deepEqual(Object.keys(serialized).sort(), [
    'created_at',
    'email',
    'firstname',
    'lastname',
    'updated_at',
  ]);
});

test('toVectorLiteral validates size and numeric values', () => {
  const vector = Array.from({ length: 512 }, (_, index) => index / 512);
  assert.ok(toVectorLiteral(vector).startsWith('['));

  assert.throws(() => toVectorLiteral([1, 2, 3]), /512-dimensional/);
  assert.throws(() => toVectorLiteral(Array(512).fill(Number.NaN)), /invalid values/);
});

test('mapLimit preserves order and respects the concurrency limit', async () => {
  let active = 0;
  let maxActive = 0;

  const result = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.ok(maxActive <= 2);
});

test('signup schema normalises email and rejects weak passwords', () => {
  const parsed = signupSchema.parse({
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: '  ADA@Example.COM ',
    password: 'correct-horse',
  });

  assert.equal(parsed.email, 'ada@example.com');
  assert.throws(() => signupSchema.parse({
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: 'not-an-email',
    password: 'short',
  }));
});

test('validate replaces a getter-only query object (Express 5)', async () => {
  // Express 5 exposes req.query as a prototype getter, so assigning to it throws.
  const request = { query: { limit: '25', offset: '5' } };
  Object.defineProperty(request, 'query', {
    get: () => ({ limit: '25', offset: '5' }),
    configurable: true,
  });

  const error = await new Promise((resolve) => {
    validate(listQuerySchema, 'query')(request, {}, resolve);
  });

  assert.equal(error, undefined);
  assert.deepEqual(request.query, { limit: 25, offset: 5 });
});
