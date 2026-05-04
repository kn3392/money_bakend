import mongoose from 'mongoose';
import * as notificationService from '../services/notificationService.js';
import { AppError } from '../utils/AppError.js';

export async function listNotifications(req, res) {
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const unreadOnly = req.query.unreadOnly;
  const out = await notificationService.listNotifications(req.user._id, {
    page,
    limit,
    unreadOnly,
  });
  res.json({ success: true, ...out });
}

export async function getUnreadCount(req, res) {
  const count = await notificationService.unreadCount(req.user._id);
  res.json({ success: true, unreadCount: count });
}

export async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const doc = await notificationService.markRead(req.user._id, req.params.id);
  if (!doc) throw new AppError('Notification not found', 404);
  res.json({ success: true, notification: doc });
}

export async function markAllRead(req, res) {
  await notificationService.markAllRead(req.user._id);
  res.json({ success: true, message: 'All marked read' });
}

export async function removeNotification(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const r = await notificationService.removeNotification(req.user._id, req.params.id);
  if (!r) throw new AppError('Notification not found', 404);
  res.json({ success: true, message: 'Deleted' });
}
