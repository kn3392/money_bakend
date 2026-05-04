import mongoose from 'mongoose';
import * as splitService from '../services/splitExpenseService.js';
import { recordDetailedAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

function snap(s) {
  if (!s) return null;
  const o = typeof s.toObject === 'function' ? s.toObject() : s;
  return {
    title: o.title,
    totalAmount: o.totalAmount,
    splitType: o.splitType,
    status: o.status,
    participantsCount: o.participants?.length,
  };
}

export async function listSplits(req, res) {
  const splits = await splitService.listSplits(req.user._id);
  res.json({ success: true, splits });
}

export async function splitsReport(req, res) {
  const report = await splitService.splitsReport(req.user._id);
  res.json({ success: true, ...report });
}

export async function getSplit(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const s = await splitService.getSplit(req.user._id, req.params.id);
  res.json({ success: true, split: s });
}

export async function createSplit(req, res) {
  const doc = await splitService.createSplit(req.user._id, req.body);
  const full = await splitService.getSplit(req.user._id, doc._id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'split_expense',
    entityId: String(doc._id),
    oldValue: null,
    newValue: snap(full),
    req,
  });
  res.status(201).json({ success: true, split: full });
}

export async function updateSplit(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await splitService.getSplit(req.user._id, req.params.id);
  const doc = await splitService.updateSplit(req.user._id, req.params.id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'split_expense',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    req,
  });
  res.json({ success: true, split: doc });
}

export async function removeSplit(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await splitService.getSplit(req.user._id, req.params.id);
  await splitService.deleteSplit(req.user._id, req.params.id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'split_expense',
    entityId: req.params.id,
    oldValue: snap(prev),
    newValue: null,
    req,
  });
  res.json({ success: true, message: 'Split cancelled' });
}

export async function settleParticipant(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await splitService.getSplit(req.user._id, req.params.id);
  const doc = await splitService.settleParticipant(
    req.user._id,
    req.params.id,
    req.body.participantId,
    req.body.amount
  );
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'split_expense',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    meta: { settleParticipant: req.body.participantId, amount: Number(req.body.amount) },
    req,
  });
  res.json({ success: true, split: doc });
}
