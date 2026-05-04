import * as interestLoanService from '../services/interestLoanService.js';
import { interestLoansToExcelBuffer } from '../utils/excelGenerator.js';
import { streamInterestBookPdf } from '../utils/pdfGenerator.js';

export async function listLoans(req, res) {
  try {
    const { status, search } = req.query;
    const loans = await interestLoanService.listInterestLoans(req.user._id, { status, search });
    res.json({ success: true, loans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function createLoan(req, res) {
  try {
    const loan = await interestLoanService.createInterestLoan(req.user._id, req.body);
    res.status(201).json({ success: true, loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function getLoan(req, res) {
  try {
    const loan = await interestLoanService.getInterestLoan(req.user._id, req.params.id);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateLoan(req, res) {
  try {
    const loan = await interestLoanService.updateInterestLoan(req.user._id, req.params.id, req.body);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function deleteLoan(req, res) {
  try {
    const loan = await interestLoanService.deleteInterestLoan(req.user._id, req.params.id);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function collectInterest(req, res) {
  try {
    const loan = await interestLoanService.collectInterest(req.user._id, req.params.id, req.body);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function collectPrincipal(req, res) {
  try {
    const loan = await interestLoanService.collectPrincipal(req.user._id, req.params.id, req.body);
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function updatePayment(req, res) {
  try {
    const loan = await interestLoanService.updateInterestPayment(
      req.user._id, 
      req.params.loanId, 
      req.params.paymentId, 
      req.body
    );
    if (!loan) return res.status(404).json({ success: false, message: 'Payment or Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

export async function deletePayment(req, res) {
  try {
    const loan = await interestLoanService.deleteInterestPayment(
      req.user._id, 
      req.params.loanId, 
      req.params.paymentId
    );
    if (!loan) return res.status(404).json({ success: false, message: 'Payment or Loan not found' });
    res.json({ success: true, loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getDashboard(req, res) {
  try {
    const summary = await interestLoanService.getInterestDashboard(req.user._id);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getBorrowerSummary(req, res) {
  try {
    const summary = await interestLoanService.getBorrowerSummary(req.user._id);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function exportExcel(req, res) {
  try {
    const loans = await interestLoanService.listInterestLoans(req.user._id);
    const buffer = await interestLoansToExcelBuffer(loans);
    
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=InterestBook.xlsx'
    );
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function exportPdf(req, res) {
  try {
    const [loans, summary, borrowers] = await Promise.all([
      interestLoanService.listInterestLoans(req.user._id),
      interestLoanService.getInterestDashboard(req.user._id),
      interestLoanService.getBorrowerSummary(req.user._id)
    ]);

    streamInterestBookPdf(res, {
      title: 'Interest Book Report',
      summary,
      borrowers,
      loans
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}
