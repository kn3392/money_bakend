import mongoose from 'mongoose';
import {
  compareDateKeys,
  normalizeToISTDateKey,
  shiftISTDateKey,
} from '../utils/dateUtils.js';
import {
  dateKeyToUtcNoon,
  getISTDateKey,
  shiftISTMonths,
} from '../utils/financialYear.js';
import { RecurringTransaction } from '../models/RecurringTransaction.js';
import { createTransaction } from './transactionService.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

function advanceAfterDateKey(dateKey, frequency) {
  if (frequency === 'daily') return shiftISTDateKey(dateKey, 1);
  if (frequency === 'weekly') return shiftISTDateKey(dateKey, 7);
  if (frequency === 'monthly') return shiftISTMonths(dateKey, 1);
  if (frequency === 'yearly') return shiftISTMonths(dateKey, 12);
  throw new AppError('Invalid frequency', 400);
}

function recurringTransactionBody(rec, istDateKey) {
  const body = {
    type: rec.type,
    amount: rec.amount,
    date: istDateKey,
    note: rec.note ?? '',
  };
  if (rec.type === 'transfer') {
    body.fromAccountId = rec.fromAccountId;
    body.toAccountId = rec.toAccountId;
  } else {
    body.accountId = rec.accountId;
    body.categoryId = rec.categoryId;
    if (rec.personId) body.personId = rec.personId;
  }
  return body;
}

/**
 * Advances `doc` schedule after a successful posting for `postedDateKey`.
 */
async function rescheduleAfterPosting(doc, postedDateKey) {
  const nextKey = advanceAfterDateKey(postedDateKey, doc.frequency);
  doc.lastMaterializedDateKey = postedDateKey;
  doc.lastRunDate = new Date();
  doc.nextRunDate = dateKeyToUtcNoon(nextKey);
  if (
    doc.endDate &&
    compareDateKeys(normalizeToISTDateKey(doc.endDate), nextKey) < 0
  ) {
    doc.isActive = false;
  }
  await doc.save();
}

/**
 * Processes one recurring definition until caught up through today IST.
 */
async function materializeRecurringUntilCaughtUp(docId) {
  const todayKey = getISTDateKey();
  let iterations = 0;
  while (iterations++ < 1000) {
    const fresh = await RecurringTransaction.findById(docId);
    if (!fresh || !fresh.isActive) break;
    let dueKey;
    try {
      dueKey = normalizeToISTDateKey(fresh.nextRunDate);
    } catch {
      throw new AppError('Invalid recurring nextRunDate', 500);
    }
    if (compareDateKeys(dueKey, todayKey) > 0) break;
    if (fresh.endDate) {
      const endK = normalizeToISTDateKey(fresh.endDate);
      if (compareDateKeys(dueKey, endK) > 0) {
        fresh.isActive = false;
        await fresh.save();
        break;
      }
    }
    try {
      await createTransaction(String(fresh.userId), recurringTransactionBody(fresh, dueKey), {
        recurring: { templateId: fresh._id, dateKeyIST: dueKey },
      });
    } catch (e) {
      if (Number(e.statusCode) === 409) {
        await rescheduleAfterPosting(fresh, dueKey);
        continue;
      }
      throw e;
    }
    await rescheduleAfterPosting(fresh, dueKey);
  }
}

export async function listRecurring(userIdStr) {
  return RecurringTransaction.find({ userId: toOid(userIdStr) }).sort({
    nextRunDate: 1,
  });
}

export async function createRecurring(userIdStr, payload) {
  if (payload.type === 'transfer') {
    if (!payload.fromAccountId || !payload.toAccountId) {
      throw new AppError(
        'Recurring transfer requires fromAccountId and toAccountId',
        400
      );
    }
  } else if (!payload.accountId || !payload.categoryId) {
    throw new AppError(
      'Recurring income/expense requires accountId and categoryId',
      400
    );
  }
  const startKey = normalizeToISTDateKey(payload.startDate);
  const nextRunDate =
    typeof payload.nextRunDate === 'string'
      ? dateKeyToUtcNoon(normalizeToISTDateKey(payload.nextRunDate))
      : dateKeyToUtcNoon(startKey);

  const doc = new RecurringTransaction({
    userId: toOid(userIdStr),
    type: payload.type,
    amount: Number(payload.amount),
    accountId:
      payload.type === 'transfer' ? null : payload.accountId || null,
    categoryId:
      payload.type === 'transfer' ? null : payload.categoryId || null,
    fromAccountId:
      payload.type === 'transfer' ? payload.fromAccountId : null,
    toAccountId:
      payload.type === 'transfer' ? payload.toAccountId : null,
    personId: payload.personId || null,
    note: typeof payload.note === 'string' ? payload.note : '',
    frequency: payload.frequency,
    startDate: dateKeyToUtcNoon(startKey),
    nextRunDate,
    endDate:
      payload.endDate != null ? dateKeyToUtcNoon(normalizeToISTDateKey(payload.endDate)) : null,
    isActive:
      payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    lastMaterializedDateKey: '',
    lastRunDate: null,
  });
  await doc.validate();
  await doc.save();
  return doc;
}

export async function updateRecurring(userIdStr, id, patch) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const doc = await RecurringTransaction.findOne({
    _id: id,
    userId: toOid(userIdStr),
  });
  if (!doc) throw new AppError('Recurring rule not found', 404);

  if (patch.type !== undefined) doc.type = patch.type;
  if (patch.amount !== undefined) doc.amount = Number(patch.amount);
  if (patch.accountId !== undefined) doc.accountId = patch.accountId || null;
  if (patch.categoryId !== undefined) doc.categoryId = patch.categoryId || null;
  if (patch.fromAccountId !== undefined)
    doc.fromAccountId = patch.fromAccountId || null;
  if (patch.toAccountId !== undefined)
    doc.toAccountId = patch.toAccountId || null;
  if (patch.personId !== undefined) doc.personId = patch.personId || null;
  if (patch.note !== undefined) doc.note = String(patch.note ?? '');
  if (patch.frequency !== undefined) doc.frequency = patch.frequency;
  if (patch.startDate !== undefined)
    doc.startDate = dateKeyToUtcNoon(normalizeToISTDateKey(patch.startDate));
  if (patch.nextRunDate !== undefined)
    doc.nextRunDate = dateKeyToUtcNoon(normalizeToISTDateKey(patch.nextRunDate));
  if (patch.endDate !== undefined)
    doc.endDate = patch.endDate
      ? dateKeyToUtcNoon(normalizeToISTDateKey(patch.endDate))
      : null;
  if (patch.isActive !== undefined) doc.isActive = Boolean(patch.isActive);
  await doc.validate();
  await doc.save();
  return doc;
}

export async function deleteRecurringSoft(userIdStr, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const doc = await RecurringTransaction.findOne({
    _id: id,
    userId: toOid(userIdStr),
  });
  if (!doc) throw new AppError('Recurring rule not found', 404);
  doc.isActive = false;
  await doc.save();
  return doc;
}

export async function runDueRecurringTransactions(userIdStr) {
  const items = await RecurringTransaction.find({
    userId: toOid(userIdStr),
    isActive: true,
  }).select('_id');
  for (const row of items) {
    await materializeRecurringUntilCaughtUp(row._id);
  }
}

export async function runDueRecurringAllUsers() {
  const userIds = await RecurringTransaction.distinct('userId', {
    isActive: true,
  });
  for (const u of userIds) {
    try {
      await runDueRecurringTransactions(String(u));
    } catch (err) {
      logger.error('recurring run failed for user', {
        userId: String(u),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
