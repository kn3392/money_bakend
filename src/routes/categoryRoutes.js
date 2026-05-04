import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as categoryController from '../controllers/categoryController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { CATEGORY_TYPE_VALUES } from '../models/Category.js';

const router = Router();

router.use(protect);

const listRules = [
  query('type')
    .optional()
    .isIn(CATEGORY_TYPE_VALUES)
    .withMessage('Type must be income or expense'),
];

router.get(
  '/',
  validate(listRules),
  asyncHandler(categoryController.listCategories)
);

const createRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('type').isIn(CATEGORY_TYPE_VALUES).withMessage('Type must be income or expense'),
  body('icon').optional().isString().isLength({ max: 64 }),
  body('color').optional().isString().isLength({ max: 32 }),
  body('isDefault').optional().isBoolean(),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid category id'),
  body('name').optional().trim().notEmpty(),
  body('type').optional().isIn(CATEGORY_TYPE_VALUES),
  body('icon').optional().isString().isLength({ max: 64 }),
  body('color').optional().isString().isLength({ max: 32 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

router.post(
  '/',
  validate(createRules),
  asyncHandler(categoryController.createCategory)
);

router.put(
  '/:id',
  validate(updateRules),
  asyncHandler(categoryController.updateCategory)
);

router.delete(
  '/:id',
  validate([param('id').isMongoId().withMessage('Invalid category id')]),
  asyncHandler(categoryController.deleteCategory)
);

export default router;
