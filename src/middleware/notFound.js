import { AppError } from '../utils/AppError.js';

/**
 * 404 handler — place after all routes.
 */
export function notFound(req, _res, next) {
  next(new AppError(`Not found: ${req.method} ${req.originalUrl}`, 404));
}
