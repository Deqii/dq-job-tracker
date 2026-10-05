import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { getDashboard } from '../services/dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const dashboard = await getDashboard(req.userId!);
    res.json(dashboard);
  }),
);