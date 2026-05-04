import mongoose from 'mongoose';
import { env } from './env.js';
import logger from '../utils/logger.js';


mongoose.set('strictQuery', true);

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', {
    err: err instanceof Error ? err.message : String(err),
  });
});



/**
 * Connect to MongoDB. Throws on failure — caller should not start HTTP until this resolves.
 */
export async function connectDB() {
  await mongoose.connect(env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  logger.info('MongoDB connected', {
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  });
}

/**
 * Graceful disconnect for shutdown hooks.
 */
export async function disconnectDB() {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}

/** @returns {number} mongoose connection readyState */
export function getConnectionState() {
  return mongoose.connection.readyState;
}

/** @returns {boolean} */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
