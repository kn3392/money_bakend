import mongoose from 'mongoose';
import { Budget } from '../models/Budget.js';
import {
  sumExpenseForCategoryMonth,
  budgetAlertStatus,
} from './budgetService.js';
import { createNotification } from './notificationService.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/**
 * Fire-and-forget: budget warning / crossed notifications after expense changes.
 */
export async function notifyBudgetsForExpense(userId, categoryId, dateKey) {
  if (!categoryId || !dateKey) return;
  const [y, m] = dateKey.split('-').map(Number);
  try {
    const budgets = await Budget.find({
      userId: toOid(userId),
      categoryId: toOid(categoryId),
      month: m,
      year: y,
      isActive: true,
    }).lean();
    for (const b of budgets) {
      const actual = await sumExpenseForCategoryMonth(
        userId,
        categoryId,
        m,
        y
      );
      const status = budgetAlertStatus(
        actual,
        b.budgetAmount,
        b.alertAtPercent
      );
      const monthKey = `${y}-${String(m).padStart(2, '0')}`;
      const bid = String(b._id);
      if (status === 'crossed') {
        await createNotification({
          userId: toOid(userId),
          type: 'budget_crossed',
          title: 'Budget exceeded',
          message: `Expense has crossed the budget for this category (${monthKey}).`,
          relatedEntityType: 'budget',
          relatedEntityId: bid,
          priority: 'high',
          dedupeKey: `budget_crossed:${bid}:${monthKey}`,
        });
      } else if (status === 'warning') {
        await createNotification({
          userId: toOid(userId),
          type: 'budget_warning',
          title: 'Budget warning',
          message: `You have used about ${b.alertAtPercent ?? 80}% or more of the budget for this category (${monthKey}).`,
          relatedEntityType: 'budget',
          relatedEntityId: bid,
          priority: 'medium',
          dedupeKey: `budget_warning:${bid}:${monthKey}`,
        });
      }
    }
  } catch {
    //
  }
}
