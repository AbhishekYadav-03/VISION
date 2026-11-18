'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./env');
const logger = require('../lib/logger');

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in server/.env');
}

/**
 * Service-role client. It is intentionally only used on the server and must
 * never be shipped to the browser. Access control is enforced by the API
 * layer (ownership checks) and optionally by RLS in the database.
 */
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: { 'X-Client-Info': 'vision-server' },
  },
});

logger.debug('Supabase client initialised');

module.exports = supabase;
