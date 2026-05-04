import { Router } from 'express';
import { body, param } from 'express-validator';
import * as accountController from '../controllers/accountController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { ACCOUNT_TYPE_VALUES } from '../models/Account.js';

const router = Router();

router.use(protect);

router.get('/summary', asyncHandler(accountController.getAccountSummary));
router.get('/', asyncHandler(accountController.listAccounts));

const createRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').isIn(ACCOUNT_TYPE_VALUES).withMessage('Invalid account type'),
  body('openingBalance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Opening balance must be zero or positive'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('isDefault').optional().isBoolean(),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid account id'),
  body('name').optional().trim().notEmpty(),
  body('type').optional().isIn(ACCOUNT_TYPE_VALUES),
  body('openingBalance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Opening balance must be zero or positive'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

router.post('/', validate(createRules), asyncHandler(accountController.createAccount));

router.put(
  '/:id',
  validate(updateRules),
  asyncHandler(accountController.updateAccount)
);

router.delete(
  '/:id',
  validate([param('id').isMongoId().withMessage('Invalid account id')]),
  asyncHandler(accountController.deleteAccount)
);

export default router;
