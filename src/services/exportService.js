import mongoose from 'mongoose';
import {
  Transaction,
  ACTIVE_TRANSACTION_MATCH,
} from '../models/Transaction.js';
import { DayLedger } from '../models/DayLedger.js';
import { normalizeToISTDateKey } from '../utils/dateUtils.js';
import {
  calendarMonthYearToRange,
  parseFinancialYearParam,
  getFinancialYearLabelForDate,
  dateKeyToUtcNoon,
} from '../utils/financialYear.js';
import { transactionsToExcelBuffer } from '../utils/excelGenerator.js';
import { streamLedgerPdf } from '../utils/pdfGenerator.js';
import { exportBackupSnapshot, restoreFromBackup } from './backupService.js';
import {
  netIncomeMinusExpenseBeforeDate,
  sumTransactionsForISTDay,
} from './ledgerService.js';

function toOid(uid) {
  return typeof uid === 'string' ? new mongoose.Types.ObjectId(uid) : uid;
}

const populateExport = [
  { path: 'accountId', select: 'name type' },
  { path: 'categoryId', select: 'name type' },
  { path: 'fromAccountId', select: 'name type' },
  { path: 'toAccountId', select: 'name type' },
  { path: 'personId', select: 'name' },
];

async function transactionsInRange(uidStr, startKey, endKey) {
  return Transaction.find({
    userId: toOid(uidStr),
    dateKey: { $gte: startKey, $lte: endKey },
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .populate(populateExport)
    .sort({ dateKey: 1, createdAt: 1 })
    .lean();
}

function summarizeRow(t) {
  let details =
    (t.accountId?.name ?? '') ||
    `${t.fromAccountId?.name ?? ''}→${t.toAccountId?.name ?? ''}`;
  if (t.categoryId?.name) details += ` · ${t.categoryId.name}`;
  if (t.personId?.name) details += ` · ${t.personId.name}`;
  return {
    dateKey: t.dateKey,
    type: t.type,
    amount: t.amount,
    details,
    note: t.note,
  };
}

export async function pipeDailyLedgerPdf(res, uid, dateInput) {
  const dateKey = normalizeToISTDateKey(dateInput);
  const day = await DayLedger.findOne({
    userId: toOid(uid),
    dateKey,
  }).lean();
  const txs = await transactionsInRange(uid, dateKey, dateKey);
  const sums = await sumTransactionsForISTDay(toOid(uid), dateKey);
  const opening =
    day?.openingBalance ??
    (await netIncomeMinusExpenseBeforeDate(toOid(uid), dateKey));

  streamLedgerPdf(res, {
    title: `SmartKhata Daily Ledger — ${dateKey}`,
    subtitle: `Financial Year ${getFinancialYearLabelForDate(dateKeyToUtcNoon(dateKey))}`,
    openingBalance: opening,
    closingBalance:
      day?.closingBalance ?? opening + sums.income - sums.expense,
    totalIncome: day?.totalIncome ?? sums.income,
    totalExpense: day?.totalExpense ?? sums.expense,
    rows: txs.map(summarizeRow),
  });
}

export async function pipeMonthlyLedgerPdf(res, uid, month, year) {
  const { startKey, endKey } = calendarMonthYearToRange(month, year);
  const txs = await transactionsInRange(uid, startKey, endKey);
  const uidOid = toOid(uid);
  const opening = await netIncomeMinusExpenseBeforeDate(uidOid, startKey);
  let ti = 0;
  let te = 0;
  for (const t of txs) {
    if (t.type === 'income') ti += t.amount;
    else if (t.type === 'expense') te += t.amount;
  }
  const closing = opening + ti - te;
  streamLedgerPdf(res, {
    title: `SmartKhata Monthly Report — ${String(month).padStart(2, '0')}/${year}`,
    subtitle: `${startKey} to ${endKey}`,
    openingBalance: opening,
    closingBalance: closing,
    totalIncome: ti,
    totalExpense: te,
    rows: txs.map(summarizeRow),
  });
}

export async function pipeFinancialYearPdf(res, uid, fyParam) {
  const { startKey, endKey, label } = parseFinancialYearParam(fyParam);
  const txs = await transactionsInRange(uid, startKey, endKey);
  const uidOid = toOid(uid);
  const opening = await netIncomeMinusExpenseBeforeDate(uidOid, startKey);
  let ti = 0;
  let te = 0;
  for (const t of txs) {
    if (t.type === 'income') ti += t.amount;
    else if (t.type === 'expense') te += t.amount;
  }
  const closing = opening + ti - te;
  streamLedgerPdf(res, {
    title: `SmartKhata FY ${label}`,
    subtitle: `${startKey} to ${endKey}`,
    openingBalance: opening,
    closingBalance: closing,
    totalIncome: ti,
    totalExpense: te,
    rows: txs.map(summarizeRow),
  });
}

export async function sendTransactionsExcel(res, uid) {
  const txs = await Transaction.find({
    userId: toOid(uid),
    ...ACTIVE_TRANSACTION_MATCH,
  })
    .populate(populateExport)
    .sort({ dateKey: 1, createdAt: 1 })
    .lean();
  const buf = await transactionsToExcelBuffer(txs);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="smartkhata-transactions.xlsx"`
  );
  res.send(Buffer.from(buf));
}

export async function jsonBackupPayload(uid) {
  return exportBackupSnapshot(uid);
}

export async function restoreJsonBackup(uid, json, opts) {
  return restoreFromBackup(uid, json, opts);
}

export { parseFinancialYearParam };
