import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/splitExpenseController.js';

const router = Router();
router.use(protect);

router.get('/report', asyncHandler(c.splitsReport));
router.get('/', asyncHandler(c.listSplits));

const participantRule = body('participants').isArray({ min: 1 });
const createRules = [
  body('title').trim().notEmpty(),
  body('totalAmount').isFloat({ gt: 0 }),
  body('payerAccountId').isMongoId(),
  body('payerPersonId').optional().isMongoId(),
  body('splitType').isIn(['equal', 'custom']),
  participantRule,
  body('linkedTransactionId').optional().isMongoId(),
  body('date').optional().isISO8601(),
  body('note').optional().isString().isLength({ max: 2000 }),
];

router.post('/', validate(createRules), asyncHandler(c.createSplit));
router.post(
  '/:id/settle-participant',
  validate([
    param('id').isMongoId(),
    body('participantId').isMongoId(),
    body('amount').isFloat({ gt: 0 }),
  ]),
  asyncHandler(c.settleParticipant)
);
router.get('/:id', validate([param('id').isMongoId()]), asyncHandler(c.getSplit));
router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('title').optional().trim().notEmpty(),
    body('note').optional().isString().isLength({ max: 2000 }),
    body('status').optional().isIn(['active', 'settled', 'cancelled']),
  ]),
  asyncHandler(c.updateSplit)
);
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeSplit));

export default router;
