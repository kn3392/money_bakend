import mongoose from 'mongoose';
import { DayLedger } from '../models/DayLedger.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import {
  getNextDateKey,
  getPreviousDateKey,
  compareDateKeys,
} from '../utils/dateUtils.js';
import { dateKeyToUtcNoon } from '../utils/financialYear.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/**
 * Opening balance for IST dateKey:
 * Prefer previous day's stored closingBalance; otherwise derive from cumulative income/expense strictly before dateKey (transfers excluded).
 */
export async function getOpeningBalance(userId, dateKey) {
  const uid = toOid(userId);
  const prevKey = getPreviousDateKey(dateKey);
  const prev = await DayLedger.findOne({
    userId: uid,
    dateKey: prevKey,
  }).lean();
  if (prev) return prev.closingBalance;
  return netIncomeMinusExpenseBeforeDate(uid, dateKey);
}

/**
 * Sum(income) - sum(expense) for transactions with dateKey < dateKeyExclusive.
 */
export async function netIncomeMinusExpenseBeforeDate(userIdOid, dateKeyExclusive) {
  const [inc, exp] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          userId: userIdOid,
          type: 'income',
          dateKey: { $lt: dateKeyExclusive },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: userIdOid,
          type: 'expense',
          dateKey: { $lt: dateKeyExclusive },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
  ]);
  const i = inc[0]?.s ?? 0;
  const e = exp[0]?.s ?? 0;
  return i - e;
}

/**
 * Totals for all transactions on this IST day (user-wide aggregate).
 */
export async function sumTransactionsForISTDay(userIdOid, dateKey) {
  const rows = await Transaction.find({
    userId: userIdOid,
    dateKey,
    ...ACTIVE_TRANSACTION_MATCH,
  }).lean();

  let income = 0;
  let expense = 0;
  let transferVol = 0;
  for (const t of rows) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    else if (t.type === 'transfer') transferVol += t.amount;
  }
  return {
    income,
    expense,
    totalTransferIn: transferVol,
    totalTransferOut: transferVol,
  };
}

/**
 * Recalculate and upsert one DayLedger row from truth of Transaction collection.
 * closingBalance = opening + income - expense (transfers do not move this net).
 */
export async function recalculateDayLedger(userId, dateKey, session = null) {
  const uid = toOid(userId);
  const opening = await getOpeningBalance(userId, dateKey);
  const sums = await sumTransactionsForISTDay(uid, dateKey);

  const closing = opening + sums.income - sums.expense;

  const opts = session ? { session } : {};

  await DayLedger.findOneAndUpdate(
    { userId: uid, dateKey },
    {
      $set: {
        date: dateKeyToUtcNoon(dateKey),
        openingBalance: opening,
        totalIncome: sums.income,
        totalExpense: sums.expense,
        totalTransferIn: sums.totalTransferIn,
        totalTransferOut: sums.totalTransferOut,
        closingBalance: closing,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...opts,
    }
  );
}

async function resolveMaxRebuildDate(userId, fromDateKey) {
  const uid = toOid(userId);
  const lastTxn = await Transaction.findOne({
    userId: uid,
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .sort({ dateKey: -1 })
    .select('dateKey')
    .lean();
  let end = lastTxn?.dateKey ?? fromDateKey;
  const lastLedger = await DayLedger.findOne({ userId: uid })
    .sort({ dateKey: -1 })
    .select('dateKey')
    .lean();
  if (lastLedger?.dateKey && compareDateKeys(lastLedger.dateKey, end) > 0) {
    end = lastLedger.dateKey;
  }
  if (compareDateKeys(end, fromDateKey) < 0) end = fromDateKey;
  return end;
}

/**
 * Recompute DayLedger rows from `fromDateKey` forward through the latest affected calendar day.
 * Required after create/update/delete/move of transactions because opening depends on prior closing chain.
 */
export async function recalculateLedgerChainFrom(userId, fromDateKey, session = null) {
  const endKey = await resolveMaxRebuildDate(userId, fromDateKey);
  let d = fromDateKey;

  while (compareDateKeys(d, endKey) <= 0) {
    await recalculateDayLedger(userId, d, session);
    d = getNextDateKey(d);
  }
}

/**
 * Throws if IST day ledger is locked for this user (after loading).
 */
/** Earliest IST day with any txn (for rebuilding carry-forward safely on read). */
export async function getEarliestTxnDateKey(userId) {
  const uid = toOid(userId);
  const t = await Transaction.findOne({
    userId: uid,
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .sort({ dateKey: 1 })
    .select('dateKey')
    .lean();
  return t?.dateKey ?? null;
}

export function assertLedgerUnlocked(dayDoc) {
  if (dayDoc?.isLocked) {
    const err = new Error('This day is locked');
    err.statusCode = 403;
    throw err;
  }
}
