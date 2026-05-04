import cron from 'node-cron';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { getISTDateKey } from '../utils/financialYear.js';
import { shiftISTDateKey } from '../utils/dateUtils.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import { Loan } from '../models/Loan.js';
import { createNotification } from '../services/notificationService.js';
import { RecurringTransaction } from '../models/RecurringTransaction.js';

async function noEntryTodaySweep() {
  const today = getISTDateKey();
  const since = shiftISTDateKey(today, -90);
  const userIds = await Transaction.distinct('userId', {
    ...ACTIVE_TRANSACTION_MATCH,
    dateKey: { $gte: since, $lte: today },
  });
  for (const uid of userIds) {
    const n = await Transaction.countDocuments({
      userId: uid,
      dateKey: today,
      ...ACTIVE_TRANSACTION_MATCH,
    });
    if (n === 0) {
      await createNotification({
        userId: uid,
        type: 'no_entry_today',
        title: 'No entries today',
        message: 'You have not recorded any transaction for today yet.',
        priority: 'low',
        dedupeKey: `no_entry:${String(uid)}:${today}`,
      });
    }
  }
}

async function loanDueSweep() {
  const now = new Date();
  const in3 = new Date(now);
  in3.setDate(in3.getDate() + 3);
  const loans = await Loan.find({
    status: { $in: ['pending', 'partially_paid', 'overdue'] },
    dueDate: { $gte: now, $lte: in3 },
  }).lean();
  for (const l of loans) {
    const d = l.dueDate ? new Date(l.dueDate).toISOString().slice(0, 10) : '';
    await createNotification({
      userId: l.userId,
      type: 'loan_due',
      title: 'Loan due soon',
      message: `A loan has due date on ${d}.`,
      relatedEntityType: 'loan',
      relatedEntityId: String(l._id),
      priority: 'medium',
      dedupeKey: `loan_due:${String(l._id)}:${d}`,
    });
  }
}

async function recurringDueSoonSweep() {
  const today = getISTDateKey();
  const rows = await RecurringTransaction.find({
    isActive: true,
    nextRunDate: { $exists: true, $ne: null },
  }).lean();
  for (const r of rows) {
    const nk = r.nextRunDate
      ? getISTDateKey(new Date(r.nextRunDate))
      : '';
    if (nk && nk <= today) {
      await createNotification({
        userId: r.userId,
        type: 'recurring_due',
        title: 'Recurring entry due',
        message: 'A recurring template is due to run.',
        relatedEntityType: 'recurring',
        relatedEntityId: String(r._id),
        priority: 'medium',
        dedupeKey: `recurring_due:${String(r._id)}:${nk}`,
      });
    }
  }
}

export function scheduleNotificationCron() {
  cron.schedule('18 8 * * *', () => {
    void (async () => {
      try {
        if (mongoose.connection.readyState !== 1) return;
        await noEntryTodaySweep();
        await loanDueSweep();
        await recurringDueSoonSweep();
      } catch (err) {
        logger.error('notification daily job failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  });
}
