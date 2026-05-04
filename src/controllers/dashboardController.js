import { syncAccountBalancesAndGetSummary } from '../services/accountBalanceService.js';

/**
 * GET /api/v1/dashboard/summary
 * Portfolio cash flow + per-account breakdown (balances synced from transactions).
 */
export async function getDashboardSummary(req, res) {
  const data = await syncAccountBalancesAndGetSummary(req.user._id.toString());
  res.json({ success: true, ...data });
}
