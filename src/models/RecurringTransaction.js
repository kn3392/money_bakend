import mongoose from 'mongoose';

const RECURRING_TYPES = ['income', 'expense', 'transfer'];
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

const recurringTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: RECURRING_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than 0'],
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    fromAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    toAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PersonLedger',
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    frequency: {
      type: String,
      enum: FREQUENCIES,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    nextRunDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Last IST date key for which a transaction was materialized (dedupe per day). */
    lastMaterializedDateKey: {
      type: String,
      default: '',
    },
    lastRunDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

recurringTransactionSchema.index({ userId: 1, isActive: 1, nextRunDate: 1 });

export const FREQUENCY_VALUES = FREQUENCIES;
export const RecurringTransaction = mongoose.model(
  'RecurringTransaction',
  recurringTransactionSchema
);
