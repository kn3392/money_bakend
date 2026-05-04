import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Account } from '../models/Account.js';
import { Transaction, ACTIVE_TRANSACTION_MATCH } from '../models/Transaction.js';
import { generateToken } from '../utils/generateToken.js';
import { AppError } from '../utils/AppError.js';
import { seedDefaultAccountsAndCategories } from '../services/defaultSeedService.js';
import logger from '../utils/logger.js';
import { recordAudit, recordDetailedAudit } from '../services/auditService.js';
import { syncAccountBalancesAndGetSummary } from '../services/accountBalanceService.js';

function safeUser(userDoc) {
  return userDoc.toSafeJSON();
}

/**
 * POST /api/auth/register
 */
export async function register(req, res) {
  const { name, email, password } = req.body;

  try {
    const user = await User.create({
      name: name.trim(),
      email,
      password,
    });

    try {
      await seedDefaultAccountsAndCategories(user._id);
    } catch (seedErr) {
      logger.error('Post-registration default seed failed', {
        userId: user._id.toString(),
        err: seedErr instanceof Error ? seedErr.message : String(seedErr),
      });
    }

    const token = generateToken(user._id.toString());

    void recordAudit({
      userId: user._id,
      action: 'auth.register',
      resource: 'user',
      meta: { email: user.email },
      req,
    });

    res.status(201).json({
      success: true,
      token,
      user: safeUser(user),
    });
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError('Email already registered', 400);
    }
    throw err;
  }
}

/**
 * POST /api/auth/login
 */
export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+password'
  );

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw new AppError('Invalid email or password', 401);
  }

  const fresh = await User.findById(user._id);
  const token = generateToken(user._id.toString());

  void recordAudit({
    userId: user._id,
    action: 'auth.login',
    resource: 'user',
    meta: {},
    req,
  });
  void recordDetailedAudit({
    userId: user._id,
    action: 'login',
    entityType: 'user',
    entityId: String(user._id),
    newValue: { email: user.email },
    req,
  });

  res.status(200).json({
    success: true,
    token,
    user: safeUser(fresh),
  });
}

/**
 * GET /api/auth/profile
 */
export async function getProfile(req, res) {
  res.status(200).json({
    success: true,
    user: safeUser(req.user),
  });
}

/**
 * GET /api/auth/profile-overview — user + portfolio stats for Profile UI.
 */
export async function getProfileOverview(req, res) {
  const uid = req.user._id;
  const userId = uid.toString();

  const [totalAccounts, totalTransactions, summaryData] = await Promise.all([
    Account.countDocuments({ userId: uid, isActive: true }),
    Transaction.countDocuments({ userId: uid, ...ACTIVE_TRANSACTION_MATCH }),
    syncAccountBalancesAndGetSummary(userId),
  ]);

  res.status(200).json({
    success: true,
    user: safeUser(req.user),
    stats: {
      totalAccounts,
      totalTransactions,
      totalAvailableBalance: summaryData.totalAvailableBalance,
    },
  });
}

/**
 * PATCH /api/auth/profile — update display name only.
 */
export async function updateProfile(req, res) {
  const name = String(req.body.name ?? '').trim();
  if (!name) {
    throw new AppError('Name is required', 400);
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.name = name.slice(0, 120);
  await user.save();

  void recordDetailedAudit({
    userId: req.user._id,
    action: 'profile.update',
    entityType: 'user',
    entityId: String(req.user._id),
    newValue: { name: user.name },
    req,
  });
  void recordAudit({
    userId: req.user._id,
    action: 'auth.profile_update',
    resource: 'user',
    meta: {},
    req,
  });

  const out = await User.findById(user._id);
  res.status(200).json({
    success: true,
    user: safeUser(out),
  });
}

/**
 * PUT /api/auth/password — change password (requires current password).
 */
export async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const match = await bcrypt.compare(String(currentPassword ?? ''), user.password);
  if (!match) {
    throw new AppError('Current password is incorrect', 401);
  }

  user.password = String(newPassword);
  await user.save();

  void recordDetailedAudit({
    userId: req.user._id,
    action: 'password.change',
    entityType: 'user',
    entityId: String(req.user._id),
    newValue: {},
    req,
  });
  void recordAudit({
    userId: req.user._id,
    action: 'auth.password_change',
    resource: 'user',
    meta: {},
    req,
  });

  res.status(200).json({
    success: true,
    message: 'Password updated',
  });
}

/**
 * PUT /api/auth/set-pin
 */
export async function setPin(req, res) {
  const { pin } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.pin = String(pin);
  user.isPinEnabled = true;
  await user.save();

  const out = await User.findById(user._id);
  res.status(200).json({
    success: true,
    message: 'PIN set successfully',
    user: safeUser(out),
  });
}

/**
 * POST /api/auth/verify-pin
 */
export async function verifyPin(req, res) {
  const { pin } = req.body;
  const user = await User.findById(req.user._id).select('+pin');
  if (!user) {
    throw new AppError('User not found', 404);
  }
  if (!user.isPinEnabled || !user.pin) {
    throw new AppError('PIN is not enabled', 400);
  }

  const ok = await bcrypt.compare(String(pin), user.pin);
  if (!ok) {
    throw new AppError('Invalid PIN', 401);
  }

  res.status(200).json({
    success: true,
    message: 'PIN verified',
  });
}

/**
 * PUT /api/auth/disable-pin
 */
export async function disablePin(req, res) {
  await User.findByIdAndUpdate(req.user._id, {
    $unset: { pin: 1 },
    isPinEnabled: false,
  });

  const out = await User.findById(req.user._id);
  res.status(200).json({
    success: true,
    message: 'PIN disabled',
    user: safeUser(out),
  });
}

/** Client should discard JWT; server records session end for audit. */
export async function logout(req, res) {
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'logout',
    entityType: 'user',
    entityId: String(req.user._id),
    newValue: {},
    req,
  });
  void recordAudit({
    userId: req.user._id,
    action: 'auth.logout',
    resource: 'user',
    meta: {},
    req,
  });
  res.status(200).json({ success: true, message: 'Logged out' });
}
