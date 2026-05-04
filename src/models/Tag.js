import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema(
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
      maxlength: 64,
    },
    color: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

tagSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Tag = mongoose.model('Tag', tagSchema);
