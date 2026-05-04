import { AppError } from '../utils/AppError.js';
import { recordAudit, recordDetailedAudit } from '../services/auditService.js';
import {
  pipeDailyLedgerPdf,
  pipeMonthlyLedgerPdf,
  pipeFinancialYearPdf,
  sendTransactionsExcel,
  jsonBackupPayload,
  restoreJsonBackup,
} from '../services/exportService.js';

export async function exportDaily(req, res) {
  const type = (req.query.type || 'pdf').toLowerCase();
  if (type !== 'pdf')
    throw new AppError('Use type=pdf for daily export', 400);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'export',
    entityType: 'export',
    entityId: 'daily_ledger_pdf',
    newValue: { date: req.query.date ?? '' },
    req,
  });
  await pipeDailyLedgerPdf(res, req.user._id, req.query.date);
}

export async function exportMonthly(req, res) {
  const type = (req.query.type || 'pdf').toLowerCase();
  if (type !== 'pdf')
    throw new AppError('Use type=pdf for monthly export', 400);
  const mo = Number(req.query.month);
  const yr = Number(req.query.year);
  if (!(mo >= 1 && mo <= 12) || !(yr >= 1900))
    throw new AppError('Valid month (1–12) and year are required', 400);
  await pipeMonthlyLedgerPdf(res, req.user._id, mo, yr);
}

export async function exportFinancialYear(req, res) {
  const type = (req.query.type || 'pdf').toLowerCase();
  if (type !== 'pdf')
    throw new AppError('Use type=pdf for financial year export', 400);
  const fy = req.query.financialYear;
  if (!fy) throw new AppError('financialYear query required (e.g. 2026-27)', 400);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'export',
    entityType: 'export',
    entityId: 'fy_ledger_pdf',
    newValue: { financialYear: fy },
    req,
  });
  await pipeFinancialYearPdf(res, req.user._id, fy);
}

export async function exportTransactions(req, res) {
  const type = (req.query.type || 'excel').toLowerCase();
  if (type !== 'excel')
    throw new AppError('Use type=excel for transactions export', 400);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'export',
    entityType: 'export',
    entityId: 'transactions_excel',
    newValue: {},
    req,
  });
  await sendTransactionsExcel(res, req.user._id);
}

export async function exportBackup(req, res) {
  const type = (req.query.type || 'json').toLowerCase();
  if (type !== 'json')
    throw new AppError('Use type=json for backup export', 400);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'export',
    entityType: 'export',
    entityId: 'json_backup',
    newValue: {},
    req,
  });
  const data = await jsonBackupPayload(req.user._id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="smartkhata-backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.send(Buffer.from(JSON.stringify(data, null, 2)));
}

export async function restoreBackup(req, res) {
  if (!req.file?.buffer)
    throw new AppError('JSON backup file missing', 400);
  const txt = req.file.buffer.toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch {
    throw new AppError('Backup file must be valid JSON', 400);
  }
  const confirm =
    req.body.confirmRestore === 'true' ||
    req.body.confirmRestore === true;
  const replace =
    req.body.replaceExisting === 'true' ||
    req.body.replaceExisting === true;

  const out = await restoreJsonBackup(req.user._id.toString(), parsed, {
    confirmRestore: Boolean(confirm),
    replaceExisting: Boolean(replace),
  });
  void recordAudit({
    userId: req.user._id,
    action: 'backup.restore',
    resource: 'backup',
    meta: { replaceExisting: Boolean(replace) },
    req,
  });
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'restore',
    entityType: 'backup',
    entityId: 'json',
    newValue: { replaceExisting: Boolean(replace), summary: out },
    req,
  });
  res.json({ success: true, ...out });
}
