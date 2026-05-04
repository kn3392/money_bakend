import mongoose from 'mongoose';
import { Tag } from '../models/Tag.js';
import * as tagService from '../services/tagService.js';
import { recordDetailedAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';

function snap(t) {
  if (!t) return null;
  const o = typeof t.toObject === 'function' ? t.toObject() : t;
  return { name: o.name, color: o.color, isActive: o.isActive };
}

export async function listTags(req, res) {
  const tags = await tagService.listTags(req.user._id);
  res.json({ success: true, tags });
}

export async function createTag(req, res) {
  const doc = await tagService.createTag(req.user._id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'create',
    entityType: 'tag',
    entityId: String(doc._id),
    oldValue: null,
    newValue: snap(doc),
    req,
  });
  res.status(201).json({ success: true, tag: doc });
}

export async function updateTag(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prevDoc = await Tag.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!prevDoc) throw new AppError('Tag not found', 404);
  const doc = await tagService.updateTag(req.user._id, req.params.id, req.body);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'edit',
    entityType: 'tag',
    entityId: String(doc._id),
    oldValue: snap(prevDoc),
    newValue: snap(doc),
    req,
  });
  res.json({ success: true, tag: doc });
}

export async function removeTag(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    throw new AppError('Invalid id', 400);
  const prevDoc = await Tag.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!prevDoc) throw new AppError('Tag not found', 404);
  await tagService.deleteTag(req.user._id, req.params.id);
  void recordDetailedAudit({
    userId: req.user._id,
    action: 'delete',
    entityType: 'tag',
    entityId: req.params.id,
    oldValue: snap(prevDoc),
    newValue: null,
    req,
  });
  res.json({ success: true, message: 'Tag deactivated' });
}
