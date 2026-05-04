import mongoose from 'mongoose';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import { PersonLedger } from '../models/PersonLedger.js';
import { AppError } from '../utils/AppError.js';
import {
  calendarMonthYearToRange,
  parseFinancialYearParam,
  getISTDateKey,
} from '../utils/financialYear.js';
import { getOpeningBalance } from './ledgerService.js';
import { budgetsReport } from './budgetService.js';
import { goalsReport } from './savingsGoalService.js';
import { compareDateKeys, shiftISTDateKey } from '../utils/dateUtils.js';

function toOid(userId) {
  return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
}

function parseMonthYear(now = new Date()) {
  const key = getISTDateKey(now);
  const [y, m] = key.split('-').map(Number);
  return { month: m, year: y };
}

/** @param {string} startKey @param {string} endKey max ~400 days */
function enumerateDateKeys(startKey, endKey) {
  if (compareDateKeys(startKey, endKey) > 0) return [];
  const out = [];
  let cur = startKey;
  let guard = 0;
  while (compareDateKeys(cur, endKey) <= 0 && guard++ < 450) {
    out.push(cur);
    cur = shiftISTDateKey(cur, 1);
  }
  return out;
}

export async function reportBudgetVsActual(userId, month, year) {
  const mo = month != null ? Number(month) : parseMonthYear().month;
  const yr = year != null ? Number(year) : parseMonthYear().year;
  return budgetsReport(userId, mo, yr);
}

export async function reportSavingsGoals(userId) {
  return goalsReport(userId);
}

export async function reportCashFlow(userId, dateFrom, dateTo) {
  const uid = toOid(userId);
  const openingBalance = await getOpeningBalance(userId, dateFrom);
  const [inc, exp] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'income',
          dateKey: { $gte: dateFrom, $lte: dateTo },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'expense',
          dateKey: { $gte: dateFrom, $lte: dateTo },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: null, s: { $sum: '$amount' } } },
    ]),
  ]);
  const inflow = inc[0]?.s ?? 0;
  const outflow = exp[0]?.s ?? 0;
  const closingBalance = openingBalance + inflow - outflow;
  return {
    dateFrom,
    dateTo,
    openingBalance,
    inflow,
    outflow,
    closingBalance,
  };
}

export async function reportDailyTrend(userId, dateFrom, dateTo) {
  const uid = toOid(userId);
  const rows = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        dateKey: { $gte: dateFrom, $lte: dateTo },
        type: { $in: ['income', 'expense'] },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    {
      $group: {
        _id: '$dateKey',
        income: {
          $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
        },
        expense: {
          $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    days: rows.map((r) => ({
      dateKey: r._id,
      income: r.income,
      expense: r.expense,
      netSavings: r.income - r.expense,
    })),
  };
}

export async function reportPersonSettlement(userId) {
  const rows = await PersonLedger.find({ userId: toOid(userId), isActive: true })
    .sort({ name: 1 })
    .lean();
  return {
    persons: rows.map((p) => ({
      id: p._id,
      name: p.name,
      totalGiven: p.totalGiven,
      totalTaken: p.totalTaken,
      balance: p.balance,
      note:
        p.balance < 0
          ? 'Negative: person owes you (net given)'
          : p.balance > 0
            ? 'Positive: you owe person less / they repaid more'
            : 'Settled',
    })),
  };
}

export async function reportAccountMovement(userId, dateFrom, dateTo) {
  const uid = toOid(userId);
  const income = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        type: 'income',
        dateKey: { $gte: dateFrom, $lte: dateTo },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    { $group: { _id: '$accountId', total: { $sum: '$amount' } } },
  ]);
  const expense = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        type: 'expense',
        dateKey: { $gte: dateFrom, $lte: dateTo },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    { $group: { _id: '$accountId', total: { $sum: '$amount' } } },
  ]);
  const tOut = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        type: 'transfer',
        dateKey: { $gte: dateFrom, $lte: dateTo },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    { $group: { _id: '$fromAccountId', total: { $sum: '$amount' } } },
  ]);
  const tIn = await Transaction.aggregate([
    {
      $match: {
        userId: uid,
        type: 'transfer',
        dateKey: { $gte: dateFrom, $lte: dateTo },
        ...ACTIVE_TRANSACTION_MATCH,
      },
    },
    { $group: { _id: '$toAccountId', total: { $sum: '$amount' } } },
  ]);
  const map = {};
  function add(id, field, val) {
    if (!id) return;
    const k = String(id);
    if (!map[k]) {
      map[k] = {
        accountId: k,
        incomeIn: 0,
        expenseOut: 0,
        transferIn: 0,
        transferOut: 0,
      };
    }
    map[k][field] += val;
  }
  for (const r of income) add(r._id, 'incomeIn', r.total);
  for (const r of expense) add(r._id, 'expenseOut', r.total);
  for (const r of tIn) add(r._id, 'transferIn', r.total);
  for (const r of tOut) add(r._id, 'transferOut', r.total);
  const accounts = Object.values(map).map((a) => ({
    ...a,
    netMovement: a.incomeIn - a.expenseOut + a.transferIn - a.transferOut,
  }));
  return { dateFrom, dateTo, accounts };
}

