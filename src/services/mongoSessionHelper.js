import mongoose from 'mongoose';
import logger from '../utils/logger.js';

function shouldFallbackTxn(err) {
  const msg = String(err?.message ?? err);
  const code = err?.code ?? err?.codeName;
  return (
    msg.includes('Transaction numbers') ||
    msg.includes('replica set') ||
    msg.includes('Transaction support') ||
    code === 20 ||
    code === 'IllegalOperation'
  );
}

/**
 * Prefer MongoDB transactions when replica set supports them; fallback to sequential `fn(null)`.
 */
export async function runWithOptionalSession(fn) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await fn(session);
    });
  } catch (err) {
    if (!shouldFallbackTxn(err)) throw err;
    logger.warn(
      'MongoDB transaction unavailable — sequential ledger writes (typical standalone dev)'
    );
    await fn(null);
  } finally {
    await session.endSession();
  }
}
