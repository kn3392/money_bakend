import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/tagController.js';

const router = Router();
router.use(protect);

router.get('/', asyncHandler(c.listTags));
router.post(
  '/',
  validate([
    body('name').trim().notEmpty().isLength({ max: 64 }),
    body('color').optional().isString().isLength({ max: 32 }),
  ]),
  asyncHandler(c.createTag)
);
router.put(
  '/:id',
  validate([
    param('id').isMongoId(),
    body('name').optional().trim().notEmpty().isLength({ max: 64 }),
    body('color').optional().isString().isLength({ max: 32 }),
    body('isActive').optional().isBoolean(),
  ]),
  asyncHandler(c.updateTag)
);
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeTag));

export default router;
