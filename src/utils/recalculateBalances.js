import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { PersonLedger } from '../models/PersonLedger.js';
import {
  Transaction,
  ACTIVE_TRANSACTION_MATCH,
} from '../models/Transaction.js';
import { applyTransactionEffects } from '../services/transactionService.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** Replays all active postings from ledger truth (openingBalance on accounts unchanged). */
export async function recalculateBalancesForUser(userId) {
  const uid = toOid(userId);
  const accounts = await Account.find({ userId: uid });
  for (const a of accounts) {
    a.currentBalance = Number(a.openingBalance ?? 0);
    await a.save();
  }
  const persons = await PersonLedger.find({ userId: uid });
  for (const p of persons) {
    p.totalGiven = 0;
    p.totalTaken = 0;
    await p.save();
  }
  const txs = await Transaction.find({
    userId: uid,
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .sort({ dateKey: 1, createdAt: 1 })
    .lean();
  for (const t of txs) {
    await applyTransactionEffects(t);
  }
}
