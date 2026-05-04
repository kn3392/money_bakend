import dotenv from 'dotenv';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';

const PORT = Number.parseInt(process.env.PORT ?? '5000', 10);

function required(name, value) {
  if (!value || String(value).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** @type {string} */
const MONGO_URI = required('MONGO_URI', process.env.MONGO_URI);

/** @type {string} */
const JWT_SECRET = required('JWT_SECRET', process.env.JWT_SECRET);

if (isProduction && JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be at least 32 characters in production.'
  );
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

const FRONTEND_URL_RAW = (process.env.FRONTEND_URL ?? '').trim();
const CORS_ORIGIN_LEGACY = (process.env.CORS_ORIGIN ?? '').trim();

function parseIntEnv(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Production: FRONTEND_URL (or legacy CORS_ORIGIN) must list real origins — no wildcard.
 * Development: localhost dev servers + optional extra origins from FRONTEND_URL / CORS_ORIGIN.
 */
function parseAllowedOrigins() {
  if (isDevelopment) {
    const set = new Set([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    const extra = FRONTEND_URL_RAW || CORS_ORIGIN_LEGACY;
    if (extra && extra !== '*') {
      extra
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((o) => set.add(o));
    }
    return Array.from(set);
  }

  const raw = FRONTEND_URL_RAW || CORS_ORIGIN_LEGACY;
  if (!raw || raw === '*') {
    throw new Error(
      'Production requires FRONTEND_URL (or CORS_ORIGIN) with explicit origins; wildcard * is not allowed.'
    );
  }
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return parts;
}

const UPLOAD_DIR = (process.env.UPLOAD_DIR ?? 'uploads').replace(/^[/\\]+/, '');
const MAX_FILE_SIZE_BYTES = parseIntEnv(
  'MAX_FILE_SIZE',
  5 * 1024 * 1024
);
const RESTORE_MAX_BYTES = parseIntEnv(
  'RESTORE_MAX_BYTES',
  52 * 1024 * 1024
);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '1mb';

const RATE_LIMIT_WINDOW_MS = parseIntEnv(
  'RATE_LIMIT_WINDOW_MS',
  15 * 60 * 1000
);
const RATE_LIMIT_MAX = parseIntEnv(
  'RATE_LIMIT_MAX',
  isProduction ? 400 : 2000
);
const AUTH_RATE_LIMIT_WINDOW_MS = parseIntEnv(
  'AUTH_RATE_LIMIT_WINDOW_MS',
  15 * 60 * 1000
);
const AUTH_RATE_LIMIT_MAX = parseIntEnv(
  'AUTH_RATE_LIMIT_MAX',
  isProduction ? 20 : 200
);

export const env = {
  NODE_ENV,
  isProduction,
  isDevelopment,
  PORT: Number.isFinite(PORT) && PORT > 0 ? PORT : 5000,
  MONGO_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  FRONTEND_URL: FRONTEND_URL_RAW,
  /** Resolved list or single string for cors package */
  CORS_ALLOWED_ORIGINS: parseAllowedOrigins(),
  UPLOAD_DIR,
  MAX_FILE_SIZE_BYTES,
  RESTORE_MAX_BYTES,
  JSON_BODY_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX,
  AUDIT_LOG_ENABLED: process.env.AUDIT_LOG_ENABLED !== 'false',
  API_VERSION: 'v1',
};
