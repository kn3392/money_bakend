import ExcelJS from 'exceljs';

function plainName(pop) {
  if (!pop) return '';
  if (typeof pop === 'object' && pop.name) return String(pop.name);
  return '';
}

/**
 * Rows: mongoose lean/populated Transaction docs — active only upstream.
 */
export async function transactionsToExcelBuffer(transactions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmartKhata';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Transactions', {
    views: [{ rightToLeft: false }],
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Account', key: 'account', width: 22 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Person', key: 'person', width: 18 },
    { header: 'Note', key: 'note', width: 40 },
    { header: 'Financial Year', key: 'fy', width: 14 },
  ];
  for (const t of transactions) {
    sheet.addRow({
      date: t.dateKey ?? '',
      type: t.type,
      amount: Number(t.amount),
      account:
        plainName(t.accountId) ||
        `${plainName(t.fromAccountId)} → ${plainName(t.toAccountId)}`,
      category: plainName(t.categoryId),
      person: plainName(t.personId),
      note: t.note ?? '',
      fy: t.financialYear ?? '',
    });
  }
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

/**
 * Rows: mongoose lean InterestLoan docs.
 */
export async function interestLoansToExcelBuffer(loans) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmartKhata';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Interest Book', {
    views: [{ rightToLeft: false }],
    properties: { defaultRowHeight: 18 },
  });

  sheet.columns = [
    { header: 'Borrower', key: 'borrowerName', width: 20 },
    { header: 'Contact', key: 'contactDetails', width: 25 },
    { header: 'Principal', key: 'principalAmount', width: 14 },
    { header: 'Rate (%)', key: 'monthlyInterestRate', width: 10 },
    { header: 'Start Date', key: 'startDate', width: 12 },
    { header: 'End Date', key: 'endDate', width: 12 },
    { header: 'Months Used', key: 'monthsUsed', width: 12 },
    { header: 'Interest', key: 'interestAmount', width: 14 },
    { header: 'Total Due', key: 'totalDue', width: 14 },
    { header: 'Received', key: 'receivedAmount', width: 14 },
    { header: 'Balance', key: 'balanceAmount', width: 14 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Remarks', key: 'remarks', width: 40 },
  ];

  for (const l of loans) {
    sheet.addRow({
      borrowerName: l.borrowerName,
      contactDetails: l.contactDetails ?? '',
      principalAmount: Number(l.principalAmount),
      monthlyInterestRate: Number(l.monthlyInterestRate),
      startDate: l.startDate ? new Date(l.startDate).toLocaleDateString() : '',
      endDate: l.endDate ? new Date(l.endDate).toLocaleDateString() : 'Dynamic',
      monthsUsed: Number(l.monthsUsed),
      interestAmount: Number(l.interestAmount),
      totalDue: Number(l.totalDue),
      receivedAmount: Number(l.receivedAmount),
      balanceAmount: Number(l.balanceAmount),
      status: String(l.status).toUpperCase(),
      remarks: l.remarks ?? '',
    });
  }

  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

