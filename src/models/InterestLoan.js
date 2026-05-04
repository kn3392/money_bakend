import mongoose from 'mongoose';

const LOAN_STATUSES = ['active', 'partial_paid', 'done', 'due', 'overdue'];

const interestLoanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    borrowerName: {
      type: String,
      required: true,
      trim: true,
    },
    contactDetails: {
      type: String,
      trim: true,
      default: '',
    },
    principalAmount: {
      type: Number,
      required: true,
      min: [0, 'Principal cannot be negative'],
    },
    monthlyInterestRate: {
      type: Number,
      required: true,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    manualMonths: {
      type: Number,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    monthsUsed: {
      type: Number,
      default: 0,
    },
    interestAmount: {
      type: Number,
      default: 0,
    },
    totalDue: {
      type: Number,
      default: 0,
    },
    receivedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: LOAN_STATUSES,
      default: 'active',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    payments: [
      {
        amount: Number,
        date: { type: Date, default: Date.now },
        type: { type: String, enum: ['interest', 'principal', 'both'], default: 'interest' },
        periodStart: Date,
        periodEnd: Date,
        remarks: String,
      }
    ],
  },
  { timestamps: true }
);

// Indexes for performance
interestLoanSchema.index({ userId: 1, borrowerName: 1 });
interestLoanSchema.index({ userId: 1, status: 1 });
interestLoanSchema.index({ userId: 1, startDate: 1 });

const InterestLoan = mongoose.model('InterestLoan', interestLoanSchema);

export default InterestLoan;
