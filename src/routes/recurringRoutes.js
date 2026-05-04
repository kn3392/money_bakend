import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { TRANSACTION_TYPE_VALUES } from '../models/Transaction.js';
import { FREQUENCY_VALUES } from '../models/RecurringTransaction.js';
import {
  listRecurringCtr,
  postRecurringCtr,
  putRecurringCtr,
  deleteRecurringCtr,
  runDueCtr,
} from '../controllers/recurringController.js';

const router = Router();
router.use(protect);

const createRules = [
  body('type').isIn(TRANSACTION_TYPE_VALUES),
  body('amount').isFloat({ gt: 0 }),
  body('frequency').isIn(FREQUENCY_VALUES),
  body('startDate').notEmpty(),
  body('nextRunDate').optional(),
  body('note').optional().isString().isLength({ max: 2000 }),
  body('personId').optional().isMongoId(),
  body('accountId').optional({ values: 'falsy' }).isMongoId(),
  body('categoryId').optional({ values: 'falsy' }).isMongoId(),
  body('fromAccountId').optional({ values: 'falsy' }).isMongoId(),
  body('toAccountId').optional({ values: 'falsy' }).isMongoId(),
  body('endDate').optional({ values: 'falsy' }),
  body('isActive').optional().isBoolean(),
];

router.get('/', asyncHandler(listRecurringCtr));

router.post(
  '/',
  validate(createRules),
  asyncHandler(postRecurringCtr)
);

router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('type').optional().isIn(TRANSACTION_TYPE_VALUES),
    body('frequency').optional().isIn(FREQUENCY_VALUES),
    body('startDate').optional(),
    body('nextRunDate').optional(),
    body('endDate').optional({ values: 'falsy' }),
    body('isActive').optional().isBoolean(),
    body('note').optional().isString().isLength({ max: 2000 }),
  ]),
  asyncHandler(putRecurringCtr)
);

router.delete(
  '/:id',
  validate([param('id').isMongoId()]),
  asyncHandler(deleteRecurringCtr)
);

router.post('/run-due', asyncHandler(runDueCtr));

export default router;
