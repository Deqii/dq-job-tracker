import jwt from 'jsonwebtoken';

import { config } from '../config';
import { unauthorized } from './errors';

export interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  const secret = getJwtSecret();
  return jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw unauthorized('Invalid token');
    }
    return { sub: payload.sub };
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    if (err instanceof Error && err.name === 'JsonWebTokenError') {
      throw unauthorized('Invalid or malformed token');
    }
    throw err;
  }
}

function getJwtSecret(): string {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return config.jwtSecret;
}