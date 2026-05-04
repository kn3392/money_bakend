import { Router } from 'express';
import { getHealth, getTestDb } from '../controllers/healthController.js';

const router = Router();

router.get('/health', getHealth);
router.get('/test-db', getTestDb);

export default router;
