import mongoose from 'mongoose';
import { Tag } from '../models/Tag.js';
import { AppError } from '../utils/AppError.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export async function listTags(userId) {
  return Tag.find({ userId: toOid(userId), isActive: true })
    .sort({ name: 1 })
    .lean();
}

export async function createTag(userId, body) {
  try {
    return await Tag.create({
      userId: toOid(userId),
      name: String(body.name).trim(),
      color: body.color ? String(body.color).slice(0, 32) : '',
    });
  } catch (e) {
    if (e?.code === 11000) throw new AppError('Tag name already exists', 400);
    throw e;
  }
}

export async function updateTag(userId, id, body) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const t = await Tag.findOne({ _id: id, userId: toOid(userId) });
  if (!t) throw new AppError('Tag not found', 404);
  if (body.name != null) t.name = String(body.name).trim();
  if (body.color != null) t.color = String(body.color).slice(0, 32);
  if (body.isActive != null) t.isActive = Boolean(body.isActive);
  try {
    await t.save();
  } catch (e) {
    if (e?.code === 11000) throw new AppError('Tag name already exists', 400);
    throw e;
  }
  return t;
}

export async function deleteTag(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const t = await Tag.findOne({ _id: id, userId: toOid(userId) });
  if (!t) throw new AppError('Tag not found', 404);
  t.isActive = false;
  await t.save();
}

export async function assertTagsOwned(userId, tagIds) {
  if (!tagIds?.length) return;
  const ids = tagIds.map((x) => toOid(x));
  const n = await Tag.countDocuments({
    userId: toOid(userId),
    _id: { $in: ids },
    isActive: true,
  });
  if (n !== ids.length) throw new AppError('One or more tags are invalid', 400);
}
