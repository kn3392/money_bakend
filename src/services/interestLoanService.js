import InterestLoan from '../models/InterestLoan.js';
import mongoose from 'mongoose';

const toOid = (id) => {
  if (!id) return null;
  if (typeof id === 'string') {
    return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
  }
  return id;
};

/**
 * Calculate difference in months between two dates.
 */
function diffMonths(d1, d2) {
  let months;
  months = (d2.getFullYear() - d1.getFullYear()) * 12;
  months -= d1.getMonth();
  months += d2.getMonth();
  return months <= 0 ? 0 : months;
}

/**
 * Calculate End Date: Start Date + manualMonths
 */
export function calculateEndDate(startDate, manualMonths) {
  if (!manualMonths || manualMonths <= 0) return null;
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + Number(manualMonths));
  return end;
}

/**
 * Calculate Months Used
 */
export function calculateMonthsUsed(startDate, endDate, manualMonths) {
  if (manualMonths != null && manualMonths !== '') return Number(manualMonths);
  
  const start = new Date(startDate);
  const comparisonDate = endDate ? new Date(endDate) : new Date();
  
  return diffMonths(start, comparisonDate);
}

/**
 * Calculate Interest: Principal * (Monthly Rate / 100) * Months Used
 */
export function calculateInterest(principal, monthlyRate, monthsUsed) {
  return principal * (monthlyRate / 100) * monthsUsed;
}

/**
 * Recalculate all financial values for a loan object/doc.
 */
export function recalculateLoanData(data) {
  const principalAmount = Number(data.principalAmount || 0);
  const monthlyInterestRate = Number(data.monthlyInterestRate || 0);
  const startDate = data.startDate ? new Date(data.startDate) : new Date();
  const manualMonths = (data.manualMonths != null && data.manualMonths !== '') ? Number(data.manualMonths) : null;
  const receivedAmount = Number(data.receivedAmount || 0);

  // 1. End Date
  const endDate = calculateEndDate(startDate, manualMonths);

  // 2. Months Used
  const monthsUsed = calculateMonthsUsed(startDate, endDate, manualMonths);

  // 3. Interest Amount
  const interestAmount = calculateInterest(principalAmount, monthlyInterestRate, monthsUsed);

  // 4. Total Due
  const totalDue = principalAmount + interestAmount;

  // 5. Balance Amount
  const balanceAmount = totalDue - receivedAmount;

  // 6. Status
  let status = 'active';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const twentyDaysFromNow = new Date(today);
  twentyDaysFromNow.setDate(twentyDaysFromNow.getDate() + 20);

  if (balanceAmount <= 0) {
    status = 'done';
  } else if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    if (today >= end || twentyDaysFromNow >= end) {
      status = 'due';
    } else if (receivedAmount > 0) {
      status = 'partial_paid';
    }
  } else if (receivedAmount > 0) {
    status = 'partial_paid';
  }

  return {
    ...data,
    principalAmount,
    monthlyInterestRate,
    startDate,
    manualMonths,
    endDate,
    monthsUsed: Math.round(monthsUsed * 100) / 100,
    interestAmount: Math.round(interestAmount * 100) / 100,
    totalDue: Math.round(totalDue * 100) / 100,
    receivedAmount,
    balanceAmount: Math.round(balanceAmount * 100) / 100,
    status,
    pendingInterest: Math.max(0, Math.round((interestAmount - receivedAmount) * 100) / 100),
  };
}

export async function listInterestLoans(userId, filters = {}) {
  const query = { userId: toOid(userId) };
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.borrowerName = { $regex: filters.search, $options: 'i' };
  }

  const loans = await InterestLoan.find(query).sort({ startDate: -1 }).lean();
  
  return loans.map(loan => recalculateLoanData(loan));
}

export async function createInterestLoan(userId, body) {
  const data = recalculateLoanData({ ...body, userId: toOid(userId) });
  return InterestLoan.create(data);
}

export async function getInterestLoan(userId, id) {
  const loan = await InterestLoan.findOne({ _id: id, userId: toOid(userId) }).lean();
  if (!loan) return null;
  
  return recalculateLoanData(loan);
  return loan;
}

