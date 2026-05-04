import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getHealth } from './controllers/healthController.js';
import apiRoutes from './routes/index.js';

const app = express();

if (env.isProduction) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: env.isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
    dnsPrefetchControl: { allow: false },
  })
);

function corsOriginCallback(origin, callback) {
  const allowed = env.CORS_ALLOWED_ORIGINS;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!origin) {
    callback(null, true);
    return;
  }
  if (list.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error('Not allowed by CORS'));
}

app.use(
  cors({
    origin: corsOriginCallback,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: env.JSON_BODY_LIMIT }));

const uploadRoot = path.join(process.cwd(), env.UPLOAD_DIR);
app.use(
  '/uploads',
  express.static(uploadRoot, {
    fallthrough: true,
    maxAge: env.isProduction ? '7d' : 0,
  })
);

const morganStream = {
  write: (line) => {
    logger.info(line.trim());
  },
};

app.use(
  morgan(env.isDevelopment ? 'dev' : 'combined', {
    stream: morganStream,
  })
);

/** Load balancer / platform probes — stable URL outside versioning */
app.get('/api/health', getHealth);

/** Versioned API — primary prefix used by the SPA */
app.use('/api/v1', apiLimiter, apiRoutes);
/**
 * Same router under `/api/*` for proxies or older deploys that expect no `/v1`
 * segment. `/api/health` stays on the dedicated handler above; `/api/v1/*` is
 * handled by the first mount only (paths must start with `/api/v1`).
 */
app.use('/api', apiLimiter, apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
