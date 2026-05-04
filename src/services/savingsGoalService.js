import mongoose from 'mongoose';
import { SavingsGoal } from '../models/SavingsGoal.js';
import { Account } from '../models/Account.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import { AppError } from '../utils/AppError.js';
import { createNotification } from './notificationService.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export async function listGoals(userId) {
  return SavingsGoal.find({ userId: toOid(userId) })
    .populate('linkedAccountId', 'name')
    .sort({ status: 1, updatedAt: -1 })
    .lean();
}

export async function createGoal(userId, body) {
  const doc = {
    userId: toOid(userId),
    name: String(body.name).trim(),
    targetAmount: Number(body.targetAmount),
    currentAmount: body.currentAmount != null ? Number(body.currentAmount) : 0,
    deadline: body.deadline ? new Date(body.deadline) : null,
    linkedAccountId: body.linkedAccountId || null,
    status: body.status || 'active',
  };
  if (doc.linkedAccountId) {
    const a = await Account.findOne({
      _id: doc.linkedAccountId,
      userId: toOid(userId),
      isActive: true,
    });
    if (!a) throw new AppError('Linked account not found', 400);
  }
  return SavingsGoal.create(doc);
}

export async function getGoal(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const g = await SavingsGoal.findOne({ _id: id, userId: toOid(userId) }).populate(
    'linkedAccountId',
    'name'
  );
  if (!g) throw new AppError('Goal not found', 404);
  return g;
}

export async function updateGoal(userId, id, body) {
  const g = await getGoal(userId, id);
  if (body.name != null) g.name = String(body.name).trim();
  if (body.targetAmount != null) g.targetAmount = Number(body.targetAmount);
  if (body.currentAmount != null) g.currentAmount = Number(body.currentAmount);
  if (body.deadline !== undefined)
    g.deadline = body.deadline ? new Date(body.deadline) : null;
  if (body.linkedAccountId !== undefined) g.linkedAccountId = body.linkedAccountId || null;
  if (body.status != null) g.status = body.status;
  await g.save();
  return g;
}

export async function deleteGoal(userId, id) {
  const g = await getGoal(userId, id);
  await g.deleteOne();
}

export async function addSaving(userId, id, amount) {
  const g = await getGoal(userId, id);
  if (g.status !== 'active') throw new AppError('Goal is not active', 400);
  const add = Number(amount);
  if (!Number.isFinite(add) || add <= 0)
    throw new AppError('Amount must be greater than 0', 400);
  g.currentAmount = Math.min(g.targetAmount, g.currentAmount + add);
  await g.save();
  if (g.status === 'completed') {
    void createNotification({
      userId: toOid(userId),
      type: 'goal_completed',
      title: 'Savings goal completed',
      message: `Goal "${g.name}" target reached.`,
      relatedEntityType: 'savings_goal',
      relatedEntityId: String(g._id),
      priority: 'high',
      dedupeKey: `goal_completed:${String(g._id)}`,
    });
  }
  return getGoal(userId, id);
}

/** Average net savings per month over last `months` of active transactions (income - expense). */
export async function averageMonthlyNetSavings(userId, months = 3) {
  const uid = toOid(userId);
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - months);
  const rows = await Transaction.find({
    userId: uid,
    ...ACTIVE_TRANSACTION_MATCH,
    date: { $gte: since },
  })
    .select('type amount dateKey')
    .lean();
  let net = 0;
  for (const r of rows) {
    if (r.type === 'income') net += r.amount;
    else if (r.type === 'expense') net -= r.amount;
  }
  return months > 0 ? net / months : 0;
}

export function goalReportExtras(goalDoc, avgMonthly) {
  const target = goalDoc.targetAmount;
  const current = goalDoc.currentAmount;
  const remaining = Math.max(0, target - current);
  const progressPercent = target > 0 ? (current / target) * 100 : 0;
  let expectedCompletionEstimate = null;
  if (avgMonthly > 0 && remaining > 0) {
    const monthsNeeded = remaining / avgMonthly;
    const d = new Date();
    d.setMonth(d.getMonth() + Math.ceil(monthsNeeded));
    expectedCompletionEstimate = d.toISOString().slice(0, 10);
  }
  return {
    progressPercent: Math.round(progressPercent * 100) / 100,
    remainingAmount: remaining,
    expectedCompletionEstimate,
  };
}

export async function goalsReport(userId) {
  const goals = await listGoals(userId);
  const avg = await averageMonthlyNetSavings(userId, 3);
  return {
    goals: goals.map((g) => ({
      ...g,
      ...goalReportExtras(g, avg),
    })),
    averageMonthlyNetSavings: Math.round(avg * 100) / 100,
  };
}
