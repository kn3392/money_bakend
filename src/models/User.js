import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [120, 'Name is too long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    pin: {
      type: String,
      select: false,
      default: undefined,
    },
    isPinEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function hashSecrets(next) {
  try {
    if (this.isModified('password')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
    if (this.isModified('pin')) {
      if (this.pin == null || this.pin === '') {
        this.pin = undefined;
      } else if (typeof this.pin === 'string') {
        if (!this.pin.startsWith('$2')) {
          this.pin = await bcrypt.hash(this.pin, 12);
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Safe projection for API responses — never includes password or pin.
 */
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    isPinEnabled: this.isPinEnabled,
    createdAt: this.createdAt ? this.createdAt.toISOString() : undefined,
  };
};

export const User = mongoose.model('User', userSchema);
