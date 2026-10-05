import type { NextFunction, Request, Response } from 'express';

interface ErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function toErrorBody(error: unknown, fallbackMessage: string): ErrorBody {
  if (error instanceof HttpError) {
    return { message: error.message };
  }
  return { message: fallbackMessage };
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}