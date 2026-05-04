import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const tooMany = {
  success: false,
  message: 'Too many requests, please try again later.',
};

/** Applied to all versioned API routes */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

/** Stricter window for login/register — brute-force mitigation */
export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});
