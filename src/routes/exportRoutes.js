import { Router } from 'express';
import { query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { restoreUpload } from '../middleware/uploadMiddleware.js';
import {
  exportDaily,
  exportMonthly,
  exportFinancialYear,
  exportTransactions,
  exportBackup,
  restoreBackup,
} from '../controllers/exportController.js';

const router = Router();
router.use(protect);

router.get(
  '/daily',
  validate([
    query('date')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('date must be YYYY-MM-DD'),
    query('type').optional().isIn(['pdf']),
  ]),
  asyncHandler(exportDaily)
);

router.get(
  '/monthly',
  validate([
    query('month').isInt({ min: 1, max: 12 }),
    query('year').isInt({ min: 1900, max: 2999 }),
    query('type').optional().isIn(['pdf']),
  ]),
  asyncHandler(exportMonthly)
);

router.get(
  '/financial-year',
  validate([
    query('financialYear').trim().notEmpty().isLength({ max: 32 }),
    query('type').optional().isIn(['pdf']),
  ]),
  asyncHandler(exportFinancialYear)
);

router.get(
  '/transactions',
  validate([query('type').optional().isIn(['excel'])]),
  asyncHandler(exportTransactions)
);
router.get(
  '/backup',
  validate([query('type').optional().isIn(['json'])]),
  asyncHandler(exportBackup)
);
router.post(
  '/restore-backup',
  restoreUpload,
  asyncHandler(restoreBackup)
);

export default router;