export async function updateInterestLoan(userId, id, body) {
  const loan = await InterestLoan.findOne({ _id: toOid(id), userId: toOid(userId) });
  if (!loan) return null;

  // Preserve payments and only update core fields
  const { payments, _id, userId: u, ...updatable } = body;
  
  const updatedData = recalculateLoanData({ ...loan.toObject(), ...updatable });
  
  // If the user manually updated receivedAmount to satisfy interest, trigger rollover
  if (updatedData.receivedAmount >= updatedData.interestAmount && updatedData.interestAmount > 0) {
    const excess = updatedData.receivedAmount - updatedData.interestAmount;
    if (excess > 0) {
      updatedData.principalAmount = Math.max(0, updatedData.principalAmount - excess);
    }
    updatedData.startDate = updatedData.endDate || new Date();
    updatedData.receivedAmount = 0;
    // Final recalculate after rollover
    const finalData = recalculateLoanData(updatedData);
    Object.assign(loan, finalData);
  } else {
    Object.assign(loan, updatedData);
  }
  
  return loan.save();
}

export async function collectInterest(userId, id, payload) {
  const loan = await InterestLoan.findOne({ _id: toOid(id), userId: toOid(userId) });
  if (!loan) return null;

  // Recalculate to get current period's stats
  const currentData = recalculateLoanData(loan.toObject());
  const interestDue = currentData.interestAmount;
  const receivedThisTime = Number(payload.amount);
  
  // Cumulative received for the current period
  const totalReceivedForPeriod = (loan.receivedAmount || 0) + receivedThisTime;

  // Add payment to history
  loan.payments.push({
    amount: receivedThisTime,
    date: payload.date ? new Date(payload.date) : new Date(),
    type: 'interest',
    periodStart: currentData.startDate,
    periodEnd: currentData.endDate || new Date(),
    remarks: payload.remarks || 'Interest Collected'
  });

  // Rollover logic: Trigger when total received (including previous partials) >= interest due
  if (totalReceivedForPeriod >= interestDue && interestDue > 0) {
    const excess = totalReceivedForPeriod - interestDue;
    
    // Deduct excess from principal
    if (excess > 0) {
      loan.principalAmount = Math.max(0, (loan.principalAmount || 0) - excess);
      loan.remarks = (loan.remarks || '') + `\n[Auto] ₹${excess.toLocaleString('en-IN')} deducted from principal on ${new Date().toLocaleDateString('en-GB')}`;
    }

    // Move to next period
    loan.startDate = currentData.endDate || new Date();
    
    // Reset received amount for the new period
    loan.receivedAmount = 0;
  } else {
    // Partial payment: Just add to receivedAmount, no date change
    loan.receivedAmount = totalReceivedForPeriod;
  }

  const updatedData = recalculateLoanData(loan.toObject());
  Object.assign(loan, updatedData);
  
  return loan.save();
}

export async function collectPrincipal(userId, id, payload) {
  const loan = await InterestLoan.findOne({ _id: toOid(id), userId: toOid(userId) });
  if (!loan) return null;

  const amount = Number(payload.amount);
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  // 1. Deduct from principal
  loan.principalAmount = Math.max(0, (loan.principalAmount || 0) - amount);

  // 2. Add to payment history
  loan.payments.push({
    amount: amount,
    date: payload.date ? new Date(payload.date) : new Date(),
    type: 'principal',
    remarks: payload.remarks || 'Principal Repayment'
  });

  // 3. Recalculate
  const updatedData = recalculateLoanData(loan.toObject());
  Object.assign(loan, updatedData);
  
  return loan.save();
}

export async function updateInterestPayment(userId, loanId, paymentId, payload) {
  const loan = await InterestLoan.findOne({ _id: toOid(loanId), userId: toOid(userId) });
  if (!loan) return null;

  const payment = loan.payments.id(paymentId);
  if (!payment) return null;

  const amountDiff = Number(payload.amount) - (payment.amount || 0);
  loan.receivedAmount = Math.max(0, (loan.receivedAmount || 0) + amountDiff);

  Object.assign(payment, {
    amount: Number(payload.amount),
    date: payload.date ? new Date(payload.date) : payment.date,
    remarks: payload.remarks || payment.remarks
  });

  const updatedData = recalculateLoanData(loan.toObject());
  Object.assign(loan, updatedData);
  
  return loan.save();
}

