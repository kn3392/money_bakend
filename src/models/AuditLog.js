import mongoose from 'mongoose';

/**
 * Append-only audit trail. Do not store passwords, PINs, or tokens in oldValue/newValue/meta.
 */
const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /** create | update | delete | undo | restore | export | login | logout | ... */
    action: { type: String, required: true, index: true },
    resource: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    entityType: { type: String, default: '', index: true },
    entityId: { type: String, default: '', index: true },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
