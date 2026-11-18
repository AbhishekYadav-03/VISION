'use strict';

const config = require('../config/env');
const supabase = require('../config/supabase');
const { HttpError, notFound, unprocessable } = require('../lib/errors');

const EMBEDDING_SIZE = 512;

function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_SIZE) {
    throw unprocessable(`Expected a ${EMBEDDING_SIZE}-dimensional face embedding`);
  }
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw unprocessable('Face embedding contains invalid values');
  }
  return `[${embedding.join(',')}]`;
}

async function nearestPerson(embedding, email) {
  const { data, error } = await supabase.rpc('match_people', {
    query_embedding: toVectorLiteral(embedding),
    user_email: email,
  });

  if (error) throw new HttpError(500, `Face matching failed: ${error.message}`);
  return data?.[0] || null;
}

async function insertPerson(embedding, email) {
  const { data, error } = await supabase
    .from('people')
    .insert({ email, representative_embedding: embedding })
    .select('id')
    .single();

  if (error) throw new HttpError(500, `Could not create person cluster: ${error.message}`);
  return data.id;
}

/**
 * Matches an embedding against the user's existing people clusters and
 * creates a new cluster when no representative is close enough.
 *
 * @returns {Promise<{id: string, isNew: boolean, distance: number|null}>}
 */
async function findOrCreatePerson(embedding, email) {
  const nearest = await nearestPerson(embedding, email);

  if (!nearest) {
    return { id: await insertPerson(embedding, email), isNew: true, distance: null };
  }

  if (nearest.distance < config.face.matchThreshold) {
    return { id: nearest.id, isNew: false, distance: nearest.distance };
  }

  return { id: await insertPerson(embedding, email), isNew: true, distance: nearest.distance };
}

async function listPeople(email) {
  const { data, error } = await supabase
    .from('people')
    .select('id, name, avatar_url, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (error) throw new HttpError(500, `Could not load people: ${error.message}`);
  return data;
}

async function renamePerson(personId, email, name) {
  const { data, error } = await supabase
    .from('people')
    .update({ name })
    .eq('id', personId)
    .eq('email', email)
    .select('id, name, avatar_url')
    .maybeSingle();

  if (error) throw new HttpError(500, `Could not rename person: ${error.message}`);
  if (!data) throw notFound('Person not found');
  return data;
}

async function listPhotosForPerson(personId, email) {
  const { data: faces, error: faceError } = await supabase
    .from('faces')
    .select('photo_id')
    .eq('person_id', personId)
    .eq('email', email);

  if (faceError) throw new HttpError(500, `Could not load person photos: ${faceError.message}`);
  if (!faces.length) return [];

  const photoIds = [...new Set(faces.map((face) => face.photo_id))];
  const { data: photos, error: photoError } = await supabase
    .from('photos')
    .select('id, url, created_at')
    .in('id', photoIds)
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (photoError) throw new HttpError(500, `Could not load photos: ${photoError.message}`);
  return photos;
}

async function deletePersonIfUnused(personId, email) {
  const { count, error } = await supabase
    .from('faces')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', personId);

  if (error || count > 0) return;

  await supabase.from('people').delete().eq('id', personId).eq('email', email);
}

module.exports = {
  toVectorLiteral,
  findOrCreatePerson,
  listPeople,
  renamePerson,
  listPhotosForPerson,
  deletePersonIfUnused,
};
