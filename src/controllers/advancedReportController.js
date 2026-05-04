import * as reportService from '../services/advancedReportService.js';
import { AppError } from '../utils/AppError.js';

function requireRange(q) {
  const dateFrom = q.dateFrom ? String(q.dateFrom) : '';
  const dateTo = q.dateTo ? String(q.dateTo) : '';
  if (!dateFrom || !dateTo)
    throw new AppError('dateFrom and dateTo (YYYY-MM-DD) are required', 400);
  if (dateFrom > dateTo)
    throw new AppError('dateFrom cannot be after dateTo', 400);
  return { dateFrom, dateTo };
}

export async function budgetVsActual(req, res) {
  const month = req.query.month != null ? Number(req.query.month) : undefined;
  const year = req.query.year != null ? Number(req.query.year) : undefined;
  const data = await reportService.reportBudgetVsActual(req.user._id, month, year);
  res.json({ success: true, data });
}

export async function savingsGoals(req, res) {
  const data = await reportService.reportSavingsGoals(req.user._id);
  res.json({ success: true, data });
}

export async function cashFlow(req, res) {
  const { dateFrom, dateTo } = requireRange(req.query);
  const data = await reportService.reportCashFlow(req.user._id, dateFrom, dateTo);
  res.json({ success: true, data });
}

export async function dailyTrend(req, res) {
  const { dateFrom, dateTo } = requireRange(req.query);
  const data = await reportService.reportDailyTrend(req.user._id, dateFrom, dateTo);
  res.json({ success: true, data });
}

export async function personSettlement(req, res) {
  const data = await reportService.reportPersonSettlement(req.user._id);
  res.json({ success: true, data });
}

export async function accountMovement(req, res) {
  const { dateFrom, dateTo } = requireRange(req.query);
  const data = await reportService.reportAccountMovement(req.user._id, dateFrom, dateTo);
  res.json({ success: true, data });
}

export async function categoryComparison(req, res) {
  const data = await reportService.reportCategoryComparison(req.user._id);
  res.json({ success: true, data });
}

export async function financialYearTaxSummary(req, res) {
  const fy = req.query.financialYear;
  if (!fy) throw new AppError('financialYear query required', 400);
  const data = await reportService.reportFinancialYearTaxSummary(req.user._id, fy);
  res.json({ success: true, data });
}

export async function topExpenses(req, res) {
  const { dateFrom, dateTo } = requireRange(req.query);
  const limit = req.query.limit != null ? Number(req.query.limit) : 10;
  const data = await reportService.reportTopExpenses(req.user._id, dateFrom, dateTo, limit);
  res.json({ success: true, data });
}

export async function noEntryDays(req, res) {
  const { dateFrom, dateTo } = requireRange(req.query);
  const data = await reportService.reportNoEntryDays(req.user._id, dateFrom, dateTo);
  res.json({ success: true, data });
}
