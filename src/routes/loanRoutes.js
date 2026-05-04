import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/loanController.js';

const router = Router();
router.use(protect);

router.get('/report', asyncHandler(c.loansReport));
router.get('/', asyncHandler(c.listLoans));

const createRules = [
  body('personId').isMongoId(),
  body('type').isIn(['given', 'taken']),
  body('principalAmount').isFloat({ gt: 0 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('dueDate').optional().isISO8601(),
  body('reminderDate').optional().isISO8601(),
  body('note').optional().isString().isLength({ max: 2000 }),
];

router.post('/', validate(createRules), asyncHandler(c.createLoan));
router.post(
  '/:id/payment',
  validate([param('id').isMongoId(), body('amount').isFloat({ gt: 0 })]),
  asyncHandler(c.postPayment)
);
router.get('/:id', validate([param('id').isMongoId()]), asyncHandler(c.getLoan));
router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('principalAmount').optional().isFloat({ gt: 0 }),
    body('paidAmount').optional().isFloat({ min: 0 }),
    body('dueDate').optional().isISO8601(),
    body('reminderDate').optional().isISO8601(),
    body('note').optional().isString().isLength({ max: 2000 }),
    body('status').optional().isIn(['pending', 'partially_paid', 'completed', 'overdue']),
  ]),
  asyncHandler(c.updateLoan)
);
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeLoan));

export default router;
