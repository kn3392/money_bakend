import mongoose from 'mongoose';

const SPLIT_TYPES = ['equal', 'custom'];
const SPLIT_STATUS = ['active', 'settled', 'cancelled'];
const PARTICIPANT_STATUS = ['pending', 'partially_paid', 'settled'];

const participantSchema = new mongoose.Schema(
  {
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PersonLedger',
      required: true,
    },
    shareAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: PARTICIPANT_STATUS,
      default: 'pending',
    },
  },
  { _id: true }
);

const splitExpenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    totalAmount: {
      type: Number,
      required: true,
      min: [0.01, 'totalAmount must be greater than 0'],
    },
    payerAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    payerPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PersonLedger',
      default: null,
    },
    splitType: { type: String, enum: SPLIT_TYPES, required: true },
    participants: { type: [participantSchema], default: [] },
    linkedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    date: { type: Date, required: true },
    dateKey: { type: String, required: true, index: true },
    note: { type: String, trim: true, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: SPLIT_STATUS,
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

splitExpenseSchema.index({ userId: 1, dateKey: -1 });
splitExpenseSchema.index({ userId: 1, status: 1 });

export const SPLIT_TYPE_VALUES = SPLIT_TYPES;
export const SplitExpense = mongoose.model('SplitExpense', splitExpenseSchema);
