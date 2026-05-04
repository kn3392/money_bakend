import mongoose from 'mongoose';
import { Category } from '../models/Category.js';
import { AppError } from '../utils/AppError.js';

function toPublicCategory(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    type: doc.type,
    icon: doc.icon ?? '',
    color: doc.color ?? '',
    isDefault: doc.isDefault,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function ensureOwned(doc, userId) {
  if (!doc) throw new AppError('Category not found', 404);
  if (String(doc.userId) !== String(userId)) {
    throw new AppError('Category not found', 404);
  }
}

/**
 * GET /api/categories?type=income|expense
 */
export async function listCategories(req, res) {
  const { type } = req.query;
  const filter = {
    userId: req.user._id,
    isActive: true,
  };
  if (type === 'income' || type === 'expense') {
    filter.type = type;
  }

  const rows = await Category.find(filter).sort({ type: 1, name: 1 });

  res.json({
    success: true,
    categories: rows.map(toPublicCategory),
  });
}

/**
 * POST /api/categories
 */
export async function createCategory(req, res) {
  const { name, type, icon, color, isDefault } = req.body;

  try {
    const doc = await Category.create({
      userId: req.user._id,
      name: String(name).trim(),
      type,
      icon: icon ? String(icon).trim() : '',
      color: color ? String(color).trim() : '',
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    res.status(201).json({
      success: true,
      category: toPublicCategory(doc),
    });
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError(
        'A category with this name and type already exists',
        400
      );
    }
    throw err;
  }
}

/**
 * PUT /api/categories/:id
 */
export async function updateCategory(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid category id', 400);
  }

  const doc = await Category.findById(id);
  ensureOwned(doc, req.user._id);

  const { name, type, icon, color, isDefault, isActive } = req.body;

  if (name !== undefined) doc.name = String(name).trim();
  if (type !== undefined) doc.type = type;
  if (icon !== undefined) doc.icon = String(icon).trim();
  if (color !== undefined) doc.color = String(color).trim();
  if (isDefault !== undefined) doc.isDefault = Boolean(isDefault);
  if (isActive !== undefined) doc.isActive = Boolean(isActive);

  try {
    await doc.save();
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError(
        'A category with this name and type already exists',
        400
      );
    }
    throw err;
  }

  res.json({
    success: true,
    category: toPublicCategory(doc),
  });
}

/**
 * DELETE /api/categories/:id — soft delete
 */
export async function deleteCategory(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid category id', 400);
  }

  const doc = await Category.findById(id);
  ensureOwned(doc, req.user._id);

  doc.isActive = false;
  await doc.save();

  res.json({
    success: true,
    message: 'Category deactivated',
    category: toPublicCategory(doc),
  });
}
