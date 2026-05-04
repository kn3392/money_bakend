import mongoose from 'mongoose';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** All income/expense postings linked to a person (excluding transfers — no person on transfers here). */
export async function listPersonTransactionsPopulated(userId, personId) {
  const uid = toOid(userId);
  const pid = toOid(personId);

  const populateTxn = [
    { path: 'accountId', select: 'name type' },
    { path: 'categoryId', select: 'name type' },
  ];

  return Transaction.find({
    userId: uid,
    personId: pid,
    type: { $in: ['income', 'expense'] },
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .populate(populateTxn)
    .sort({ dateKey: -1, createdAt: -1 })
    .lean();
}
