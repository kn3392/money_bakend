import mongoose from 'mongoose';

const NOTIFICATION_TYPES = [
  'budget_warning',
  'budget_crossed',
  'loan_due',
  'loan_overdue',
  'recurring_due',
  'no_entry_today',
  'goal_completed',
];

const PRIORITIES = ['low', 'medium', 'high'];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    relatedEntityType: { type: String, default: '', maxlength: 64 },
    relatedEntityId: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    priority: {
      type: String,
      enum: PRIORITIES,
      default: 'medium',
    },
    /** Same calendar day + type + entity prevents spam */
    dedupeKey: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string', $ne: '' } },
  }
);

export const NOTIFICATION_TYPE_VALUES = NOTIFICATION_TYPES;
export const Notification = mongoose.model('Notification', notificationSchema);
