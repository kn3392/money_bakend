import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { AppError } from '../utils/AppError.js';
import {
  recalculateAccountBalances,
  syncAccountBalancesAndGetSummary,
} from '../services/accountBalanceService.js';

function toPublicAccount(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    type: doc.type,
    openingBalance: doc.openingBalance,
    currentBalance: doc.currentBalance,
    isDefault: doc.isDefault,
    isActive: doc.isActive,
    description: doc.description ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function ensureOwned(doc, userId) {
  if (!doc) throw new AppError('Account not found', 404);
  if (String(doc.userId) !== String(userId)) {
    throw new AppError('Account not found', 404);
  }
}

/**
 * GET /api/accounts — active accounts only
 */
export async function listAccounts(req, res) {
  await recalculateAccountBalances(req.user._id.toString());
  const rows = await Account.find({
    userId: req.user._id,
    isActive: true,
  }).sort({ name: 1 });

  res.json({
    success: true,
    accounts: rows.map(toPublicAccount),
  });
}

/**
 * GET /api/accounts/summary
 */
export async function getAccountSummary(req, res) {
  const data = await syncAccountBalancesAndGetSummary(req.user._id.toString());
  res.json({ success: true, ...data });
}

/**
 * POST /api/accounts
 */
export async function createAccount(req, res) {
  const { name, type, openingBalance, description, isDefault } = req.body;
  const ob =
    openingBalance === undefined || openingBalance === null
      ? 0
      : Number(openingBalance);

  try {
    const doc = await Account.create({
      userId: req.user._id,
      name: String(name).trim(),
      type,
      openingBalance: ob,
      currentBalance: ob,
      description: description ? String(description).trim() : '',
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    res.status(201).json({
      success: true,
      account: toPublicAccount(doc),
    });
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError('An account with this name already exists', 400);
    }
    throw err;
  }
}

/**
 * PUT /api/accounts/:id
 */
export async function updateAccount(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid account id', 400);
  }

  const doc = await Account.findById(id);
  ensureOwned(doc, req.user._id);

  const { name, type, openingBalance, description, isDefault, isActive } =
    req.body;

  if (name !== undefined) doc.name = String(name).trim();
  if (type !== undefined) doc.type = type;
  if (description !== undefined) doc.description = String(description).trim();
  if (isDefault !== undefined) doc.isDefault = Boolean(isDefault);
  if (isActive !== undefined) doc.isActive = Boolean(isActive);

  if (openingBalance !== undefined && openingBalance !== null) {
    const newOb = Number(openingBalance);
    const prevOb = Number(doc.openingBalance ?? 0);
    const delta = newOb - prevOb;
    doc.openingBalance = newOb;
    doc.currentBalance = Number(doc.currentBalance ?? 0) + delta;
  }

  try {
    await doc.save();
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError('An account with this name already exists', 400);
    }
    throw err;
  }

  res.json({
    success: true,
    account: toPublicAccount(doc),
  });
}

/**
 * DELETE /api/accounts/:id — soft delete
 */
export async function deleteAccount(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid account id', 400);
  }

  const doc = await Account.findById(id);
  ensureOwned(doc, req.user._id);

  doc.isActive = false;
  await doc.save();

  res.json({
    success: true,
    message: 'Account deactivated',
    account: toPublicAccount(doc),
  });
}
