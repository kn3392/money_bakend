import { Router } from 'express';
import * as interestLoanController from '../controllers/interestLoanController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', interestLoanController.listLoans);
router.post('/', interestLoanController.createLoan);
router.get('/dashboard', interestLoanController.getDashboard);
router.get('/borrower-summary', interestLoanController.getBorrowerSummary);
router.get('/export/excel', interestLoanController.exportExcel);
router.get('/export/pdf', interestLoanController.exportPdf);

router.get('/:id', interestLoanController.getLoan);
router.post('/:id/collect-interest', interestLoanController.collectInterest);
router.post('/:id/collect-principal', interestLoanController.collectPrincipal);
router.put('/:loanId/payments/:paymentId', interestLoanController.updatePayment);
router.delete('/:loanId/payments/:paymentId', interestLoanController.deletePayment);
router.put('/:id', interestLoanController.updateLoan);
router.delete('/:id', interestLoanController.deleteLoan);

export default router;
