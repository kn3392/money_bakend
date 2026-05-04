import mongoose from 'mongoose';
import * as budgetService from '../services/budgetService.js';
import { recordDetailedAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

function snapshotBudget(b) {
  if (!b) return null;
  const o = typeof b.toObject === 'function' ? b.toObject() : b;
  return {
    categoryId: String(o.categoryId?._id ?? o.categoryId),
    month: o.month,
    year: o.year,
    budgetAmount: o.budgetAmount,
    alertAtPercent: o.alertAtPercent,
    isActive: o.isActive,
  };
}

export async function listBudgets(req, res) {
  const rows = await budgetService.listBudgets(req.user._id);
  res.json({ success: true, budgets: rows });
}

export async function getBudgetReport(req, res) {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!(month >= 1 && month <= 12) || !(year >= 2000))
    throw new AppError('Valid month and year required', 400);
  const report = await budgetService.budgetsReport(req.user._id, month, year);
  res.json({ success: true, ...report });
}

export async function getBudget(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const b = await budgetService.getBudget(req.user._id, req.params.id);
  res.json({ success: true, budget: b });
}

export async function createBudget(req, res) {
  const doc = await budgetService.createBudget(req.user._id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'budget',
    entityId: String(doc._id),
    oldValue: null,
    newValue: snapshotBudget(doc),
    req,
  });
  res.status(201).json({ success: true, budget: doc });
}

export async function updateBudget(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await budgetService.getBudget(req.user._id, req.params.id);
  const prevSnap = snapshotBudget(prev);
  const doc = await budgetService.updateBudget(req.user._id, req.params.id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'budget',
    entityId: String(doc._id),
    oldValue: prevSnap,
    newValue: snapshotBudget(doc),
    req,
  });
  res.json({ success: true, budget: doc });
}

export async function removeBudget(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prev = await budgetService.getBudget(req.user._id, req.params.id);
  await budgetService.deleteBudget(req.user._id, req.params.id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'budget',
    entityId: req.params.id,
    oldValue: snapshotBudget(prev),
    newValue: null,
    req,
  });
  res.json({ success: true, message: 'Budget deleted' });
}
