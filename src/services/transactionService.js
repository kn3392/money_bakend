import mongoose from 'mongoose';
import {
  Transaction,
  ACTIVE_TRANSACTION_MATCH,
} from '../models/Transaction.js';
import { Account } from '../models/Account.js';
import { Category } from '../models/Category.js';
import { PersonLedger } from '../models/PersonLedger.js';
import { DayLedger } from '../models/DayLedger.js';
import { AppError } from '../utils/AppError.js';
import { normalizeToISTDateKey, compareDateKeys } from '../utils/dateUtils.js';
import { dateKeyToUtcNoon, getFinancialYearLabelForDate } from '../utils/financialYear.js';
import { recalculateLedgerChainFrom } from './ledgerService.js';
import { runWithOptionalSession } from './mongoSessionHelper.js';
import { assertTagsOwned } from './tagService.js';
import { notifyBudgetsForExpense } from './budgetNotifyService.js';

function toOid(userId) {
  return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
}

function applySessionMaybe(query, session) {
  return session ? query.session(session) : query;
}

function normalizeTagIds(body) {
  if (body.tagIds == null) return null;
  const arr = Array.isArray(body.tagIds) ? body.tagIds : [body.tagIds];
  return [...new Set(arr.map((x) => String(x)).filter(Boolean))];
}

function fireBudgetNotify(uidStr, tx) {
  if (tx?.type === 'expense' && tx?.categoryId && tx?.dateKey) {
    void notifyBudgetsForExpense(uidStr, tx.categoryId, tx.dateKey);
  }
}

async function assertDayNotLocked(uid, dateKey, session = null) {
  const base = DayLedger.findOne({
    userId: toOid(uid),
    dateKey,
  }).select('isLocked');
  const d = await applySessionMaybe(base, session).lean();
  if (d?.isLocked)
    throw new AppError(
      'This day is locked; no transactions can be added or edited',
      403
    );
}

async function assertActiveAccount(userId, accountId, session = null) {
  const q = Account.findOne({
    _id: accountId,
    userId: toOid(userId),
    isActive: true,
  });
  const a = await applySessionMaybe(q, session);
  if (!a) throw new AppError('Account not found or inactive', 400);
  return a;
}

async function assertActiveCategory(userId, categoryId, expectedType, session = null) {
  const q = Category.findOne({
    _id: categoryId,
    userId: toOid(userId),
    isActive: true,
    type: expectedType,
  });
  const c = await applySessionMaybe(q, session);
  if (!c) throw new AppError('Category not found, inactive, or wrong type', 400);
  return c;
}

async function assertActivePersonOptional(userId, personId, session = null) {
  if (!personId) return;
  const q = PersonLedger.findOne({
    _id: personId,
    userId: toOid(userId),
    isActive: true,
  });
  const p = await applySessionMaybe(q, session);
  if (!p) throw new AppError('Person not found or inactive', 400);
}

export async function applyTransactionEffects(tx, session = null) {
  const uid = tx.userId;

  if (tx.type === 'income') {
    const r = await Account.findOneAndUpdate(
      { _id: tx.accountId, userId: uid, isActive: true },
      { $inc: { currentBalance: tx.amount } },
      { new: true, ...(session ? { session } : {}) }
    );
    if (!r) throw new AppError('Failed to credit account', 500);
    if (tx.personId) {
      const q = PersonLedger.findOne({ _id: tx.personId, userId: uid });
      const p = await applySessionMaybe(q, session);
      if (!p) throw new AppError('Person not found', 400);
      p.totalTaken += tx.amount;
      await p.save(session ? { session } : {});
    }
  } else if (tx.type === 'expense') {
    const r = await Account.findOneAndUpdate(
      { _id: tx.accountId, userId: uid, isActive: true },
      { $inc: { currentBalance: -tx.amount } },
      { new: true, ...(session ? { session } : {}) }
    );
    if (!r) throw new AppError('Failed to debit account', 500);
    if (tx.personId) {
      const q = PersonLedger.findOne({ _id: tx.personId, userId: uid });
      const p = await applySessionMaybe(q, session);
      if (!p) throw new AppError('Person not found', 400);
      p.totalGiven += tx.amount;
      await p.save(session ? { session } : {});
    }
  } else if (tx.type === 'transfer') {
    const fr = await Account.findOneAndUpdate(
      { _id: tx.fromAccountId, userId: uid, isActive: true },
      { $inc: { currentBalance: -tx.amount } },
      { new: true, ...(session ? { session } : {}) }
    );
    if (!fr) throw new AppError('Failed to debit source account', 500);
    const tor = await Account.findOneAndUpdate(
      { _id: tx.toAccountId, userId: uid, isActive: true },
      { $inc: { currentBalance: tx.amount } },
      { new: true, ...(session ? { session } : {}) }
    );
    if (!tor) throw new AppError('Failed to credit destination account', 500);
  }
}

