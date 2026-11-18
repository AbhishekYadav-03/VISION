'use strict';

const supabase = require('../config/supabase');
const { HttpError, notFound } = require('../lib/errors');

async function getProfile(email) {
  const { data, error } = await supabase
    .from('users')
    .select('email, firstname, lastname, created_at, updated_at')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new HttpError(500, `Could not load profile: ${error.message}`);
  if (!data) throw notFound('Account not found');

  return data;
}

module.exports = { getProfile };
