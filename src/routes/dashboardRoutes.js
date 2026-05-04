import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();
router.use(protect);
router.get('/summary', asyncHandler(dashboardController.getDashboardSummary));

export default router;
