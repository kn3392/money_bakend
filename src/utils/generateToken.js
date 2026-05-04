import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * @param {string} userId
 * @returns {string}
 */
export function generateToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}
