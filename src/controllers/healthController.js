import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

/**
 * GET /api/health — liveness (does not require DB).
 */
export const getHealth = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server running',
    service: 'SmartKhata API',
    apiVersion: env.API_VERSION,
    apiBase: '/api/v1',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/test-db — verifies Mongoose connection.
 */
export const getTestDb = asyncHandler(async (_req, res) => {
  const ready = mongoose.connection.readyState === 1;

  if (!ready) {
    throw new AppError('Database not connected', 503);
  }

  await mongoose.connection.db.admin().ping();

  res.status(200).json({
    success: true,
    message: 'Database connection OK',
    db: mongoose.connection.name,
    host: mongoose.connection.host,
    readyState: mongoose.connection.readyState,
  });
});