export async function reverseTransactionEffects(tx, session = null) {
  const uid = tx.userId;
  const sess = session ? { session } : {};

  if (tx.type === 'income') {
    await Account.findOneAndUpdate(
      { _id: tx.accountId, userId: uid, isActive: true },
      { $inc: { currentBalance: -tx.amount } },
      sess
    );
    if (tx.personId) {
      const p = await applySessionMaybe(
        PersonLedger.findOne({ _id: tx.personId, userId: uid }),
        session
      );
      if (p) {
        p.totalTaken -= tx.amount;
        if (p.totalTaken < 0) p.totalTaken = 0;
        await p.save(sess);
      }
    }
  } else if (tx.type === 'expense') {
    await Account.findOneAndUpdate(
      { _id: tx.accountId, userId: uid, isActive: true },
      { $inc: { currentBalance: tx.amount } },
      sess
    );
    if (tx.personId) {
      const p = await applySessionMaybe(
        PersonLedger.findOne({ _id: tx.personId, userId: uid }),
        session
      );
      if (p) {
        p.totalGiven -= tx.amount;
        if (p.totalGiven < 0) p.totalGiven = 0;
        await p.save(sess);
      }
    }
  } else if (tx.type === 'transfer') {
    await Account.findOneAndUpdate(
      { _id: tx.fromAccountId, userId: uid, isActive: true },
      { $inc: { currentBalance: tx.amount } },
      sess
    );
    await Account.findOneAndUpdate(
      { _id: tx.toAccountId, userId: uid, isActive: true },
      { $inc: { currentBalance: -tx.amount } },
      sess
    );
  }
}

function hydrateDerivedFromDate(doc) {
  doc.dateKey = normalizeToISTDateKey(doc.date);
  doc.financialYear = getFinancialYearLabelForDate(doc.date);
}

const populateTxn = [
  { path: 'accountId', select: 'name type currentBalance isActive' },
  { path: 'categoryId', select: 'name type color' },
  { path: 'fromAccountId', select: 'name type' },
  { path: 'toAccountId', select: 'name type' },
  { path: 'personId', select: 'name balance totalGiven totalTaken isActive' },
  { path: 'tagIds', select: 'name color isActive' },
];

export async function getTransactionPopulatedById(userId, id) {
  return Transaction.findOne({ _id: id, userId: toOid(userId) }).populate(
    populateTxn
  );
}

