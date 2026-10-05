import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { loginSchema, registerSchema, validateBody } from '../schemas';
import { loginUser, registerUser } from '../services/auth.service';

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = validateBody(registerSchema, req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = validateBody(loginSchema, req.body);
    const result = await loginUser(input);
    res.json(result);
  }),
);