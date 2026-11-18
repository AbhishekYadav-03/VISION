'use strict';

const supabase = require('../config/supabase');
const { badGateway } = require('../lib/errors');

function getPublicUrl(bucket, objectPath) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function uploadObject(bucket, objectPath, buffer, contentType, { upsert = false } = {}) {
  const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType,
    upsert,
    cacheControl: '3600',
  });

  if (error) {
    throw badGateway(`Storage upload to "${bucket}" failed: ${error.message}`);
  }

  return getPublicUrl(bucket, objectPath);
}

async function removeObject(bucket, objectPath) {
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  return error ? error.message : null;
}

module.exports = { getPublicUrl, uploadObject, removeObject };
