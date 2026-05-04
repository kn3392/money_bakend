/**
 * One-off QA API smoke — run with backend up and MONGO_URI/JWT_SECRET set.
 * Usage: node scripts/qa-api-smoke.mjs
 */
const BASE = process.env.QA_API_BASE ?? 'http://127.0.0.1:5000';

async function j(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const txt = await r.text();
  let data;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = { raw: txt };
  }
  return { ok: r.ok, status: r.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const email = `qa_${Date.now()}@example.com`;
const password = 'testpass12';

async function main() {
  const h = await j('/api/health');
  assert(h.ok && h.data?.success, `health failed: ${JSON.stringify(h.data)}`);

  const reg = await j('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA User',
      email,
      password,
    }),
  });
  assert(reg.ok && reg.data?.token, `register failed: ${JSON.stringify(reg.data)}`);
  const token = reg.data.token;

  const dup = await j('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'X',
      email,
      password,
    }),
  });
  assert(dup.status === 400, 'duplicate email should be 400');

  const badLogin = await j('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'wrong' }),
  });
  assert(badLogin.status === 401, 'bad login should be 401');

  const auth = { Authorization: `Bearer ${token}` };

  const prof = await j('/api/v1/auth/profile', { headers: auth });
  assert(prof.ok && prof.data?.user?.email === email, 'profile mismatch');

  const acRes = await j('/api/v1/accounts', { headers: auth });
  assert(acRes.ok, `accounts ${JSON.stringify(acRes.data)}`);
  const accounts = acRes.data.accounts ?? acRes.data;
  const byName = (n) => accounts.find((a) => a.name === n);
  const cash = byName('Cash');
  const sbi = byName('SBI Bank');
  assert(cash && sbi, 'default accounts missing');

  const catRes = await j('/api/v1/categories', { headers: auth });
  assert(catRes.ok, 'categories');
  const cats = catRes.data.categories ?? catRes.data;
  const incCat = (name) => cats.find((c) => c.type === 'income' && c.name === name);
  const expCat = (name) => cats.find((c) => c.type === 'expense' && c.name === name);
  const salary = incCat('Salary');
  const freelance = incCat('Freelance');
  const food = expCat('Food');
  const petrol = expCat('Petrol');
  assert(salary && freelance && food && petrol, 'default categories missing');

  const d1 = '2026-05-03';
  const d2 = '2026-05-04';

  let tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'income',
      amount: 10000,
      date: d1,
      accountId: cash.id,
      categoryId: salary.id,
      note: 'ચા ખર્ચ',
    }),
  });
  assert(tx.ok, `income d1 ${JSON.stringify(tx.data)}`);

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'expense',
      amount: 2000,
      date: d1,
      accountId: cash.id,
      categoryId: food.id,
      note: 'food',
    }),
  });
  assert(tx.ok, `expense d1 ${JSON.stringify(tx.data)}`);

  let led = await j(`/api/v1/ledger/day/${d1}`, { headers: auth });
  assert(led.ok, `ledger d1 ${JSON.stringify(led.data)}`);
  const L1 = led.data;
  assert(
    L1.openingBalance === 0 &&
      L1.totalIncome === 10000 &&
      L1.totalExpense === 2000 &&
      L1.closingBalance === 8000,
    `day1 ledger expected 0/10000/2000/8000 got ${L1.openingBalance}/${L1.totalIncome}/${L1.totalExpense}/${L1.closingBalance}`
  );

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'income',
      amount: 5000,
      date: d2,
      accountId: sbi.id,
      categoryId: freelance.id,
      note: 'freelance',
    }),
  });
  assert(tx.ok, `income d2 ${JSON.stringify(tx.data)}`);

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'expense',
      amount: 1000,
      date: d2,
      accountId: cash.id,
      categoryId: petrol.id,
      note: 'petrol',
    }),
  });
  assert(tx.ok, `expense d2 ${JSON.stringify(tx.data)}`);

  led = await j(`/api/v1/ledger/day/${d2}`, { headers: auth });
  assert(led.ok, `ledger d2 ${JSON.stringify(led.data)}`);
  const L2 = led.data;
  assert(
    L2.openingBalance === 8000 &&
      L2.totalIncome === 5000 &&
      L2.totalExpense === 1000 &&
      L2.closingBalance === 12000,
    `day2 ledger expected 8000/5000/1000/12000 got ${L2.openingBalance}/${L2.totalIncome}/${L2.totalExpense}/${L2.closingBalance}`
  );

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'transfer',
      amount: 2000,
      date: d2,
      fromAccountId: cash.id,
      toAccountId: sbi.id,
      note: 'move',
    }),
  });
  assert(tx.ok, `transfer ${JSON.stringify(tx.data)}`);

  led = await j(`/api/v1/ledger/day/${d2}`, { headers: auth });
  const L2t = led.data;
  assert(
    L2t.closingBalance === 12000,
    `after transfer closing should stay 12000 got ${L2t.closingBalance}`
  );

  let acAfter = await j('/api/v1/accounts', { headers: auth });
  let accList = acAfter.data.accounts ?? acAfter.data;
  let cashBal = accList.find((a) => a.name === 'Cash')?.currentBalance;
  let sbiBal = accList.find((a) => a.name === 'SBI Bank')?.currentBalance;
  assert(cashBal === 5000 && sbiBal === 7000, `cash/sbi after transfer expected 5000/7000 got ${cashBal}/${sbiBal}`);

  const pCreate = await j('/api/v1/persons', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'K' }),
  });
  assert(pCreate.ok, `person ${JSON.stringify(pCreate.data)}`);
  const personId = pCreate.data.person.id ?? pCreate.data.person._id;
  const personGiven = expCat('Person Given Money');
  const personRet = incCat('Person Returned Money');
  assert(personGiven && personRet, 'person categories');

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'expense',
      amount: 5000,
      date: d2,
      accountId: cash.id,
      categoryId: personGiven.id,
      personId,
      note: 'give K',
    }),
  });
  assert(tx.ok, `give K ${JSON.stringify(tx.data)}`);

  tx = await j('/api/v1/transactions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      type: 'income',
      amount: 2000,
      date: d2,
      accountId: cash.id,
      categoryId: personRet.id,
      personId,
      note: 'K return',
    }),
  });
  assert(tx.ok, `take from K ${JSON.stringify(tx.data)}`);

  const pk = await j(`/api/v1/persons/${personId}`, { headers: auth });
  assert(pk.ok, `person get ${JSON.stringify(pk.data)}`);
  const P = pk.data.person;
  assert(
    P.totalGiven === 5000 && P.totalTaken === 2000 && P.balance === -3000,
    `person K expected 5000/2000/-3000 got ${P.totalGiven}/${P.totalTaken}/${P.balance}`
  );

  acAfter = await j('/api/v1/accounts', { headers: auth });
  accList = acAfter.data.accounts ?? acAfter.data;
  cashBal = accList.find((a) => a.name === 'Cash')?.currentBalance;
  assert(cashBal === 2000, `cash after person txs expected 2000 got ${cashBal}`);

  const sr = await j(
    `/api/v1/transactions/search?q=freelance&type=income&page=1&limit=10`,
    { headers: auth }
  );
  assert(sr.ok && sr.data.success, `search ${JSON.stringify(sr.data)}`);

  const noAuth = await j('/api/v1/accounts');
  assert(noAuth.status === 401, 'accounts without token should 401');

  console.log('QA_API_SMOKE_OK');
}

main().catch((e) => {
  console.error('QA_API_SMOKE_FAIL', e.message);
  process.exit(1);
});
