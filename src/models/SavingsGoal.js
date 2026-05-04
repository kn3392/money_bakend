import mongoose from 'mongoose';

const GOAL_STATUSES = ['active', 'completed', 'paused', 'cancelled'];

const savingsGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    targetAmount: {
      type: Number,
      required: true,
      min: [0.01, 'targetAmount must be greater than 0'],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, 'currentAmount cannot be negative'],
    },
    deadline: { type: Date, default: null },
    linkedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    status: {
      type: String,
      enum: GOAL_STATUSES,
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

savingsGoalSchema.index({ userId: 1, status: 1 });

savingsGoalSchema.pre('save', function goalStatus(next) {
  if (this.status === 'active' && this.currentAmount >= this.targetAmount) {
    this.currentAmount = this.targetAmount;
    this.status = 'completed';
  }
  next();
});

export const GOAL_STATUS_VALUES = GOAL_STATUSES;
export const SavingsGoal = mongoose.model('SavingsGoal', savingsGoalSchema);
