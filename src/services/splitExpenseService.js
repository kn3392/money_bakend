import mongoose from 'mongoose';
import { SplitExpense } from '../models/SplitExpense.js';
import { Account } from '../models/Account.js';
import { PersonLedger } from '../models/PersonLedger.js';
import { AppError } from '../utils/AppError.js';
import { getISTDateKey } from '../utils/financialYear.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

async function assertPersons(userId, personIds) {
  const uid = toOid(userId);
  for (const pid of personIds) {
    const p = await PersonLedger.findOne({
      _id: pid,
      userId: uid,
      isActive: true,
    });
    if (!p) throw new AppError('Invalid participant person', 400);
  }
}

export async function listSplits(userId) {
  return SplitExpense.find({ userId: toOid(userId) })
    .populate('payerAccountId', 'name')
    .populate('participants.personId', 'name')
    .sort({ dateKey: -1 })
    .lean();
}

export async function createSplit(userId, body) {
  const uid = toOid(userId);
  const acc = await Account.findOne({
    _id: body.payerAccountId,
    userId: uid,
    isActive: true,
  });
  if (!acc) throw new AppError('Payer account not found', 400);

  const date = body.date ? new Date(body.date) : new Date();
  const dateKey = getISTDateKey(date);
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0)
    throw new AppError('Invalid totalAmount', 400);

  const participantInputs = Array.isArray(body.participants) ? body.participants : [];
  if (participantInputs.length === 0)
    throw new AppError('At least one participant required', 400);

  const personIds = participantInputs.map((p) => p.personId);
  await assertPersons(userId, personIds);

  /** @type {{ personId: unknown; shareAmount: number; paidAmount?: number; status?: string }[]} */
  let participants = [];

  if (body.splitType === 'equal') {
    const share = Math.round((totalAmount / participantInputs.length) * 100) / 100;
    let sum = 0;
    participants = participantInputs.map((p, i) => {
      const isLast = i === participantInputs.length - 1;
      const amt = isLast ? totalAmount - sum : share;
      sum += amt;
      return {
        personId: toOid(p.personId),
        shareAmount: amt,
        paidAmount: 0,
        status: 'pending',
      };
    });
    const check = participants.reduce((a, b) => a + b.shareAmount, 0);
    if (Math.abs(check - totalAmount) > 0.02)
      throw new AppError('Equal split rounding error', 400);
  } else if (body.splitType === 'custom') {
    participants = participantInputs.map((p) => ({
      personId: toOid(p.personId),
      shareAmount: Number(p.shareAmount),
      paidAmount: 0,
      status: 'pending',
    }));
    const sum = participants.reduce((a, b) => a + b.shareAmount, 0);
    if (Math.abs(sum - totalAmount) > 0.02)
      throw new AppError('Custom shares must sum to totalAmount', 400);
  } else {
    throw new AppError('splitType must be equal or custom', 400);
  }

  return SplitExpense.create({
    userId: uid,
    title: String(body.title).trim(),
    totalAmount,
    payerAccountId: body.payerAccountId,
    payerPersonId: body.payerPersonId || null,
    splitType: body.splitType,
    participants,
    linkedTransactionId: body.linkedTransactionId || null,
    date,
    dateKey,
    note: body.note ? String(body.note).slice(0, 2000) : '',
    status: 'active',
  });
}

export async function getSplit(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const s = await SplitExpense.findOne({ _id: id, userId: toOid(userId) })
    .populate('payerAccountId', 'name')
    .populate('participants.personId', 'name');
  if (!s) throw new AppError('Split not found', 404);
  return s;
}

export async function updateSplit(userId, id, body) {
  const s = await SplitExpense.findOne({ _id: id, userId: toOid(userId) });
  if (!s) throw new AppError('Split not found', 404);
  if (s.status !== 'active') throw new AppError('Cannot edit settled split', 400);
  if (body.title != null) s.title = String(body.title).trim();
  if (body.note != null) s.note = String(body.note).slice(0, 2000);
  if (body.status != null) s.status = body.status;
  await s.save();
  return getSplit(userId, id);
}

export async function deleteSplit(userId, id) {
  const s = await SplitExpense.findOne({ _id: id, userId: toOid(userId) });
  if (!s) throw new AppError('Split not found', 404);
  s.status = 'cancelled';
  await s.save();
}

export async function settleParticipant(userId, splitId, participantSubId, amount) {
  const s = await SplitExpense.findOne({ _id: splitId, userId: toOid(userId) });
  if (!s) throw new AppError('Split not found', 404);
  const pay = Number(amount);
  if (!Number.isFinite(pay) || pay <= 0)
    throw new AppError('Amount must be greater than 0', 400);
  const part = s.participants.id(participantSubId);
  if (!part) throw new AppError('Participant not found', 400);
  part.paidAmount = Math.min(part.shareAmount, part.paidAmount + pay);
  if (part.paidAmount >= part.shareAmount) part.status = 'settled';
  else if (part.paidAmount > 0) part.status = 'partially_paid';
  const allSettled = s.participants.every((p) => p.status === 'settled');
  if (allSettled) s.status = 'settled';
  await s.save();
  return getSplit(userId, splitId);
}

export async function splitsReport(userId) {
  const rows = await SplitExpense.find({
    userId: toOid(userId),
    status: 'active',
  })
    .populate('participants.personId', 'name')
    .lean();
  const personPending = {};
  for (const s of rows) {
    for (const p of s.participants) {
      const owed = p.shareAmount - p.paidAmount;
      if (owed <= 0) continue;
      const pid = String(p.personId?._id ?? p.personId);
      personPending[pid] = (personPending[pid] || 0) + owed;
    }
  }
  return {
    activeSplits: rows,
    personWisePending: Object.entries(personPending).map(([personId, amount]) => ({
      personId,
      pendingAmount: amount,
    })),
  };
}
