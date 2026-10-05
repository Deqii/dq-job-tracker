import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { companyCreateSchema, companyUpdateSchema, validateBody } from '../schemas';
import {
  createCompany,
  deleteCompany,
  listCompanies,
  updateCompany,
} from '../services/company.service';

export const companyRouter = Router();

companyRouter.use(requireAuth);

companyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companies = await listCompanies(req.userId!);
    res.json(companies);
  }),
);

companyRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = validateBody(companyCreateSchema, req.body);
    const company = await createCompany(req.userId!, input);
    res.status(201).json(company);
  }),
);

companyRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = validateBody(companyUpdateSchema, req.body);
    const company = await updateCompany(req.userId!, req.params.id, input);
    res.json(company);
  }),
);

companyRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteCompany(req.userId!, req.params.id);
    res.status(204).end();
  }),
);