import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { tagCreateSchema, validateBody } from '../schemas';
import { createTag, listTags } from '../services/tag.service';

export const tagRouter = Router();

tagRouter.use(requireAuth);

tagRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await listTags(req.userId!);
    res.json(tags);
  }),
);

tagRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateBody(tagCreateSchema, req.body);
    const tag = await createTag(req.userId!, input.name);
    res.status(201).json(tag);
  }),
);