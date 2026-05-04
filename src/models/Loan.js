import mongoose from 'mongoose';

const LOAN_TYPES = ['given', 'taken'];
const LOAN_STATUSES = ['pending', 'partially_paid', 'completed', 'overdue'];
const INTEREST_TYPES = ['none', 'simple', 'compound'];
const INTEREST_FREQUENCIES = ['monthly', 'yearly'];
const COMPOUNDING_FREQUENCIES = ['monthly', 'quarterly', 'half-yearly', 'yearly'];

const loanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PersonLedger',
      required: true,
    },
    type: { type: String, enum: LOAN_TYPES, required: true },
    principalAmount: {
      type: Number,
      required: true,
      min: [0, 'principalAmount cannot be negative'],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestRate: { type: Number, default: 0 }, // percentage
    interestType: { type: String, enum: INTEREST_TYPES, default: 'none' },
    interestFrequency: { type: String, enum: INTEREST_FREQUENCIES, default: 'monthly' },
    compoundingFrequency: { type: String, enum: COMPOUNDING_FREQUENCIES, default: 'monthly' },
    startDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },
    reminderDate: { type: Date, default: null },
    status: {
      type: String,
      enum: LOAN_STATUSES,
      default: 'pending',
      index: true,
    },
    note: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true }
);

loanSchema.index({ userId: 1, personId: 1 });
loanSchema.index({ userId: 1, status: 1 });
loanSchema.index({ userId: 1, dueDate: 1 });

loanSchema.pre('save', function loanDerived(next) {
  const remaining = this.principalAmount - this.paidAmount;
  if (remaining <= 0.001) {
    this.paidAmount = this.principalAmount;
    this.status = 'completed';
    return next();
  }
  const duePassed =
    this.dueDate && new Date(this.dueDate).setHours(0, 0, 0, 0) <
    new Date().setHours(0, 0, 0, 0);
  if (duePassed) {
    this.status = 'overdue';
  } else if (this.paidAmount > 0) {
    this.status = 'partially_paid';
  } else {
    this.status = 'pending';
  }
  next();
});

export const LOAN_TYPE_VALUES = LOAN_TYPES;
export const LOAN_STATUS_VALUES = LOAN_STATUSES;
export const Loan = mongoose.model('Loan', loanSchema);
