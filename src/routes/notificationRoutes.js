import { Router } from 'express';
import { param, query } from 'express-validator';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as c from '../controllers/notificationController.js';

const router = Router();
router.use(protect);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  asyncHandler(c.listNotifications)
);
router.get('/unread-count', asyncHandler(c.getUnreadCount));
router.put('/read-all', asyncHandler(c.markAllRead));
router.put('/:id/read', validate([param('id').isMongoId()]), asyncHandler(c.markRead));
router.delete('/:id', validate([param('id').isMongoId()]), asyncHandler(c.removeNotification));

export default router;
