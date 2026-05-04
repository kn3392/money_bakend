import mongoose from 'mongoose';
import InterestLoan from './src/models/InterestLoan.js';
import { recalculateLoanData } from './src/services/interestLoanService.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixData() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  const loans = await InterestLoan.find({});
  let fixedCount = 0;

  for (const loan of loans) {
    const data = recalculateLoanData(loan.toObject());
    
    // Check if cumulative received amount satisfies interest
    if (data.receivedAmount >= data.interestAmount && data.interestAmount > 0) {
      console.log(`Fixing loan for ${data.borrowerName}: Rollover triggered.`);
      
      const excess = data.receivedAmount - data.interestAmount;
      if (excess > 0) {
        loan.principalAmount = Math.max(0, loan.principalAmount - excess);
      }
      
      // Move to next period
      loan.startDate = data.endDate || new Date();
      loan.receivedAmount = 0;
      
      const finalData = recalculateLoanData(loan.toObject());
      Object.assign(loan, finalData);
      
      await loan.save();
      fixedCount++;
    }
  }

  console.log(`Done. Fixed ${fixedCount} loans.`);
  await mongoose.disconnect();
}

fixData().catch(console.error);
