import mongoose from 'mongoose';

const CATEGORY_TYPES = ['income', 'expense'];

const categorySchema = new mongoose.Schema(
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
      enum: CATEGORY_TYPES,
      required: true,
    },
    icon: {
      type: String,
      trim: true,
      maxlength: 64,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

categorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

export const CATEGORY_TYPE_VALUES = CATEGORY_TYPES;
export const Category = mongoose.model('Category', categorySchema);
