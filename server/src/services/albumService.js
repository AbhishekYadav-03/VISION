'use strict';

const supabase = require('../config/supabase');
const { HttpError, badRequest, notFound } = require('../lib/errors');
const { getOwnedPhotos } = require('./photoService');

async function createAlbum(email, { name, photoIds, musicUrl }) {
  const uniquePhotoIds = [...new Set(photoIds)];
  const owned = await getOwnedPhotos(uniquePhotoIds, email);

  if (owned.length !== uniquePhotoIds.length) {
    throw badRequest('One or more selected photos do not belong to this account');
  }

  const { data: album, error } = await supabase
    .from('albums')
    .insert({
      name,
      email,
      music_url: musicUrl || '',
    })
    .select('id, name, email, music_url, created_at')
    .single();

  if (error) throw new HttpError(500, `Could not create album: ${error.message}`);

  const { error: linkError } = await supabase.from('album_photos').insert(
    uniquePhotoIds.map((photoId) => ({ album_id: album.id, photo_id: photoId })),
  );

  if (linkError) {
    await supabase.from('albums').delete().eq('id', album.id).eq('email', email);
    throw new HttpError(500, `Could not add photos to album: ${linkError.message}`);
  }

  return { ...album, photoCount: uniquePhotoIds.length, coverUrl: owned[0]?.url || '' };
}

/**
 * Lists albums with a cover and photo count using two queries total instead of
 * the previous N+1 pattern (two queries per album).
 */
async function listAlbums(email) {
  const { data: albums, error } = await supabase
    .from('albums')
    .select('id, name, email, music_url, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false });

  if (error) throw new HttpError(500, `Could not load albums: ${error.message}`);
  if (!albums.length) return [];

  const { data: links, error: linkError } = await supabase
    .from('album_photos')
    .select('album_id, photo_id, created_at, photos(url)')
    .in('album_id', albums.map((album) => album.id))
    .order('created_at', { ascending: true });

  if (linkError) throw new HttpError(500, `Could not load album photos: ${linkError.message}`);

  const stats = new Map();
  for (const link of links) {
    const entry = stats.get(link.album_id) || { count: 0, coverUrl: '' };
    entry.count += 1;
    if (!entry.coverUrl && link.photos?.url) entry.coverUrl = link.photos.url;
    stats.set(link.album_id, entry);
  }

  return albums.map((album) => ({
    ...album,
    photoCount: stats.get(album.id)?.count || 0,
    coverUrl: stats.get(album.id)?.coverUrl || '',
  }));
}

async function getAlbum(email, albumId) {
  const { data: album, error } = await supabase
    .from('albums')
    .select('id, name, email, music_url, created_at')
    .eq('id', albumId)
    .eq('email', email)
    .maybeSingle();

  if (error) throw new HttpError(500, `Could not load album: ${error.message}`);
  if (!album) throw notFound('Album not found');
  return album;
}

async function getAlbumPhotos(albumId) {
  const { data, error } = await supabase
    .from('album_photos')
    .select('created_at, photos(id, url, created_at)')
    .eq('album_id', albumId)
    .order('created_at', { ascending: true });

  if (error) throw new HttpError(500, `Could not load album photos: ${error.message}`);

  return (data || [])
    .map((row) => row.photos)
    .filter(Boolean)
    .map((photo) => ({ id: photo.id, url: photo.url, created_at: photo.created_at }));
}

async function getAlbumWithPhotos(email, albumId) {
  const album = await getAlbum(email, albumId);
  const photos = await getAlbumPhotos(albumId);
  return { album, photos };
}

module.exports = { createAlbum, listAlbums, getAlbum, getAlbumPhotos, getAlbumWithPhotos };
