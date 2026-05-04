import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { validateBusinessRules } from '../middleware/validateTransactionPayload.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  postTransaction,
  putTransaction,
  removeTransaction,
  postUndoLast,
  getSearchTransactions,
} from '../controllers/transactionController.js';
import { TRANSACTION_TYPE_VALUES } from '../models/Transaction.js';

const router = Router();

router.use(protect);

const searchRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('q').optional().isString().isLength({ max: 200 }),
  query('type').optional().isIn(TRANSACTION_TYPE_VALUES),
  query('accountId').optional().isMongoId(),
  query('categoryId').optional().isMongoId(),
  query('personId').optional().isMongoId(),
  query('dateFrom')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('dateFrom must be YYYY-MM-DD'),
  query('dateTo')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('dateTo must be YYYY-MM-DD'),
  query('financialYear').optional().isString().isLength({ max: 32 }),
  query('tagId').optional().isMongoId(),
  query('amount').optional().isFloat({ gt: 0 }),
  query('sort').optional().isIn(['newest', 'oldest']),
];

router.get('/search', validate(searchRules), asyncHandler(getSearchTransactions));

const createRules = [
  body('type').isIn(TRANSACTION_TYPE_VALUES),
  body('amount').isFloat({ gt: 0 }),
  body('date').notEmpty(),
  body('note').optional().isString().isLength({ max: 2000 }),
  body('attachmentUrl').optional().isString().isLength({ max: 2048 }),
  body('accountId').optional().isMongoId(),
  body('categoryId').optional().isMongoId(),
  body('personId').optional().isMongoId(),
  body('fromAccountId').optional().isMongoId(),
  body('toAccountId').optional().isMongoId(),
  body('tagIds').optional().isArray(),
  body('tagIds.*').optional().isMongoId(),
];

const patchRules = [
  param('id').isMongoId(),
  body('type').optional().isIn(TRANSACTION_TYPE_VALUES),
  body('amount').optional().isFloat({ gt: 0 }),
  body('date').optional().notEmpty(),
  body('note').optional().isString().isLength({ max: 2000 }),
  body('attachmentUrl').optional().isString().isLength({ max: 2048 }),
  body('accountId').optional().isMongoId(),
  body('categoryId').optional().isMongoId(),
  body('personId').optional().isMongoId(),
  body('fromAccountId').optional().isMongoId(),
  body('toAccountId').optional().isMongoId(),
  body('tagIds').optional().isArray(),
  body('tagIds.*').optional().isMongoId(),
];

router.post(
  '/',
  validate(createRules),
  validateBusinessRules,
  asyncHandler(postTransaction)
);

router.post('/undo-last', asyncHandler(postUndoLast));

router.put(
  '/:id',
  validate(patchRules),
  asyncHandler(putTransaction)
);

router.delete(
  '/:id',
  validate([param('id').isMongoId()]),
  asyncHandler(removeTransaction)
);

export default router;
