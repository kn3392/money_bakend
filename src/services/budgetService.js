import mongoose from 'mongoose';
import { Budget } from '../models/Budget.js';
import { Category } from '../models/Category.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import { AppError } from '../utils/AppError.js';
import { calendarMonthYearToRange } from '../utils/financialYear.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export async function sumExpenseForCategoryMonth(userId, categoryId, month, year) {
  const { startKey, endKey } = calendarMonthYearToRange(month, year);
  const uid = toOid(userId);
  const cid = toOid(categoryId);
  const [row] = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        type: 'expense',
        categoryId: cid,
        dateKey: { $gte: startKey, $lte: endKey },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    { $group: { _id: null, s: { $sum: '$amount' } } },
  ]);
  return row?.s ?? 0;
}

export function budgetAlertStatus(actual, budgetAmount, alertAtPercent) {
  if (budgetAmount <= 0) return 'safe';
  const pct = (actual / budgetAmount) * 100;
  if (pct >= 100) return 'crossed';
  if (pct >= (alertAtPercent ?? 80)) return 'warning';
  return 'safe';
}

export async function budgetReportRow(userId, b) {
  const actual = await sumExpenseForCategoryMonth(
    userId,
    b.categoryId,
    b.month,
    b.year
  );
  const budgetAmount = b.budgetAmount;
  const remainingBudget = budgetAmount - actual;
  const usagePercent = budgetAmount > 0 ? (actual / budgetAmount) * 100 : 0;
  return {
    budget: b,
    budgetAmount,
    actualExpense: actual,
    remainingBudget,
    usagePercent: Math.round(usagePercent * 100) / 100,
    alertStatus: budgetAlertStatus(actual, budgetAmount, b.alertAtPercent),
  };
}

export async function listBudgets(userId) {
  return Budget.find({ userId: toOid(userId), isActive: true })
    .populate('categoryId', 'name type')
    .sort({ year: -1, month: -1 })
    .lean();
}

export async function createBudget(userId, body) {
  const cat = await Category.findOne({
    _id: body.categoryId,
    userId: toOid(userId),
    type: 'expense',
    isActive: true,
  });
  if (!cat) throw new AppError('Expense category required for budget', 400);
  try {
    return await Budget.create({
      userId: toOid(userId),
      categoryId: body.categoryId,
      month: Number(body.month),
      year: Number(body.year),
      budgetAmount: Number(body.budgetAmount),
      alertAtPercent: body.alertAtPercent != null ? Number(body.alertAtPercent) : 80,
      isActive: body.isActive !== false,
    });
  } catch (e) {
    if (e?.code === 11000)
      throw new AppError('Budget already exists for this category and month', 400);
    throw e;
  }
}

export async function getBudget(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const b = await Budget.findOne({ _id: id, userId: toOid(userId) }).populate(
    'categoryId',
    'name type'
  );
  if (!b) throw new AppError('Budget not found', 404);
  return b;
}

export async function updateBudget(userId, id, body) {
  const b = await getBudget(userId, id);
  if (body.budgetAmount != null) b.budgetAmount = Number(body.budgetAmount);
  if (body.alertAtPercent != null) b.alertAtPercent = Number(body.alertAtPercent);
  if (body.isActive != null) b.isActive = Boolean(body.isActive);
  await b.save();
  return b;
}

export async function deleteBudget(userId, id) {
  const b = await getBudget(userId, id);
  await b.deleteOne();
}

export async function budgetsReport(userId, month, year) {
  const mo = Number(month);
  const yr = Number(year);
  const rows = await Budget.find({
    userId: toOid(userId),
    month: mo,
    year: yr,
    isActive: true,
  })
    .populate('categoryId', 'name type')
    .lean();
  const lines = await Promise.all(rows.map((r) => budgetReportRow(userId, r)));
  return { month: mo, year: yr, lines };
}
