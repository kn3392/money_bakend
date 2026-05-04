import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { uploadReceiptMw } from '../middleware/uploadMiddleware.js';
import { postReceipt } from '../controllers/uploadController.js';

const router = Router();
router.use(protect);
router.post('/receipt', uploadReceiptMw, asyncHandler(postReceipt));
export default router;
