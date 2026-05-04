import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { asyncHandler } from './asyncHandler.js';
import { AppError } from '../utils/AppError.js';

/**
 * Protect routes — Bearer JWT required. Sets `req.user` (no password/pin).
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Not authorized, no token', 401);
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw new AppError('Not authorized, no token', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Not authorized, invalid or expired token', 401);
  }

  const id = decoded.sub;
  if (!id || typeof id !== 'string') {
    throw new AppError('Not authorized, invalid token payload', 401);
  }

  const user = await User.findById(id).select('-password -pin');
  if (!user) {
    throw new AppError('User not found', 401);
  }

  req.user = user;
  next();
});
