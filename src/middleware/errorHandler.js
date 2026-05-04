import multer from 'multer';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Centralized error handler — must be last middleware.
 * @param {Error & { statusCode?: number }} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const statusCode =
      err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large'
        : 'Upload failed';
    logger.warn('Multer error', {
      path: req.originalUrl,
      code: err.code,
    });
    return res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy blocked this origin',
    });
  }

  const statusCode =
    typeof err.statusCode === 'number' ? err.statusCode : 500;

  const isOperational =
    err instanceof AppError && err.isOperational === true;

  const message =
    statusCode === 500 && env.isProduction && !isOperational
      ? 'Internal server error'
      : err.message || 'Internal server error';

  const logPayload = {
    path: req.originalUrl,
    method: req.method,
    statusCode,
    message: err.message,
    ...(env.isDevelopment && { stack: err.stack }),
  };

  if (statusCode >= 500) {
    logger.error('Request error', logPayload);
  } else {
    logger.warn('Client error', logPayload);
  }

  const body = {
    success: false,
    message,
    ...(env.isDevelopment && {
      stack: err.stack,
      cause: err.cause,
    }),
  };

  res.status(statusCode).json(body);
}
