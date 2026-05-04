import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';

function toOid(userId) {
  return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
}

/**
 * Per-account flows from active transactions only (excludes deleted/undone).
 * currentBalance = openingBalance + income - expense + transferIn - transferOut
 */
export async function getAccountFinancialRows(userId) {
  const uid = toOid(userId);
  const accounts = await Account.find({ userId: uid, isActive: true }).sort({ name: 1 });
  const ids = accounts.map((a) => a._id);
  if (!ids.length) {
    return {
      rows: [],
      cashFlow: {
        openingBalanceTotal: 0,
        totalIncome: 0,
        totalExpense: 0,
        netSavings: 0,
        closingBalanceTotal: 0,
      },
    };
  }

  const [income, expense, transferIn, transferOut, incAll, expAll] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'income',
          accountId: { $in: ids },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$accountId', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'expense',
          accountId: { $in: ids },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$accountId', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'transfer',
          toAccountId: { $in: ids },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$toAccountId', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'transfer',
          fromAccountId: { $in: ids },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$fromAccountId', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: { userId: uid, type: 'income', ...ACTIVE_TRANSACTION_MATCH },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: { userId: uid, type: 'expense', ...ACTIVE_TRANSACTION_MATCH },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
  ]);

  const mapIn = Object.fromEntries(income.map((r) => [r._id.toString(), r.total]));
  const mapEx = Object.fromEntries(expense.map((r) => [r._id.toString(), r.total]));
  const mapTi = Object.fromEntries(transferIn.map((r) => [r._id.toString(), r.total]));
  const mapTo = Object.fromEntries(transferOut.map((r) => [r._id.toString(), r.total]));

  const rows = accounts.map((a) => {
    const id = a._id.toString();
    const ob = Number(a.openingBalance ?? 0);
    const ti = mapIn[id] ?? 0;
    const te = mapEx[id] ?? 0;
    const tin = mapTi[id] ?? 0;
    const tout = mapTo[id] ?? 0;
    const computed = ob + ti - te + tin - tout;
    const netMovement = ti - te + tin - tout;
    return {
      id,
      name: a.name,
      type: a.type,
      description: a.description ?? '',
      isDefault: Boolean(a.isDefault),
      openingBalance: ob,
      currentBalance: Math.round(computed * 100) / 100,
      totalIncome: ti,
      totalExpense: te,
      totalTransferIn: tin,
      totalTransferOut: tout,
      netMovement: Math.round(netMovement * 100) / 100,
    };
  });

  const totalIncomeAll = incAll[0]?.s ?? 0;
  const totalExpenseAll = expAll[0]?.s ?? 0;
  const openingBalanceTotal = rows.reduce((s, r) => s + r.openingBalance, 0);
  const closingBalanceTotal = rows.reduce((s, r) => s + r.currentBalance, 0);

  const cashFlow = {
    openingBalanceTotal: Math.round(openingBalanceTotal * 100) / 100,
    totalIncome: totalIncomeAll,
    totalExpense: totalExpenseAll,
    netSavings: Math.round((totalIncomeAll - totalExpenseAll) * 100) / 100,
    closingBalanceTotal: Math.round(closingBalanceTotal * 100) / 100,
  };

  return { rows, cashFlow };
}

async function persistComputedBalances(userId, rows) {
  if (!rows.length) return;
  const uid = toOid(userId);
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(r.id), userId: uid },
      update: { $set: { currentBalance: r.currentBalance } },
    },
  }));
  await Account.bulkWrite(ops, { ordered: false });
}

/**
 * Recompute and persist currentBalance for all active accounts from posted transactions.
 */
export async function recalculateAccountBalances(userId) {
  const { rows } = await getAccountFinancialRows(userId);
  await persistComputedBalances(userId, rows);
}

/**
 * Sync DB balances and return dashboard / summary payload (authoritative figures).
 */
export async function syncAccountBalancesAndGetSummary(userId) {
  const { rows, cashFlow } = await getAccountFinancialRows(userId);
  await persistComputedBalances(userId, rows);
  const totalAvailableBalance = rows.reduce((s, r) => s + r.currentBalance, 0);
  const hasNegativeBalance = rows.some((r) => r.currentBalance < 0);
  return {
    totalAccounts: rows.length,
    totalAvailableBalance: Math.round(totalAvailableBalance * 100) / 100,
    summary: rows,
    cashFlow,
    hasNegativeBalance,
  };
}
