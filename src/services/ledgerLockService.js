import mongoose from 'mongoose';
import { DayLedger } from '../models/DayLedger.js';
import { AppError } from '../utils/AppError.js';
import { dateKeyToUtcNoon } from '../utils/financialYear.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export async function setLedgerLock(userId, dateKey, shouldLock) {
  const uid = toOid(userId);
  await DayLedger.findOneAndUpdate(
    { userId: uid, dateKey },
    {
      $set: {
        date: dateKeyToUtcNoon(dateKey),
        isLocked: shouldLock,
        lockedAt: shouldLock ? new Date() : null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

/** Ensure ledger row exists without changing lock flag. */
export async function touchLedgerPlaceholder(userId, dateKey) {
  const uid = toOid(userId);
  await DayLedger.findOneAndUpdate(
    { userId: uid, dateKey },
    {
      $setOnInsert: {
        date: dateKeyToUtcNoon(dateKey),
        openingBalance: 0,
        totalIncome: 0,
        totalExpense: 0,
        totalTransferIn: 0,
        totalTransferOut: 0,
        closingBalance: 0,
        isLocked: false,
        lockedAt: null,
      },
    },
    { upsert: true }
  );
}

export async function getLedgerRow(userId, dateKey) {
  const row = await DayLedger.findOne({
    userId: toOid(userId),
    dateKey,
  }).lean();
  if (!row) throw new AppError('Day ledger not found', 404);
  return row;
}
