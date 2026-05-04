import mongoose from 'mongoose';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  undoLastTransaction,
  searchTransactions,
  getTransactionPopulatedById,
} from '../services/transactionService.js';
import { AppError } from '../utils/AppError.js';
import { recordAudit, recordDetailedAudit } from '../services/auditService.js';

function stripInternalTransactionFields(body) {
  if (!body || typeof body !== 'object') return;
  delete body.status;
  delete body.recurringTemplateId;
  delete body.materializationDateKey;
}

function txAuditSnap(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    type: o.type,
    amount: o.amount,
    dateKey: o.dateKey,
    accountId: o.accountId ? String(o.accountId?._id ?? o.accountId) : null,
    categoryId: o.categoryId ? String(o.categoryId?._id ?? o.categoryId) : null,
    tagIds: (o.tagIds ?? []).map((t) => String(t?._id ?? t)),
  };
}

export async function postTransaction(req, res) {
  stripInternalTransactionFields(req.body);
  const doc = await createTransaction(req.user._id, req.body);
  void recordAudit({
    userId: req.user._id,
    action: 'transaction.create',
    resource: String(doc._id),
    meta: { type: doc.type, dateKey: doc.dateKey },
    req,
  });
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'transaction',
    entityId: String(doc._id),
    oldValue: null,
    newValue: txAuditSnap(doc),
    req,
  });
  res.status(201).json({
    success: true,
    transaction: doc,
  });
}

export async function putTransaction(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Invalid transaction id', 400);
  }
  const before = await getTransactionPopulatedById(req.user._id, req.params.id);
  stripInternalTransactionFields(req.body);
  const doc = await updateTransaction(req.user._id, req.params.id, req.body);
  void recordAudit({
    userId: req.user._id,
    action: 'transaction.update',
    resource: req.params.id,
    meta: {},
    req,
  });
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'transaction',
    entityId: req.params.id,
    oldValue: txAuditSnap(before),
    newValue: txAuditSnap(doc),
    req,
  });
  res.json({
    success: true,
    transaction: doc,
  });
}

export async function postUndoLast(req, res) {
  const doc = await undoLastTransaction(req.user._id);
  void recordAudit({
    userId: req.user._id,
    action: 'transaction.undo_last',
    resource: String(doc._id),
    meta: {},
    req,
  });
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'undo',
    entityType: 'transaction',
    entityId: String(doc._id),
    oldValue: txAuditSnap(doc),
    newValue: { status: 'undone' },
    req,
  });
  res.json({
    success: true,
    message: 'Last active entry undone (soft)',
    transaction: doc,
  });
}

export async function removeTransaction(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Invalid transaction id', 400);
  }
  const before = await getTransactionPopulatedById(req.user._id, req.params.id);
  await deleteTransaction(req.user._id, req.params.id);
  void recordAudit({
    userId: req.user._id,
    action: 'transaction.delete',
    resource: req.params.id,
    meta: {},
    req,
  });
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'transaction',
    entityId: req.params.id,
    oldValue: txAuditSnap(before),
    newValue: { status: 'deleted' },
    req,
  });
  res.json({ success: true, message: 'Transaction deleted' });
}

export async function getSearchTransactions(req, res) {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const out = await searchTransactions(req.user._id, {
    q: req.query.q,
    type: req.query.type,
    accountId: req.query.accountId,
    categoryId: req.query.categoryId,
    personId: req.query.personId,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    financialYear: req.query.financialYear,
    tagId: req.query.tagId,
    amount: req.query.amount,
    sort: req.query.sort,
    page,
    limit,
  });
  res.json({ success: true, ...out });
}
