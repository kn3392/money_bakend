import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr =
    Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  const body = stack ?? message;
  return `${ts} [${level}] ${body}${metaStr}`;
});

const logger = winston.createLogger({
  level: env.isProduction ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: env.isDevelopment
        ? combine(
            colorize({ all: true }),
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
          )
        : combine(
            errors({ stack: true }),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            logFormat
          ),
    }),
  ],
  exitOnError: false,
});

export default logger;
