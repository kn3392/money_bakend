import mongoose from 'mongoose';
import * as loanService from '../services/loanService.js';
import { recordDetailedAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

function snap(l) {
  if (!l) return null;
  const o = typeof l.toObject === 'function' ? l.toObject() : l;
  return {
    type: o.type,
    principalAmount: o.principalAmount,
    paidAmount: o.paidAmount,
    status: o.status,
    personId: String(o.personId?._id ?? o.personId),
    dueDate: o.dueDate,
  };
}

export async function listLoans(req, res) {
  const loans = await loanService.listLoans(req.user._id);
  res.json({ success: true, loans });
}

export async function loansReport(req, res) {
  const report = await loanService.loansReport(req.user._id);
  res.json({ success: true, ...report });
}

export async function getLoan(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const l = await loanService.getLoan(req.user._id, req.params.id);
  res.json({ success: true, loan: l });
}

export async function createLoan(req, res) {
  const doc = await loanService.createLoan(req.user._id, req.body);
  const full = await loanService.getLoan(req.user._id, doc._id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'loan',
    entityId: String(doc._id),
    oldValue: null,
    newValue: snap(full),
    req,
  });
  res.status(201).json({ success: true, loan: full });
}

export async function updateLoan(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await loanService.getLoan(req.user._id, req.params.id);
  const doc = await loanService.updateLoan(req.user._id, req.params.id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'loan',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    req,
  });
  res.json({ success: true, loan: doc });
}

export async function removeLoan(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await loanService.getLoan(req.user._id, req.params.id);
  await loanService.deleteLoan(req.user._id, req.params.id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'loan',
    entityId: req.params.id,
    oldValue: snap(prev),
    newValue: null,
    req,
  });
  res.json({ success: true, message: 'Loan deleted' });
}

export async function postPayment(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await loanService.getLoan(req.user._id, req.params.id);
  const doc = await loanService.addLoanPayment(
    req.user._id,
    req.params.id,
    req.body.amount
  );
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'loan',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    meta: { payment: Number(req.body.amount) },
    req,
  });
  res.json({ success: true, loan: doc });
}
