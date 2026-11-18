'use strict';

const supabase = require('../config/supabase');
const { HttpError } = require('../lib/errors');

const PHOTO_COLUMNS = 'id, email, url, created_at, updated_at';

async function createPhoto({ email, url }) {
  const { data, error } = await supabase
    .from('photos')
    .insert({ email, url })
    .select(PHOTO_COLUMNS)
    .single();

  if (error) throw new HttpError(500, `Could not save photo: ${error.message}`);
  return data;
}

async function deletePhoto(photoId, email) {
  const { error } = await supabase.from('photos').delete().eq('id', photoId).eq('email', email);
  if (error) throw new HttpError(500, `Could not roll back photo: ${error.message}`);
}

async function listFeed(email, { limit = 100, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_COLUMNS)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new HttpError(500, `Could not load feed: ${error.message}`);
  return data;
}

async function getOwnedPhotos(photoIds, email) {
  if (!photoIds.length) return [];

  const { data, error } = await supabase
    .from('photos')
    .select(PHOTO_COLUMNS)
    .in('id', photoIds)
    .eq('email', email);

  if (error) throw new HttpError(500, `Could not load photos: ${error.message}`);
  return data;
}

module.exports = { createPhoto, deletePhoto, listFeed, getOwnedPhotos };
