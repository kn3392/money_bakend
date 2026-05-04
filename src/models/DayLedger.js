import mongoose from 'mongoose';

/**
 * One rollup row per user per IST calendar day (aggregate across accounts).
 * Transfers are tracked separately and do not affect closingBalance net (income/expense only).
 */
const dayLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** IST calendar date key YYYY-MM-DD */
    dateKey: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    totalIncome: {
      type: Number,
      default: 0,
    },
    totalExpense: {
      type: Number,
      default: 0,
    },
    totalTransferIn: {
      type: Number,
      default: 0,
    },
    totalTransferOut: {
      type: Number,
      default: 0,
    },
    closingBalance: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

dayLedgerSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
dayLedgerSchema.index({ userId: 1, dateKey: -1 }); // fast "latest day" lookups

export const DayLedger = mongoose.model('DayLedger', dayLedgerSchema);
