import mongoose from 'mongoose';
import { getFinancialYearLabelForDate, getISTDateKey } from '../utils/financialYear.js';

const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];

/** Posted entries; undone/deleted retained for audit and excluded from aggregates. */
export const TRANSACTION_STATUSES = ['active', 'deleted', 'undone'];

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Amount must be greater than 0'],
    },
    /** Calendar date in IST (stored as UTC noon for that IST date key). */
    date: {
      type: Date,
      required: true,
      index: true,
    },
    /** Denormalized IST date key for reporting and indexes. */
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    financialYear: {
      type: String,
      required: true,
      index: true,
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
    note: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
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
    attachmentUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: '',
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: 'active',
      index: true,
    },
    /** Set when generated from recurring template — dedupe with materializationDateKey. */
    recurringTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecurringTransaction',
      default: null,
    },
    materializationDateKey: {
      type: String,
      default: '',
    },
    tagIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
      default: [],
    },
  },
  { timestamps: true }
);

transactionSchema.index(
  { userId: 1, recurringTemplateId: 1, materializationDateKey: 1 },
  {
    unique: true,
    partialFilterExpression: { recurringTemplateId: { $ne: null } },
  }
);

/** Documents that still affect ledger + balances (legacy rows may omit status — treat like active). */
export const ACTIVE_TRANSACTION_MATCH = {
  $or: [{ status: 'active' }, { status: { $exists: false } }],
};

transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, financialYear: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userId: 1, accountId: 1 });
transactionSchema.index({ userId: 1, tagIds: 1 });

transactionSchema.pre('validate', function setDerivedDates(next) {
  if (this.date && (!this.dateKey || !this.financialYear)) {
    const dk = getISTDateKey(this.date);
    this.dateKey = dk;
    this.financialYear = getFinancialYearLabelForDate(this.date);
  }
  next();
});

transactionSchema.pre('validate', function validateByType(next) {
  const t = this.type;
  if (t === 'income' || t === 'expense') {
    if (!this.accountId) {
      this.invalidate('accountId', `${t} requires accountId`);
    }
    if (!this.categoryId) {
      this.invalidate('categoryId', `${t} requires categoryId`);
    }
    if (this.fromAccountId || this.toAccountId) {
      this.invalidate('fromAccountId', 'Income/expense cannot include transfer accounts');
    }
  }
  if (t === 'transfer') {
    if (!this.fromAccountId || !this.toAccountId) {
      this.invalidate('fromAccountId', 'Transfer requires fromAccountId and toAccountId');
    }
    if (String(this.fromAccountId) === String(this.toAccountId)) {
      this.invalidate('toAccountId', 'Cannot transfer to the same account');
    }
    if (this.categoryId) {
      this.invalidate('categoryId', 'Transfer should not include categoryId');
    }
  }
  next();
});

export const TRANSACTION_TYPE_VALUES = TRANSACTION_TYPES;
export const Transaction = mongoose.model('Transaction', transactionSchema);
