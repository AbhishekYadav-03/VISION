'use strict';

const { z } = require('zod');

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

module.exports = { listQuerySchema };
