'use strict';

const { z } = require('zod');

const uuid = z.string().uuid('Expected a valid id');

const createAlbumSchema = z.object({
  name: z.string().trim().min(1, 'Album name is required').max(120, 'Album name is too long'),
  photoIds: z
    .array(uuid)
    .min(1, 'Select at least one photo')
    .max(200, 'An album can contain at most 200 photos'),
  musicUrl: z
    .union([z.string().trim().url('Music URL must be a valid URL'), z.literal(''), z.null()])
    .optional(),
});

const albumIdParam = z.object({ albumId: uuid });
const personIdParam = z.object({ personId: uuid });

const renamePersonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
});

module.exports = {
  createAlbumSchema,
  albumIdParam,
  personIdParam,
  renamePersonSchema,
};
