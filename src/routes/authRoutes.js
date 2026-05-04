import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const pinRules = [
  body('pin')
    .matches(/^\d{4}$|^\d{6}$/)
    .withMessage('PIN must be exactly 4 or 6 digits'),
];

router.post(
  '/register',
  authLimiter,
  validate(registerRules),
  asyncHandler(authController.register)
);

router.post(
  '/login',
  authLimiter,
  validate(loginRules),
  asyncHandler(authController.login)
);

router.get('/profile', protect, asyncHandler(authController.getProfile));
router.get('/profile-overview', protect, asyncHandler(authController.getProfileOverview));

router.patch(
  '/profile',
  protect,
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  ]),
  asyncHandler(authController.updateProfile)
);

router.put(
  '/password',
  protect,
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ]),
  asyncHandler(authController.updatePassword)
);

router.put(
  '/set-pin',
  protect,
  validate(pinRules),
  asyncHandler(authController.setPin)
);

router.post(
  '/verify-pin',
  protect,
  validate(pinRules),
  asyncHandler(authController.verifyPin)
);

router.put('/disable-pin', protect, asyncHandler(authController.disablePin));

router.post('/logout', protect, asyncHandler(authController.logout));

export default router;
