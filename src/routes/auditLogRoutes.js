import { Router } from 'express';
import { param, query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/auditLogController.js';

const router = Router();
router.use(protect);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('action').optional().isString().isLength({ max: 64 }),
    query('entityType').optional().isString().isLength({ max: 64 }),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ]),
  asyncHandler(c.listLogs)
);
router.get('/:id', validate([param('id').isMongoId()]), asyncHandler(c.getLog));

export default router;
