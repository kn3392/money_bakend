import mongoose from 'mongoose';

const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'person', 'other'];

const accountSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ACCOUNT_TYPES,
      required: true,
    },
    /** Opening balance for the account (set at creation; FY rollover can adjust later). */
    openingBalance: {
      type: Number,
      default: 0,
    },
    /** Cached running balance — updated when transactions post (Phase 5). */
    currentBalance: {
      type: Number,
      default: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { timestamps: true }
);

accountSchema.index({ userId: 1, name: 1 }, { unique: true });

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES;
export const Account = mongoose.model('Account', accountSchema);
