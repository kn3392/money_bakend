import { Router } from 'express';
import { body, param } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as pc from '../controllers/personController.js';

const router = Router();

router.use(protect);

const createRules = [
  body('name').trim().notEmpty(),
  body('linkedAccountId').optional().isMongoId(),
];

const updateRules = [
  param('id').isMongoId(),
  body('name').optional().trim().notEmpty(),
  body('linkedAccountId').optional({ values: 'null' }).isMongoId(),
  body('isActive').optional().isBoolean(),
];

router.get('/', asyncHandler(pc.listPersons));
router.post('/', validate(createRules), asyncHandler(pc.createPerson));

router.get(
  '/:id',
  validate([param('id').isMongoId()]),
  asyncHandler(pc.getPerson)
);

router.put(
  '/:id',
  validate(updateRules),
  asyncHandler(pc.updatePerson)
);

router.delete(
  '/:id',
  validate([param('id').isMongoId()]),
  asyncHandler(pc.deletePerson)
);

export default router;
