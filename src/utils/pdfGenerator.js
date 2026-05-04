import PDFDocument from 'pdfkit';

function money(n) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Streams a simple ledger PDF to Express res (UTF-8 text; Gujarati may need embedding a font separately).
 */
export function streamLedgerPdf(
  res,
  {
    title,
    subtitle = '',
    openingBalance = 0,
    closingBalance = 0,
    totalIncome = 0,
    totalExpense = 0,
    rows,
  }
) {
  const doc = new PDFDocument({
    margins: { top: 50, bottom: 50, left: 52, right: 52 },
    size: 'A4',
    info: {
      Title: title,
      Author: 'SmartKhata',
    },
  });
  res.setHeader(
    'Content-Type',
    'application/pdf'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${String(title || 'smartkhata')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 120)}.pdf"`
  );

  doc.pipe(res);
  doc.fontSize(18).fillColor('#0f172a').text(title, { underline: false });
  if (subtitle)
    doc
      .fontSize(10)
      .fillColor('#475569')
      .moveDown(0.35)
      .text(subtitle, { paragraphGap: 4 });
  doc.moveDown();

  doc
    .fontSize(11)
    .fillColor('#0f172a')
    .text(`Opening · ₹ ${money(openingBalance)}`)
    .text(`Income   · ₹ ${money(totalIncome)}`)
    .text(`Expense · ₹ ${money(totalExpense)}`)
    .text(`Closing · ₹ ${money(closingBalance)}`)
    .moveDown();

  doc.fontSize(10).fillColor('#334155');
  for (const r of rows) {
    doc
      .text(
        `[${r.dateKey}] (${r.type}) ₹ ${money(r.amount)} — ${String(r.details ?? '').slice(0, 200)}`,
        { paragraphGap: 2 }
      );
    doc.text(String(r.note ?? '').slice(0, 260), {
      paragraphGap: 4,
      indent: 14,
      fillColor: '#64748b',
    });
  }

  doc.end();
}

/**
 * Streams a professional Interest Book PDF
 */
export function streamInterestBookPdf(
  res,
  {
    title,
    summary,
    borrowers,
    loans
  }
) {
  const doc = new PDFDocument({
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    size: 'A4',
    info: { Title: title, Author: 'SmartKhata' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="InterestBook_${new Date().toISOString().slice(0,10)}.pdf"`
  );

  doc.pipe(res);

  // Header
  doc.fontSize(22).fillColor('#065f46').text('SmartKhata', { align: 'right' });
  doc.fontSize(18).fillColor('#0f172a').text(title, 50, 50);
  doc.fontSize(10).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString()}`);
  doc.moveDown(2);

  // 1. Summary Section
  doc.fontSize(14).fillColor('#0f172a').text('Financial Summary', { underline: true });
  doc.moveDown(0.5);
  
  const summaryY = doc.y;
  doc.fontSize(10).fillColor('#334155');
  doc.text(`Total Principal: ₹ ${money(summary.totalPrincipal)}`, 60);
  doc.text(`Total Interest: ₹ ${money(summary.totalInterest)}`, 60);
  doc.text(`Total Received: ₹ ${money(summary.totalReceived)}`, 60);
  doc.text(`Total Balance: ₹ ${money(summary.totalBalance)}`, 60);
  
  doc.text(`Active Loans: ${summary.active}`, 250, summaryY);
  doc.text(`Closed Loans: ${summary.closed}`, 250, summaryY + 15);
  doc.text(`Overdue Loans: ${summary.overdue}`, 250, summaryY + 30);
  doc.text(`Total Records: ${summary.count}`, 250, summaryY + 45);
  doc.moveDown(2);

  // 2. Borrower Summary
  doc.fontSize(14).fillColor('#0f172a').text('Borrower-wise Summary');
  doc.moveDown(0.5);
  
  // Table Header
  const tableTop = doc.y;
  doc.fontSize(9).fillColor('#475569');
  doc.text('Borrower', 50, tableTop);
  doc.text('Principal', 180, tableTop);
  doc.text('Interest', 260, tableTop);
  doc.text('Received', 340, tableTop);
  doc.text('Balance', 420, tableTop);
  doc.text('Loans', 500, tableTop);
  
  doc.moveTo(50, tableTop + 12).lineTo(550, tableTop + 12).stroke('#e2e8f0');
  
  let currentY = tableTop + 18;
  doc.fillColor('#1e293b');
  
  for (const b of borrowers) {
    if (currentY > 750) { doc.addPage(); currentY = 50; }
    doc.text(b.borrowerName, 50, currentY);
    doc.text(`₹ ${money(b.totalPrincipal)}`, 180, currentY);
    doc.text(`₹ ${money(b.totalInterest)}`, 260, currentY);
    doc.text(`₹ ${money(b.totalReceived)}`, 340, currentY);
    doc.text(`₹ ${money(b.totalBalance)}`, 420, currentY);
    doc.text(String(b.loanCount), 500, currentY);
    currentY += 18;
  }
  doc.moveDown(2);

  // 3. Detailed Loans
  doc.addPage();
  doc.fontSize(14).fillColor('#0f172a').text('Detailed Loan Records');
  doc.moveDown(1);

  for (const l of loans) {
    if (doc.y > 700) doc.addPage();
    
    const startY = doc.y;
    doc.fontSize(11).fillColor('#0f172a').text(l.borrowerName, { continued: true });
    doc.fontSize(9).fillColor('#64748b').text(` (${l.status.toUpperCase()})`, { align: 'right' });
    
    doc.fontSize(9).fillColor('#334155');
    doc.text(`Principal: ₹ ${money(l.principalAmount)} | Rate: ${l.monthlyInterestRate}% | Months: ${l.monthsUsed}`, 50, doc.y + 2);
    doc.text(`Start: ${new Date(l.startDate).toLocaleDateString()} | End: ${l.endDate ? new Date(l.endDate).toLocaleDateString() : 'Dynamic'}`, 50, doc.y + 2);
    doc.fontSize(10).fillColor('#b91c1c').text(`Balance: ₹ ${money(l.balanceAmount)}`, { align: 'right' });
    
    if (l.remarks) {
      doc.fontSize(8).fillColor('#94a3b8').text(`Remarks: ${l.remarks}`, { indent: 10 });
    }
    
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke('#f1f5f9');
    doc.moveDown(0.8);
  }

  doc.end();
}