export async function listTransactionsForUserDay(userId, dateKey) {
  return Transaction.find({
    userId: toOid(userId),
    dateKey,
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .populate({ path: 'accountId', select: 'name type', options: { lean: true } })
    .populate({ path: 'categoryId', select: 'name type color', options: { lean: true } })
    .populate({ path: 'fromAccountId', select: 'name type', options: { lean: true } })
    .populate({ path: 'toAccountId', select: 'name type', options: { lean: true } })
    .populate({ path: 'personId', select: 'name balance totalGiven totalTaken isActive', options: { lean: true } })
    .populate({ path: 'tagIds', select: 'name color isActive', options: { lean: true } })
    .select('type amount dateKey note attachmentUrl financialYear accountId categoryId fromAccountId toAccountId personId tagIds status createdAt updatedAt')
    .sort({ createdAt: 1 })
    .lean();
}

/**
 * @param {object} body — HTTP-safe fields only (no recurringTemplateId/materialization.)
 * @param {object} [opts]
 * @param {{ templateId: import('mongoose').Types.ObjectId|string, dateKeyIST: string }} [opts.recurring] server-only recurring materialization dedupe metadata
 */
export async function createTransaction(userId, body, opts = null) {
  const uidStr = typeof userId === 'string' ? userId : userId.toString();
  const incomingRecurring =
    opts && opts.recurring && opts.recurring.templateId && opts.recurring.dateKeyIST
      ? opts.recurring
      : null;
  const dateKeyNorm = normalizeToISTDateKey(body.date);
  await assertDayNotLocked(uidStr, dateKeyNorm);

  if (incomingRecurring) {
    const tplId = incomingRecurring.templateId;
    const dKey = normalizeToISTDateKey(incomingRecurring.dateKeyIST);
    const exists = await Transaction.findOne({
      userId: toOid(uidStr),
      recurringTemplateId: tplId,
      materializationDateKey: dKey,
    }).lean();
    if (exists) {
      throw new AppError(
        'Recurring entry for this calendar day already exists',
        409
      );
    }
  }

  if (body.type === 'transfer') {
    if (String(body.fromAccountId) === String(body.toAccountId)) {
      throw new AppError('Transfer accounts must be different', 400);
    }
  }

  const doc = new Transaction({
    userId: toOid(uidStr),
    type: body.type,
    amount: Number(body.amount),
    date: dateKeyToUtcNoon(dateKeyNorm),
    note:
      typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '',
    attachmentUrl:
      typeof body.attachmentUrl === 'string'
        ? body.attachmentUrl.trim().slice(0, 2048)
        : '',
    status: 'active',
  });
  hydrateDerivedFromDate(doc);

  if (incomingRecurring) {
    doc.recurringTemplateId =
      typeof incomingRecurring.templateId === 'string'
        ? new mongoose.Types.ObjectId(incomingRecurring.templateId)
        : incomingRecurring.templateId;
    doc.materializationDateKey = normalizeToISTDateKey(
      incomingRecurring.dateKeyIST
    );
  }

  if (doc.type === 'income' || doc.type === 'expense') {
    doc.accountId = toOid(body.accountId);
    doc.categoryId = toOid(body.categoryId);
    doc.personId = body.personId ? toOid(body.personId) : undefined;
    doc.fromAccountId = undefined;
    doc.toAccountId = undefined;
  } else {
    doc.fromAccountId = toOid(body.fromAccountId);
    doc.toAccountId = toOid(body.toAccountId);
    doc.personId = undefined;
    doc.accountId = undefined;
    doc.categoryId = undefined;
  }

  const tagList = normalizeTagIds(body);
  if (tagList && tagList.length) {
    await assertTagsOwned(uidStr, tagList);
    doc.tagIds = tagList.map((id) => toOid(id));
  } else {
    doc.tagIds = [];
  }

  let createdId;

  await runWithOptionalSession(async (session) => {
    if (doc.type === 'income' || doc.type === 'expense') {
      await assertActiveAccount(uidStr, doc.accountId, session);
      await assertActiveCategory(uidStr, doc.categoryId, doc.type, session);
      await assertActivePersonOptional(uidStr, doc.personId, session);
    } else {
      await assertActiveAccount(uidStr, doc.fromAccountId, session);
      await assertActiveAccount(uidStr, doc.toAccountId, session);
    }
    await assertDayNotLocked(uidStr, doc.dateKey, session);

    await doc.validate();
    await doc.save(session ? { session } : {});
    createdId = doc._id;
    await applyTransactionEffects(doc, session);
  });

  await recalculateLedgerChainFrom(uidStr, doc.dateKey);
  const out = await getTransactionPopulatedById(uidStr, createdId);
  fireBudgetNotify(uidStr, out);
  return out;
}

export async function updateTransaction(userId, transactionId, body) {
  const uidStr = typeof userId === 'string' ? userId : userId.toString();
  if (!mongoose.isValidObjectId(transactionId))
    throw new AppError('Invalid transaction id', 400);
  const oid = new mongoose.Types.ObjectId(transactionId);

  const existing = await Transaction.findOne({
    _id: oid,
    userId: toOid(uidStr),
    ...ACTIVE_TRANSACTION_MATCH,
  });
  if (!existing) throw new AppError('Transaction not found', 404);

  const prevDateKey = existing.dateKey;
  const prevExpenseSnap =
    existing.type === 'expense'
      ? { categoryId: existing.categoryId, dateKey: existing.dateKey }
      : null;
  await assertDayNotLocked(uidStr, prevDateKey);

  await runWithOptionalSession(async (session) => {
    await reverseTransactionEffects(existing, session);

    const nextType =
      body.type !== undefined ? body.type : existing.type;
    existing.type = nextType;
    existing.amount =
      body.amount !== undefined ? Number(body.amount) : existing.amount;

    if (body.note !== undefined) {
      existing.note = String(body.note).trim().slice(0, 2000);
    }
    if (body.attachmentUrl !== undefined) {
      existing.attachmentUrl = String(body.attachmentUrl).trim().slice(0, 2048);
    }

    if (body.date !== undefined) {
      const dk = normalizeToISTDateKey(body.date);
      existing.date = dateKeyToUtcNoon(dk);
    }
    hydrateDerivedFromDate(existing);

    const newDateKey = existing.dateKey;
    await assertDayNotLocked(uidStr, prevDateKey, session);
    await assertDayNotLocked(uidStr, newDateKey, session);

    if (existing.type === 'transfer') {
      existing.fromAccountId =
        body.fromAccountId !== undefined
          ? toOid(body.fromAccountId)
          : existing.fromAccountId;
      existing.toAccountId =
        body.toAccountId !== undefined ? toOid(body.toAccountId) : existing.toAccountId;
      existing.accountId = undefined;
      existing.categoryId = undefined;
      existing.personId = undefined;
      existing.recurringTemplateId = undefined;
      existing.materializationDateKey = '';
      if (String(existing.fromAccountId) === String(existing.toAccountId)) {
        throw new AppError('Transfer accounts must be different', 400);
      }
      await assertActiveAccount(uidStr, existing.fromAccountId, session);
      await assertActiveAccount(uidStr, existing.toAccountId, session);
    } else {
      existing.accountId =
        body.accountId !== undefined ? toOid(body.accountId) : existing.accountId;
      existing.categoryId =
        body.categoryId !== undefined
          ? toOid(body.categoryId)
          : existing.categoryId;
      existing.personId =
        body.personId !== undefined
          ? body.personId
            ? toOid(body.personId)
            : undefined
          : existing.personId;
      existing.fromAccountId = undefined;
      existing.toAccountId = undefined;
      await assertActiveAccount(uidStr, existing.accountId, session);
      await assertActiveCategory(uidStr, existing.categoryId, existing.type, session);
      await assertActivePersonOptional(uidStr, existing.personId, session);
    }

    if (body.tagIds !== undefined) {
      const tagList = normalizeTagIds(body);
      if (tagList && tagList.length) {
        await assertTagsOwned(uidStr, tagList);
        existing.tagIds = tagList.map((id) => toOid(id));
      } else {
        existing.tagIds = [];
      }
    }

    await existing.validate();
    await existing.save(session ? { session } : {});
    await applyTransactionEffects(existing, session);
  });

  const endKeyAfter = existing.dateKey;
  const chainFromMin =
    compareDateKeys(prevDateKey, endKeyAfter) <= 0 ? prevDateKey : endKeyAfter;
  await recalculateLedgerChainFrom(uidStr, chainFromMin);
  const out = await getTransactionPopulatedById(uidStr, oid);
  if (prevExpenseSnap) {
    fireBudgetNotify(uidStr, {
      type: 'expense',
      categoryId: prevExpenseSnap.categoryId,
      dateKey: prevExpenseSnap.dateKey,
    });
  }
  fireBudgetNotify(uidStr, out);
  return out;
}

/** Soft-remove: reverse ledger effects then mark deleted (audit trail kept). */
export async function deleteTransaction(userId, transactionId) {
  const uidStr = typeof userId === 'string' ? userId : userId.toString();
  if (!mongoose.isValidObjectId(transactionId))
    throw new AppError('Invalid transaction id', 400);
  const oid = new mongoose.Types.ObjectId(transactionId);

  const existing = await Transaction.findOne({
    _id: oid,
    userId: toOid(uidStr),
    ...ACTIVE_TRANSACTION_MATCH,
  });
  if (!existing) throw new AppError('Transaction not found', 404);

  const dk = existing.dateKey;
  const expSnap =
    existing.type === 'expense'
      ? { categoryId: existing.categoryId, dateKey: existing.dateKey }
      : null;
  await assertDayNotLocked(uidStr, dk);

  await runWithOptionalSession(async (session) => {
    await reverseTransactionEffects(existing, session);
    existing.status = 'deleted';
    await existing.save(session ? { session } : {});
  });

  await recalculateLedgerChainFrom(uidStr, dk);
  if (expSnap) {
    fireBudgetNotify(uidStr, {
      type: 'expense',
      categoryId: expSnap.categoryId,
      dateKey: expSnap.dateKey,
    });
  }
}

/**
 * Reverse ledger effects without deleting doc; keeps immutable history rows with status undone.
 */
export async function undoLastTransaction(userId) {
  const uidStr = typeof userId === 'string' ? userId : userId.toString();
  const oid = toOid(uidStr);

  const last = await Transaction.findOne({
    userId: oid,
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .sort({ createdAt: -1 })
    .select('+createdAt');

  if (!last) throw new AppError('Nothing to undo', 400);

  const dk = last.dateKey;
  const expSnap =
    last.type === 'expense'
      ? { categoryId: last.categoryId, dateKey: last.dateKey }
      : null;
  await assertDayNotLocked(uidStr, dk);

  await runWithOptionalSession(async (session) => {
    await reverseTransactionEffects(last, session);
    last.status = 'undone';
    await last.save(session ? { session } : {});
  });

  await recalculateLedgerChainFrom(uidStr, dk);
  if (expSnap) {
    fireBudgetNotify(uidStr, {
      type: 'expense',
      categoryId: expSnap.categoryId,
      dateKey: expSnap.dateKey,
    });
  }
  return getTransactionPopulatedById(uidStr, last._id);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Paginated search across active transactions for the authenticated user.
 */
export async function searchTransactions(userId, filters) {
  const uidStr = typeof userId === 'string' ? userId : userId.toString();
  const uid = toOid(uidStr);

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const skip = (page - 1) * limit;

  /** @type {Record<string, unknown>[]} */
  const and = [{ userId: uid }, ACTIVE_TRANSACTION_MATCH];

  if (filters.type) {
    and.push({ type: filters.type });
  }

  if (filters.accountId) {
    if (!mongoose.isValidObjectId(filters.accountId)) {
      throw new AppError('Invalid accountId', 400);
    }
    const aid = new mongoose.Types.ObjectId(filters.accountId);
    and.push({
      $or: [
        { accountId: aid },
        { fromAccountId: aid },
        { toAccountId: aid },
      ],
    });
  }

  if (filters.categoryId) {
    if (!mongoose.isValidObjectId(filters.categoryId)) {
      throw new AppError('Invalid categoryId', 400);
    }
    and.push({
      categoryId: new mongoose.Types.ObjectId(filters.categoryId),
    });
  }

  if (filters.personId) {
    if (!mongoose.isValidObjectId(filters.personId)) {
      throw new AppError('Invalid personId', 400);
    }
    and.push({ personId: new mongoose.Types.ObjectId(filters.personId) });
  }

  const q = filters.q && String(filters.q).trim();
  if (q) {
    and.push({ note: { $regex: escapeRegex(q), $options: 'i' } });
  }

  if (
    filters.amount !== undefined &&
    filters.amount !== null &&
    filters.amount !== ''
  ) {
    const amt = Number(filters.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new AppError('Invalid amount filter', 400);
    }
    and.push({ amount: amt });
  }

  const df = filters.dateFrom ? String(filters.dateFrom) : '';
  const dt = filters.dateTo ? String(filters.dateTo) : '';
  if (df && dt && df > dt) {
    throw new AppError('dateFrom cannot be after dateTo', 400);
  }
  if (df) and.push({ dateKey: { $gte: df } });
  if (dt) and.push({ dateKey: { $lte: dt } });

  if (filters.financialYear) {
    and.push({ financialYear: String(filters.financialYear).trim() });
  }

  if (filters.tagId) {
    const tid = String(filters.tagId).trim();
    if (!mongoose.isValidObjectId(tid)) {
      throw new AppError('Invalid tagId', 400);
    }
    and.push({ tagIds: new mongoose.Types.ObjectId(tid) });
  }

  const mongoFilter = { $and: and };

  const sortDir = filters.sort === 'oldest' ? 1 : -1;
  const sortSpec = { date: sortDir, createdAt: sortDir };

  const [transactions, total] = await Promise.all([
    Transaction.find(mongoFilter)
      .populate('accountId', 'name type')
      .populate('categoryId', 'name type')
      .populate('fromAccountId', 'name type')
      .populate('toAccountId', 'name type')
      .populate('personId', 'name')
      .populate('tagIds', 'name color')
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(mongoFilter),
  ]);

  return {
    transactions,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  };
}
