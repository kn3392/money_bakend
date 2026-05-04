import mongoose from 'mongoose';

/**
 * Person / informal lending ledger (SmartKhata Phase 6).
 *
 * totals:
 * - totalGiven — money/expense posted to them (typically expense + personId).
 * - totalTaken — money/income recovered from them (typically income + personId).
 *
 * balance = totalTaken - totalGiven
 * - Negative → you gave more than you received ⇒ net “pending” exposure on this relationship.
 * - Positive → you received more than you gave.
 */
const personLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    linkedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    totalGiven: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalTaken: {
      type: Number,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

personLedgerSchema.index({ userId: 1, name: 1 }, { unique: true });

personLedgerSchema.pre('save', function syncBalance(next) {
  this.balance = this.totalTaken - this.totalGiven;
  next();
});

export const PersonLedger = mongoose.model('PersonLedger', personLedgerSchema);
