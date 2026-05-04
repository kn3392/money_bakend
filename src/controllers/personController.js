import mongoose from 'mongoose';
import { PersonLedger } from '../models/PersonLedger.js';
import { AppError } from '../utils/AppError.js';
import { listPersonTransactionsPopulated } from '../services/personLedgerService.js';

function toPublic(person) {
  return {
    id: person._id.toString(),
    name: person.name,
    linkedAccountId: person.linkedAccountId?.toString() ?? null,
    totalGiven: person.totalGiven,
    totalTaken: person.totalTaken,
    balance: person.balance,
    isActive: person.isActive,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

function ensureOwned(doc, userId) {
  if (!doc) throw new AppError('Person not found', 404);
  if (String(doc.userId) !== String(userId)) throw new AppError('Person not found', 404);
}

export async function listPersons(req, res) {
  const rows = await PersonLedger.find({
    userId: req.user._id,
    isActive: true,
  })
    .sort({ name: 1 })
    .lean();

  res.json({
    success: true,
    persons: rows.map((p) => toPublic(p)),
    /**
     * balance = totalTaken - totalGiven
     * Negative → you gave more than you received (“pending” amount they still owe).
     * Positive → you received more than you gave.
     */
    balanceConventionHelp:
      'balance = totalTaken - totalGiven. Negative ⇒ net given (outstanding with person). Positive ⇒ net received.',
  });
}

export async function createPerson(req, res) {
  const { name, linkedAccountId } = req.body;

  try {
    const doc = await PersonLedger.create({
      userId: req.user._id,
      name: String(name).trim(),
      linkedAccountId: linkedAccountId
        ? new mongoose.Types.ObjectId(linkedAccountId)
        : undefined,
      isActive: true,
    });

    res.status(201).json({ success: true, person: toPublic(doc) });
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError('A person with this name already exists', 400);
    }
    throw err;
  }
}

export async function getPerson(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);

  const person = await PersonLedger.findOne({
    _id: id,
    userId: req.user._id,
  }).lean();
  ensureOwned(person, req.user._id);

  const txns = await listPersonTransactionsPopulated(req.user._id.toString(), id);

  res.json({
    success: true,
    person: toPublic({ ...person, _id: person._id }),
    transactions: txns,
    balanceConventionHelp:
      'Negative balance ⇒ you lent more than you got back from this person. Positive ⇒ net money received.',
  });
}

export async function updatePerson(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);

  const doc = await PersonLedger.findById(id);
  ensureOwned(doc, req.user._id);

  if (req.body.name !== undefined) doc.name = String(req.body.name).trim();
  if (req.body.linkedAccountId !== undefined) {
    doc.linkedAccountId = req.body.linkedAccountId
      ? new mongoose.Types.ObjectId(req.body.linkedAccountId)
      : undefined;
  }
  if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive);

  try {
    await doc.save();
  } catch (err) {
    if (err && typeof err === 'object' && err.code === 11000) {
      throw new AppError('A person with this name already exists', 400);
    }
    throw err;
  }

  res.json({ success: true, person: toPublic(doc) });
}

/** Soft-delete */
export async function deletePerson(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);

  const doc = await PersonLedger.findById(id);
  ensureOwned(doc, req.user._id);
  doc.isActive = false;
  await doc.save();

  res.json({ success: true, message: 'Person deactivated', person: toPublic(doc) });
}