export async function deleteInterestPayment(userId, loanId, paymentId) {
  const loan = await InterestLoan.findOne({ _id: toOid(loanId), userId: toOid(userId) });
  if (!loan) return null;

  const payment = loan.payments.id(paymentId);
  if (!payment) return null;

  // 1. Subtract amount from receivedAmount
  loan.receivedAmount = Math.max(0, (loan.receivedAmount || 0) - (payment.amount || 0));

  // 2. Revert dates if this was a rollover payment
  if (payment.periodEnd && loan.startDate && 
      new Date(payment.periodEnd).getTime() === new Date(loan.startDate).getTime()) {
    loan.startDate = payment.periodStart;
  }

  // 3. Remove payment
  loan.payments.pull(paymentId);

  const updatedData = recalculateLoanData(loan.toObject());
  Object.assign(loan, updatedData);
  
  return loan.save();
}

export async function deleteInterestLoan(userId, id) {
  const loanId = toOid(id);
  const uId = toOid(userId);
  if (!loanId || !uId) return null;
  return InterestLoan.findOneAndDelete({ _id: loanId, userId: uId });
}

export async function getInterestDashboard(userId) {
  const loans = await listInterestLoans(userId);
  
  const summary = {
    totalPrincipal: 0,
    totalInterest: 0,
    totalPendingInterest: 0,
    totalReceived: 0,
    totalBalance: 0,
    count: loans.length,
    active: 0,
    closed: 0,
    overdue: 0,
    partial: 0,
    uniqueBorrowers: new Set().size
  };

  const borrowerNames = new Set();
  
  loans.forEach(l => {
    summary.totalPrincipal += l.principalAmount;
    summary.totalInterest += l.interestAmount;
    summary.totalPendingInterest += l.pendingInterest;
    summary.totalReceived += l.receivedAmount;
    summary.totalBalance += l.balanceAmount;
    
    if (l.status === 'active') summary.active++;
    else if (l.status === 'closed') summary.closed++;
    else if (l.status === 'overdue') summary.overdue++;
    else if (l.status === 'partial_paid') summary.partial++;
    
    borrowerNames.add(l.borrowerName);
  });

  summary.uniqueBorrowers = borrowerNames.size;
  summary.totalPrincipal = Math.round(summary.totalPrincipal * 100) / 100;
  summary.totalInterest = Math.round(summary.totalInterest * 100) / 100;
  summary.totalPendingInterest = Math.round(summary.totalPendingInterest * 100) / 100;
  summary.totalReceived = Math.round(summary.totalReceived * 100) / 100;
  summary.totalBalance = Math.round(summary.totalBalance * 100) / 100;

  return summary;
}

export async function getBorrowerSummary(userId) {
  const loans = await listInterestLoans(userId);
  const summaryMap = {};

  loans.forEach(l => {
    if (!summaryMap[l.borrowerName]) {
      summaryMap[l.borrowerName] = {
        borrowerName: l.borrowerName,
        totalPrincipal: 0,
        totalInterest: 0,
        totalPendingInterest: 0,
        totalReceived: 0,
        totalBalance: 0,
        loanCount: 0,
        statuses: new Set()
      };
    }
    
    const s = summaryMap[l.borrowerName];
    s.totalPrincipal += l.principalAmount;
    s.totalInterest += l.interestAmount;
    s.totalPendingInterest += l.pendingInterest;
    s.totalReceived += l.receivedAmount;
    s.totalBalance += l.balanceAmount;
    s.loanCount++;
    s.statuses.add(l.status);
  });

  return Object.values(summaryMap).map(s => ({
    ...s,
    totalPrincipal: Math.round(s.totalPrincipal * 100) / 100,
    totalInterest: Math.round(s.totalInterest * 100) / 100,
    totalPendingInterest: Math.round(s.totalPendingInterest * 100) / 100,
    totalReceived: Math.round(s.totalReceived * 100) / 100,
    totalBalance: Math.round(s.totalBalance * 100) / 100,
    status: s.statuses.has('overdue') ? 'overdue' : 
            s.statuses.has('active') ? 'active' :
            s.statuses.has('partial_paid') ? 'partial_paid' : 'closed'
  }));
}
