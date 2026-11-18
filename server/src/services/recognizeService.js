'use strict';

const config = require('../config/env');
const supabase = require('../config/supabase');
const { HttpError } = require('../lib/errors');
const { toVectorLiteral } = require('./personService');

/**
 * Matches one embedding against the user's people clusters.
 * Returns `null` when the closest candidate is not close enough.
 */
async function recognizeFace(embedding, email) {
  const { data, error } = await supabase.rpc('match_people', {
    query_embedding: toVectorLiteral(embedding),
    user_email: email,
  });

  if (error) throw new HttpError(500, `Recognition failed: ${error.message}`);
  if (!data?.length) return null;

  const candidate = data[0];
  if (candidate.distance >= config.face.matchThreshold) return null;

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, name, avatar_url')
    .eq('id', candidate.id)
    .eq('email', email)
    .maybeSingle();

  if (personError) throw new HttpError(500, `Could not load matched person: ${personError.message}`);
  if (!person) return null;

  return {
    id: person.id,
    name: person.name,
    avatar_url: person.avatar_url,
    confidence: Number((1 - candidate.distance).toFixed(4)),
    distance: Number(candidate.distance.toFixed(4)),
  };
}

module.exports = { recognizeFace };
