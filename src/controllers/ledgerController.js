import mongoose from 'mongoose';
import {
  recalculateLedgerChainFrom,
  getEarliestTxnDateKey,
} from '../services/ledgerService.js';
import { DayLedger } from '../models/DayLedger.js';
import { listTransactionsForUserDay } from '../services/transactionService.js';
import { normalizeToISTDateKey } from '../utils/dateUtils.js';
import { setLedgerLock, getLedgerRow } from '../services/ledgerLockService.js';
import { AppError } from '../utils/AppError.js';

function serializeTx(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: o._id.toString(),
    status: o.status ?? 'active',
    type: o.type,
    amount: o.amount,
    dateKey: o.dateKey,
    note: o.note,
    attachmentUrl: o.attachmentUrl || '',
    financialYear: o.financialYear || '',
    account: o.accountId,
    category: o.categoryId,
    fromAccount: o.fromAccountId,
    toAccount: o.toAccountId,
    person: o.personId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/**
 * GET /api/ledger/day/:date — return day view from cached DayLedger.
 * Only rebuilds the chain if the day row is missing (first visit or stale).
 * Chain recalculation is triggered by mutations (create/update/delete), not reads.
 */
export async function getDayLedger(req, res) {
  const uid = req.user._id.toString();
  let dateKey;
  try {
    dateKey = normalizeToISTDateKey(req.params.date);
  } catch {
    throw new AppError('Invalid date; use YYYY-MM-DD', 400);
  }

  // Fast path: read cached row first
  let day = await DayLedger.findOne({
    userId: new mongoose.Types.ObjectId(uid),
    dateKey,
  }).lean();

  // Only rebuild if the row is missing (first visit to this day)
  if (!day) {
    const earliest = await getEarliestTxnDateKey(uid);
    const chainStart = earliest ?? dateKey;
    await recalculateLedgerChainFrom(uid, chainStart);
    day = await DayLedger.findOne({
      userId: new mongoose.Types.ObjectId(uid),
      dateKey,
    }).lean();
  }

  if (!day) throw new AppError('Day ledger unavailable', 500);

  const all = await listTransactionsForUserDay(uid, dateKey);
  const incomes = [];
  const expenses = [];
  const transfers = [];
  for (const tx of all) {
    const s = serializeTx(tx);
    if (tx.type === 'income') incomes.push(s);
    else if (tx.type === 'expense') expenses.push(s);
    else transfers.push(s);
  }

  res.json({
    success: true,
    date: dateKey,
    openingBalance: day.openingBalance,
    totalIncome: day.totalIncome,
    totalExpense: day.totalExpense,
    totalTransferIn: day.totalTransferIn,
    totalTransferOut: day.totalTransferOut,
    closingBalance: day.closingBalance,
    isLocked: day.isLocked,
    lockedAt: day.lockedAt ?? null,
    transactionsIncome: incomes,
    transactionsExpense: expenses,
    transactionsTransfer: transfers,
    transactions: incomes.concat(expenses, transfers),
  });
}

/** PUT lock */
export async function lockDay(req, res) {
  const uid = req.user._id.toString();
  let dateKey;
  try {
    dateKey = normalizeToISTDateKey(req.params.date);
  } catch {
    throw new AppError('Invalid date; use YYYY-MM-DD', 400);
  }
  await setLedgerLock(uid, dateKey, true);
  // Only rebuild from this day forward, not from the beginning of time
  await recalculateLedgerChainFrom(uid, dateKey);
  const day = await getLedgerRow(uid, dateKey);
  res.json({ success: true, message: 'Day locked', ledger: day });
}

/** PUT unlock */
export async function unlockDay(req, res) {
  const uid = req.user._id.toString();
  let dateKey;
  try {
    dateKey = normalizeToISTDateKey(req.params.date);
  } catch {
    throw new AppError('Invalid date; use YYYY-MM-DD', 400);
  }
  await setLedgerLock(uid, dateKey, false);
  // Only rebuild from this day forward, not from the beginning of time
  await recalculateLedgerChainFrom(uid, dateKey);
  const day = await getLedgerRow(uid, dateKey);
  res.json({ success: true, message: 'Day unlocked', ledger: day });
}
