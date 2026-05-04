import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 1900, max: 2999 },
    budgetAmount: {
      type: Number,
      required: true,
      min: [0.01, 'budgetAmount must be greater than 0'],
    },
    alertAtPercent: {
      type: Number,
      default: 80,
      min: 1,
      max: 100,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

budgetSchema.index(
  { userId: 1, categoryId: 1, month: 1, year: 1 },
  { unique: true }
);

export const Budget = mongoose.model('Budget', budgetSchema);
