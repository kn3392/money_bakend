import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { Category } from '../models/Category.js';
import logger from '../utils/logger.js';

const DEFAULT_ACCOUNTS = [
  { name: 'Cash', type: 'cash' },
  { name: 'SBI Bank', type: 'bank' },
  { name: 'HDFC Bank', type: 'bank' },
  { name: 'PhonePe', type: 'wallet' },
  { name: 'Google Pay', type: 'wallet' },
  { name: 'Home Cash', type: 'cash' },
  { name: 'Shop Cash', type: 'cash' },
];

const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Business Income',
  'Freelance',
  'Interest',
  'Gift',
  'Person Returned Money',
  'Cash Deposit',
  'Bank Credit',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Chai',
  'Petrol',
  'Rent',
  'EMI',
  'Shopping',
  'Medical',
  'Education',
  'Recharge',
  'Bill Payment',
  'Travel',
  'Family Expense',
  'Person Given Money',
];

/**
 * Idempotent: skips if user already has any account (prevents duplicate seed).
 * Uses plain insertMany (no multi-doc transactions) so it works on standalone MongoDB.
 * @param {import('mongoose').Types.ObjectId | string} userId
 */
export async function seedDefaultAccountsAndCategories(userId) {
  const uid =
    typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const existingAccounts = await Account.countDocuments({ userId: uid });
  if (existingAccounts > 0) {
    logger.info('Default seed skipped — user already has accounts', {
      userId: uid.toString(),
    });
    return { seeded: false };
  }

  try {
    const accountDocs = DEFAULT_ACCOUNTS.map((a) => ({
      userId: uid,
      name: a.name,
      type: a.type,
      openingBalance: 0,
      currentBalance: 0,
      isDefault: true,
      isActive: true,
      description: '',
    }));

    await Account.insertMany(accountDocs);

    const incomeDocs = DEFAULT_INCOME_CATEGORIES.map((name) => ({
      userId: uid,
      name,
      type: 'income',
      isDefault: true,
      isActive: true,
    }));

    const expenseDocs = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
      userId: uid,
      name,
      type: 'expense',
      isDefault: true,
      isActive: true,
    }));

    await Category.insertMany([...incomeDocs, ...expenseDocs]);

    logger.info('Default accounts and categories seeded', {
      userId: uid.toString(),
    });
    return { seeded: true };
  } catch (err) {
    logger.error('Default seed failed', {
      userId: uid.toString(),
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
