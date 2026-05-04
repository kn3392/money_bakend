import mongoose from 'mongoose';
import * as goalService from '../services/savingsGoalService.js';
import { recordDetailedAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

function snap(g) {
  if (!g) return null;
  const o = typeof g.toObject === 'function' ? g.toObject() : g;
  return {
    name: o.name,
    targetAmount: o.targetAmount,
    currentAmount: o.currentAmount,
    status: o.status,
    deadline: o.deadline,
    linkedAccountId: o.linkedAccountId ? String(o.linkedAccountId) : null,
  };
}

export async function listGoals(req, res) {
  const goals = await goalService.listGoals(req.user._id);
  res.json({ success: true, goals });
}

export async function goalsReport(req, res) {
  const report = await goalService.goalsReport(req.user._id);
  res.json({ success: true, ...report });
}

export async function getGoal(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const g = await goalService.getGoal(req.user._id, req.params.id);
  res.json({ success: true, goal: g });
}

export async function createGoal(req, res) {
  const doc = await goalService.createGoal(req.user._id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'savings_goal',
    entityId: String(doc._id),
    oldValue: null,
    newValue: snap(doc),
    req,
  });
  res.status(201).json({ success: true, goal: doc });
}

export async function updateGoal(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await goalService.getGoal(req.user._id, req.params.id);
  const doc = await goalService.updateGoal(req.user._id, req.params.id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'savings_goal',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    req,
  });
  res.json({ success: true, goal: doc });
}

export async function removeGoal(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await goalService.getGoal(req.user._id, req.params.id);
  await goalService.deleteGoal(req.user._id, req.params.id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'savings_goal',
    entityId: req.params.id,
    oldValue: snap(prev),
    newValue: null,
    req,
  });
  res.json({ success: true, message: 'Goal deleted' });
}

export async function addSaving(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await goalService.getGoal(req.user._id, req.params.id);
  const doc = await goalService.addSaving(req.user._id, req.params.id, req.body.amount);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'savings_goal',
    entityId: String(doc._id),
    oldValue: snap(prev),
    newValue: snap(doc),
    meta: { addSaving: Number(req.body.amount) },
    req,
  });
  res.json({ success: true, goal: doc });
}
