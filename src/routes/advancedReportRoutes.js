import { Router } from 'express';
import { query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/advancedReportController.js';

const router = Router();
router.use(protect);

const rangeRules = [
  query('dateFrom').matches(/^\d{4}-\d{2}-\d{2}$/),
  query('dateTo').matches(/^\d{4}-\d{2}-\d{2}$/),
];

router.get(
  '/budget-vs-actual',
  validate([
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000 }),
  ]),
  asyncHandler(c.budgetVsActual)
);
router.get('/savings-goals', asyncHandler(c.savingsGoals));
router.get('/cash-flow', validate(rangeRules), asyncHandler(c.cashFlow));
router.get('/daily-trend', validate(rangeRules), asyncHandler(c.dailyTrend));
router.get('/person-settlement', asyncHandler(c.personSettlement));
router.get('/account-movement', validate(rangeRules), asyncHandler(c.accountMovement));
router.get('/category-comparison', asyncHandler(c.categoryComparison));
router.get(
  '/financial-year-tax-summary',
  validate([query('financialYear').notEmpty().isString()]),
  asyncHandler(c.financialYearTaxSummary)
);
router.get(
  '/top-expenses',
  validate([
    ...rangeRules,
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ]),
  asyncHandler(c.topExpenses)
);
router.get('/no-entry-days', validate(rangeRules), asyncHandler(c.noEntryDays));

export default router;
