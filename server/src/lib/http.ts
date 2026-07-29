import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { log } from '../logger.js';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function notFound(entity = 'Resource'): ApiError {
  return new ApiError(404, 'not_found', `${entity} not found`);
}

/** Central error handler — consistent envelope, no stack traces to clients. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details }
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'validation_error',
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      }
    });
    return;
  }
  const anyErr = err as { type?: string; status?: number; statusCode?: number; message?: string };
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({
      ok: false,
      error: { code: 'payload_too_large', message: 'Request body too large' }
    });
    return;
  }
  // Client errors raised by framework middleware (static file guards, body
  // parsing, malformed URLs) — return the status without internal details.
  const status = anyErr?.status ?? anyErr?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({
      ok: false,
      error: { code: 'request_error', message: status === 404 ? 'Not found' : 'Request rejected' }
    });
    return;
  }
  log.error('unhandled error', {
    path: req.path,
    method: req.method,
    error: anyErr?.message ?? String(err)
  });
  res.status(500).json({
    ok: false,
    error: { code: 'internal_error', message: 'An internal error occurred' }
  });
}