export async function reportCategoryComparison(userId) {
  const { month, year } = parseMonthYear();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const cur = calendarMonthYearToRange(month, year);
  const prev = calendarMonthYearToRange(prevMonth, prevYear);
  const uid = toOid(userId);

  async function bucket(range) {
    return Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'expense',
          dateKey: { $gte: range.startKey, $lte: range.endKey },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
    ]);
  }
  const [curB, prevB] = await Promise.all([bucket(cur), bucket(prev)]);
  const prevMap = Object.fromEntries(
    prevB.map((x) => [String(x._id), x.total])
  );
  const lines = [];
  for (const c of curB) {
    const id = String(c._id);
    const current = c.total;
    const previous = prevMap[id] ?? 0;
    let pct = 0;
    if (previous > 0) pct = ((current - previous) / previous) * 100;
    else if (current > 0) pct = 100;
    lines.push({
      categoryId: id,
      currentMonth: current,
      previousMonth: previous,
      percentageChange: Math.round(pct * 100) / 100,
    });
  }
  return {
    current: { month, year },
    previous: { month: prevMonth, year: prevYear },
    lines,
  };
}

export async function reportFinancialYearTaxSummary(userId, fyParam) {
  const { startKey, endKey, label } = parseFinancialYearParam(fyParam);
  const uid = toOid(userId);
  const [income, expense] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'income',
          dateKey: { $gte: startKey, $lte: endKey },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId: uid,
          type: 'expense',
          dateKey: { $gte: startKey, $lte: endKey },
          ...ACTIVE_TRANSACTION_MATCH,
        },
      },
      { $group: { _id: '$categoryId', total: { $sum: '$amount' } } },
    ]),
  ]);
  return {
    financialYear: label,
    startKey,
    endKey,
    incomeByCategory: income,
    expenseByCategory: expense,
  };
}

export async function reportTopExpenses(userId, dateFrom, dateTo, limit = 10) {
  const uid = toOid(userId);
  const rows = await Transaction.find({
    userId: uid,
    type: 'expense',
    dateKey: { $gte: dateFrom, $lte: dateTo },
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .sort({ amount: -1 })
    .limit(Math.min(50, Math.max(1, limit)))
    .populate('categoryId', 'name')
    .populate('accountId', 'name')
    .lean();
  return { items: rows };
}

export async function reportNoEntryDays(userId, dateFrom, dateTo) {
  const keys = enumerateDateKeys(dateFrom, dateTo);
  if (keys.length > 400)
    throw new AppError('Range too large; max 400 days', 400);
  const uid = toOid(userId);
  const withTx = await Transaction.distinct('dateKey', {
    userId: uid,
    dateKey: { $gte: dateFrom, $lte: dateTo },
    ...ACTIVE_TRANSACTION_MATCH,
  });
  const set = new Set(withTx);
  const noEntryDays = keys.filter((k) => !set.has(k));
  return { dateFrom, dateTo, noEntryDays, count: noEntryDays.length };
}
