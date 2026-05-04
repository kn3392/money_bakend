import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/budgetController.js';

const router = Router();
router.use(protect);

router.get('/report', validate([query('month').isInt({ min: 1, max: 12 }), query('year').isInt({ min: 2000 })]), asyncHandler(c.getBudgetReport));
router.get('/', asyncHandler(c.listBudgets));
router.get('/:id', validate([param('id').isMongoId()]), asyncHandler(c.getBudget));

const createRules = [
  body('categoryId').isMongoId(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000 }),
  body('budgetAmount').isFloat({ gt: 0 }),
  body('alertAtPercent').optional().isFloat({ min: 1, max: 100 }),
  body('isActive').optional().isBoolean(),
];

router.post('/', validate(createRules), asyncHandler(c.createBudget));
router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('budgetAmount').optional().isFloat({ gt: 0 }),
    body('alertAtPercent').optional().isFloat({ min: 1, max: 100 }),
    body('isActive').optional().isBoolean(),
  ]),
  asyncHandler(c.updateBudget)
);
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeBudget));

export default router;
