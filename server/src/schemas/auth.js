'use strict';

const { z } = require('zod');

const email = z
  .string()
  .trim()
  .min(3, 'Email is required')
  .max(254, 'Email is too long')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address')
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

const name = z
  .string()
  .trim()
  .min(1, 'This field is required')
  .max(80, 'This field is too long');

const signupSchema = z.object({
  firstname: name,
  lastname: name,
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(72),
});

module.exports = { signupSchema, loginSchema };
