import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

function sanitizeSnapshot(obj) {
  if (obj == null) return obj;
  try {
    const s = JSON.parse(JSON.stringify(obj));
    const redact = (v) => {
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) {
          const lk = k.toLowerCase();
          if (
            lk.includes('password') ||
            lk.includes('pin') ||
            lk === 'token' ||
            lk === 'jwt'
          ) {
            v[k] = '[redacted]';
          } else redact(v[k]);
        }
      }
    };
    redact(s);
    return s;
  } catch {
    return undefined;
  }
}

/**
 * Legacy simple audit row.
 */
export async function recordAudit({
  userId = null,
  action,
  resource = '',
  meta = {},
  req,
}) {
  if (!env.AUDIT_LOG_ENABLED || !action) return;
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      meta: sanitizeSnapshot(meta) ?? {},
      entityType: '',
      entityId: resource || '',
      ip: req?.ip ?? '',
      userAgent: req?.get?.('user-agent') ?? '',
    });
  } catch (err) {
    logger.warn('Audit log write failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Detailed audit (entity + optional snapshots). Never throws.
 */
export async function recordDetailedAudit({
  userId = null,
  action,
  entityType = '',
  entityId = '',
  oldValue,
  newValue,
  meta = {},
  req,
}) {
  if (!env.AUDIT_LOG_ENABLED || !action) return;
  try {
    await AuditLog.create({
      userId,
      action,
      resource: entityId,
      meta: sanitizeSnapshot(meta) ?? {},
      entityType,
      entityId,
      oldValue: sanitizeSnapshot(oldValue),
      newValue: sanitizeSnapshot(newValue),
      ip: req?.ip ?? '',
      userAgent: req?.get?.('user-agent') ?? '',
    });
  } catch (err) {
    logger.warn('Detailed audit log write failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listAuditLogs(userId, query) {
  const uid = toOid(userId);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
  const skip = (page - 1) * limit;
  const filter = { userId: uid };
  if (query.action) filter.action = String(query.action);
  if (query.entityType) filter.entityType = String(query.entityType);
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 0 };
}

export async function getAuditLog(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return AuditLog.findOne({ _id: id, userId: toOid(userId) }).lean();
}

function toOid(userId) {
  return typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
}
