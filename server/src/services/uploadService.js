'use strict';

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const config = require('../config/env');
const supabase = require('../config/supabase');
const logger = require('../lib/logger');
const { unsupportedMedia, HttpError } = require('../lib/errors');
const { extractFaces, cropFace } = require('./faceService');
const { findOrCreatePerson, deletePersonIfUnused } = require('./personService');
const { mapLimit } = require('../lib/async');
const { uploadObject, removeObject, getPublicUrl } = require('./storageService');
const { createPhoto, deletePhoto } = require('./photoService');

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function createAvatar({ personId, email, imagePath, bbox }) {
  const avatarDir = path.join(config.upload.tempDir, 'avatars');
  const avatarPath = path.join(avatarDir, `${personId}.jpg`);

  await fsp.mkdir(avatarDir, { recursive: true });

  try {
    await cropFace(imagePath, bbox, avatarPath);
    const buffer = await fsp.readFile(avatarPath);
    const avatarUrl = await uploadObject(
      config.storage.avatarsBucket,
      `${personId}.jpg`,
      buffer,
      'image/jpeg',
      { upsert: true },
    );

    const { error } = await supabase
      .from('people')
      .update({ avatar_url: avatarUrl })
      .eq('id', personId)
      .eq('email', email);

    if (error) throw new HttpError(500, `Could not attach avatar: ${error.message}`);
    return avatarUrl;
  } finally {
    await fsp.rm(avatarPath, { force: true }).catch(() => {});
  }
}

async function rollback({ photo, objectPath, email, createdPeople }) {
  if (photo) {
    await deletePhoto(photo.id, email).catch((error) => {
      logger.warn(`Could not roll back photo ${photo.id}: ${error.message}`);
    });
  }

  if (objectPath) {
    const removalError = await removeObject(config.storage.photosBucket, objectPath);
    if (removalError) logger.warn(`Could not remove orphaned object ${objectPath}: ${removalError}`);
  }

  for (const personId of createdPeople) {
    await deletePersonIfUnused(personId, email).catch(() => {});
  }
}

/**
 * Full ingestion pipeline for a single uploaded image:
 * storage -> photo row -> face extraction -> identity clustering -> face rows.
 */
async function ingestPhoto({ email, file }) {
  const extension = EXTENSION_BY_MIME[file.mimetype];
  if (!extension) {
    throw unsupportedMedia('Only JPEG, PNG and WebP images are supported');
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const tempPath = path.join(config.upload.dir, filename);
  const createdPeople = [];

  let photo = null;
  let objectPath = null;

  await fsp.mkdir(config.upload.dir, { recursive: true });
  await fsp.mkdir(config.upload.tempDir, { recursive: true });
  await fsp.writeFile(tempPath, file.buffer);

  try {
    objectPath = filename;
    await uploadObject(config.storage.photosBucket, filename, file.buffer, file.mimetype, { upsert: false });

    const publicUrl = getPublicUrl(config.storage.photosBucket, filename);
    photo = await createPhoto({ email, url: publicUrl });

    const faceData = await extractFaces(tempPath);
    const faceRows = [];
    const avatarsToCreate = [];

    // Clustering has to be sequential: two similar faces in one photo must see
    // the cluster created by the first one.
    for (const face of faceData.faces) {
      const person = await findOrCreatePerson(face.embedding, email);

      if (person.isNew) {
        createdPeople.push(person.id);
        avatarsToCreate.push({ personId: person.id, bbox: face.bbox });
      }

      faceRows.push({
        photo_id: photo.id,
        person_id: person.id,
        email,
        bbox: face.bbox,
        embedding: face.embedding,
      });
    }

    // Avatar crops/uploads are independent of each other and of the face
    // insert, so run both concurrently with a small upload concurrency.
    const insertFaces = async () => {
      if (!faceRows.length) return;
      const { error } = await supabase.from('faces').insert(faceRows);
      if (error) throw new HttpError(500, `Could not save detected faces: ${error.message}`);
    };

    const buildAvatars = () => mapLimit(avatarsToCreate, 3, async ({ personId, bbox }) => {
      try {
        await createAvatar({
          personId,
          email,
          imagePath: tempPath,
          bbox,
        });
      } catch (error) {
        // A missing avatar should never discard an otherwise valid photo.
        logger.warn(`Avatar generation failed for person ${personId}: ${error.message}`);
      }
    });

    await Promise.all([insertFaces(), buildAvatars()]);

    return {
      message: 'Upload successful',
      photoId: photo.id,
      url: publicUrl,
      facesDetected: faceData.count,
    };
  } catch (error) {
    await rollback({ photo, objectPath, email, createdPeople });
    throw error;
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }
}

module.exports = { ingestPhoto };
