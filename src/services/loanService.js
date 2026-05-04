import mongoose from 'mongoose';
import { Loan } from '../models/Loan.js';
import { PersonLedger } from '../models/PersonLedger.js';
import { AppError } from '../utils/AppError.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/** 
 * Calculate total due including accrued interest.
 * We calculate based on the time elapsed since startDate.
 */
export function calculateTotalDue(doc) {
  const principal = Number(doc.principalAmount ?? 0);
  const rate = Number(doc.interestRate ?? 0) / 100;
  if (!principal || !rate || doc.interestType === 'none') return principal;

  const start = new Date(doc.startDate ?? doc.createdAt);
  const now = new Date();
  const diffMs = Math.max(0, now - start);
  
  // Convert duration to years
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  
  if (doc.interestType === 'simple') {
    // Simple Interest: P * (1 + r*t)
    // frequency (monthly vs yearly) dictates what 'rate' means
    const t = doc.interestFrequency === 'monthly' ? years * 12 : years;
    return principal * (1 + rate * t);
  }

  if (doc.interestType === 'compound') {
    /**
     * Compound Interest: A = P * (1 + r/n)^(n*t)
     * n = compounding frequency
     */
    let n = 12; // monthly
    if (doc.compoundingFrequency === 'quarterly') n = 4;
    if (doc.compoundingFrequency === 'half-yearly') n = 2;
    if (doc.compoundingFrequency === 'yearly') n = 1;

    // t is always in years for the standard formula if rate is annual.
    // If rate is monthly, we adjust.
    const effectiveRate = doc.interestFrequency === 'monthly' ? rate * 12 : rate;
    const t = years;
    
    return principal * Math.pow(1 + effectiveRate / n, n * t);
  }

  return principal;
}

export function loanRemaining(doc) {
  const total = calculateTotalDue(doc);
  return Math.max(0, total - (doc.paidAmount ?? 0));
}

export async function listLoans(userId) {
  const rows = await Loan.find({ userId: toOid(userId) })
    .populate('personId', 'name balance totalGiven totalTaken')
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();
  return rows.map((r) => {
    const totalDue = calculateTotalDue(r);
    return {
      ...r,
      totalDue: Math.round(totalDue * 100) / 100,
      accruedInterest: Math.round((totalDue - r.principalAmount) * 100) / 100,
      remainingAmount: Math.round((totalDue - r.paidAmount) * 100) / 100,
    };
  });
}

export async function createLoan(userId, body) {
  const person = await PersonLedger.findOne({
    _id: body.personId,
    userId: toOid(userId),
    isActive: true,
  });
  if (!person) throw new AppError('Person not found', 400);
  return Loan.create({
    userId: toOid(userId),
    personId: body.personId,
    type: body.type,
    principalAmount: Number(body.principalAmount),
    paidAmount: body.paidAmount != null ? Number(body.paidAmount) : 0,
    interestRate: Number(body.interestRate ?? 0),
    interestType: body.interestType || 'none',
    interestFrequency: body.interestFrequency || 'monthly',
    compoundingFrequency: body.compoundingFrequency || 'monthly',
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    reminderDate: body.reminderDate ? new Date(body.reminderDate) : null,
    note: body.note ? String(body.note).slice(0, 2000) : '',
    status: 'pending',
  });
}

export async function getLoan(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  const l = await Loan.findOne({ _id: id, userId: toOid(userId) }).populate(
    'personId',
    'name'
  );
  if (!l) throw new AppError('Loan not found', 404);
  const o = l.toObject();
  const totalDue = calculateTotalDue(o);
  return {
    ...o,
    totalDue: Math.round(totalDue * 100) / 100,
    accruedInterest: Math.round((totalDue - o.principalAmount) * 100) / 100,
    remainingAmount: Math.round((totalDue - o.paidAmount) * 100) / 100,
  };
}

export async function updateLoan(userId, id, body) {
  const l = await Loan.findOne({ _id: id, userId: toOid(userId) });
  if (!l) throw new AppError('Loan not found', 404);
  
  if (body.principalAmount != null) l.principalAmount = Number(body.principalAmount);
  if (body.paidAmount != null) l.paidAmount = Number(body.paidAmount);
  if (body.interestRate != null) l.interestRate = Number(body.interestRate);
  if (body.interestType != null) l.interestType = body.interestType;
  if (body.interestFrequency != null) l.interestFrequency = body.interestFrequency;
  if (body.compoundingFrequency != null) l.compoundingFrequency = body.compoundingFrequency;
  if (body.startDate != null) l.startDate = new Date(body.startDate);
  
  if (body.dueDate !== undefined) l.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.reminderDate !== undefined)
    l.reminderDate = body.reminderDate ? new Date(body.reminderDate) : null;
  if (body.note != null) l.note = String(body.note).slice(0, 2000);
  if (body.status != null) l.status = body.status;
  
  await l.save();
  return getLoan(userId, id);
}

export async function deleteLoan(userId, id) {
  const l = await Loan.findOne({ _id: id, userId: toOid(userId) });
  if (!l) throw new AppError('Loan not found', 404);
  await l.deleteOne();
}

export async function addLoanPayment(userId, id, amount) {
  const l = await Loan.findOne({ _id: id, userId: toOid(userId) });
  if (!l) throw new AppError('Loan not found', 404);
  const pay = Number(amount);
  if (!Number.isFinite(pay) || pay <= 0)
    throw new AppError('Payment must be greater than 0', 400);
  l.paidAmount = Math.min(l.principalAmount, l.paidAmount + pay);
  await l.save();
  return getLoan(userId, id);
}

export async function loansReport(userId) {
  const loans = await listLoans(userId);
  let totalGivenPrincipal = 0;
  let totalTakenPrincipal = 0;
  let totalAccruedInterestGiven = 0;
  let totalAccruedInterestTaken = 0;
  let totalPending = 0;
  const overdueLoans = [];
  const personMap = {};
  
  for (const l of loans) {
    const rem = l.remainingAmount;
    const interest = l.accruedInterest ?? 0;
    
    if (l.type === 'given') {
      totalGivenPrincipal += l.principalAmount;
      totalAccruedInterestGiven += interest;
    } else {
      totalTakenPrincipal += l.principalAmount;
      totalAccruedInterestTaken += interest;
    }
    
    totalPending += rem;
    if (l.status === 'overdue') overdueLoans.push(l);
    
    const pid = String(l.personId?._id ?? l.personId);
    if (!personMap[pid])
      personMap[pid] = {
        person: l.personId,
        givenOutstanding: 0,
        takenOutstanding: 0,
        givenPrincipal: 0,
        takenPrincipal: 0,
        givenInterest: 0,
        takenInterest: 0,
      };
      
    if (l.type === 'given') {
      personMap[pid].givenOutstanding += rem;
      personMap[pid].givenPrincipal += l.principalAmount;
      personMap[pid].givenInterest += interest;
    } else {
      personMap[pid].takenOutstanding += rem;
      personMap[pid].takenPrincipal += l.principalAmount;
      personMap[pid].takenInterest += interest;
    }
  }
  
  return {
    totalGivenPrincipal: Math.round(totalGivenPrincipal * 100) / 100,
    totalTakenPrincipal: Math.round(totalTakenPrincipal * 100) / 100,
    totalAccruedInterestGiven: Math.round(totalAccruedInterestGiven * 100) / 100,
    totalAccruedInterestTaken: Math.round(totalAccruedInterestTaken * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
    overdueLoans,
    personWiseSummary: Object.values(personMap),
    loans,
  };
}
