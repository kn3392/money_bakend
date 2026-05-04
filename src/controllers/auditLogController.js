import mongoose from 'mongoose';
import { listAuditLogs, getAuditLog } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

export async function listLogs(req, res) {
  const out = await listAuditLogs(req.user._id, {
    page: req.query.page,
    limit: req.query.limit,
    action: req.query.action,
    entityType: req.query.entityType,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  });
  res.json({ success: true, ...out });
}

export async function getLog(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const doc = await getAuditLog(req.user._id, req.params.id);
  if (!doc) throw new AppError('Audit log not found', 404);
  res.json({ success: true, auditLog: doc });
}
