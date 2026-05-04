import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import logger from '../utils/logger.js';

/**
 * Create notification; duplicate dedupeKey for same user is ignored (unique index).
 */
export async function createNotification(doc) {
  try {
    return await Notification.create(doc);
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      return null;
    }
    logger.warn('Notification create failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function listNotifications(userId, { page = 1, limit = 20, unreadOnly }) {
  const uid = typeof userId === 'string' ? userId : userId.toString();
  const q = { userId };
  if (unreadOnly === true || unreadOnly === 'true') q.isRead = false;
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const lim = Math.min(100, Math.max(1, limit));
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    Notification.countDocuments(q),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return { items, total, page: Math.max(1, page), limit: lim, unreadCount };
}

export async function unreadCount(userId) {
  return Notification.countDocuments({
    userId,
    isRead: false,
  });
}

export async function markRead(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { $set: { isRead: true } },
    { new: true }
  ).lean();
}

export async function markAllRead(userId) {
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
}

export async function removeNotification(userId, id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Notification.findOneAndDelete({ _id: id, userId });
}
