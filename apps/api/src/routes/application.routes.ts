import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import {
  applicationCreateSchema,
  applicationFiltersSchema,
  applicationUpdateSchema,
  statusChangeSchema,
  validateBody,
  validateQuery,
} from '../schemas';
import {
  changeStatus,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from '../services/application.service';
import { writeApplicationsWorkbook } from '../services/export.service';

export const applicationRouter = Router();

applicationRouter.use(requireAuth);

// NOTE: /export must be registered before /:id so "export" is not treated as an id.
applicationRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const filters = validateQuery(applicationFiltersSchema, req.query);
    const applications = await listApplications(req.userId!, filters);
    await writeApplicationsWorkbook(applications, res);
  }),
);

applicationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = validateQuery(applicationFiltersSchema, req.query);
    const applications = await listApplications(req.userId!, filters);
    res.json(applications);
  }),
);

applicationRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateBody(applicationCreateSchema, req.body);
    const application = await createApplication(req.userId!, input);
    res.status(201).json(application);
  }),
);

applicationRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const application = await getApplication(req.userId!, req.params.id);
    res.json(application);
  }),
);

applicationRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = validateBody(applicationUpdateSchema, req.body);
    const application = await updateApplication(req.userId!, req.params.id, input);
    res.json(application);
  }),
);

applicationRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteApplication(req.userId!, req.params.id);
    res.status(204).end();
  }),
);

applicationRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const input = validateBody(statusChangeSchema, req.body);
    const application = await changeStatus(req.userId!, req.params.id, input);
    res.json(application);
  }),
);