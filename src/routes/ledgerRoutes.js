import { Router } from 'express';
import { param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getDayLedger,
  lockDay,
  unlockDay,
} from '../controllers/ledgerController.js';

const router = Router();

router.use(protect);

const dateKeyParam = [
  param('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date must be YYYY-MM-DD (IST calendar key)'),
];

router.get('/day/:date', validate(dateKeyParam), asyncHandler(getDayLedger));
router.put(
  '/day/:date/lock',
  validate(dateKeyParam),
  asyncHandler(lockDay)
);
router.put(
  '/day/:date/unlock',
  validate(dateKeyParam),
  asyncHandler(unlockDay)
);

export default router;
