import type { NextFunction, Request, Response } from 'express';

import { verifyToken } from '../lib/jwt';
import { HttpError, unauthorized } from '../lib/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    next(unauthorized('Authentication required'));
    return;
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err as HttpError);
  }
}