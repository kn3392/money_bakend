import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/savingsGoalController.js';

const router = Router();
router.use(protect);

router.get('/report', asyncHandler(c.goalsReport));
router.get('/', asyncHandler(c.listGoals));

const createRules = [
  body('name').trim().notEmpty(),
  body('targetAmount').isFloat({ gt: 0 }),
  body('currentAmount').optional().isFloat({ min: 0 }),
  body('deadline').optional().isISO8601(),
  body('linkedAccountId').optional().isMongoId(),
  body('status').optional().isIn(['active', 'completed', 'paused', 'cancelled']),
];

router.post('/', validate(createRules), asyncHandler(c.createGoal));
router.post(
  '/:id/add-saving',
  validate([param('id').isMongoId(), body('amount').isFloat({ gt: 0 })]),
  asyncHandler(c.addSaving)
);
router.get('/:id', validate([param('id').isMongoId()]), asyncHandler(c.getGoal));
router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty(),
    body('targetAmount').optional().isFloat({ gt: 0 }),
    body('currentAmount').optional().isFloat({ min: 0 }),
    body('deadline').optional().isISO8601(),
    body('linkedAccountId').optional().isMongoId(),
    body('status').optional().isIn(['active', 'completed', 'paused', 'cancelled']),
  ]),
  asyncHandler(c.updateGoal)
);
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeGoal));

export default router;
