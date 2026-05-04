import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { Category } from '../models/Category.js';
import { PersonLedger } from '../models/PersonLedger.js';
import {
  Transaction,
  TRANSACTION_STATUSES,
} from '../models/Transaction.js';
import { RecurringTransaction } from '../models/RecurringTransaction.js';
import { DayLedger } from '../models/DayLedger.js';
import { AppError } from '../utils/AppError.js';
import { validateBackupPayload } from '../utils/backupValidator.js';
import { recalculateBalancesForUser } from '../utils/recalculateBalances.js';
import {
  recalculateLedgerChainFrom,
  getEarliestTxnDateKey,
} from './ledgerService.js';
import {
  normalizeToISTDateKey,
  compareDateKeys,
  getPreviousDateKey,
} from '../utils/dateUtils.js';
import {
  dateKeyToUtcNoon,
} from '../utils/financialYear.js';

function toOid(id) {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export async function exportBackupSnapshot(userId) {
  const uid = toOid(userId);
  const [
    accounts,
    categories,
    persons,
    transactions,
    recurringTransactions,
    dayLedgers,
  ] = await Promise.all([
    Account.find({ userId: uid }).lean(),
    Category.find({ userId: uid }).lean(),
    PersonLedger.find({ userId: uid }).lean(),
    Transaction.find({ userId: uid }).lean(),
    RecurringTransaction.find({ userId: uid }).lean(),
    DayLedger.find({ userId: uid }).lean(),
  ]);

  const strip = (rows) =>
    rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)) }));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'SmartKhata',
    accounts: strip(accounts),
    categories: strip(categories),
    persons: strip(persons),
    transactions: strip(transactions),
    recurringTransactions: strip(recurringTransactions),
    dayLedgers: strip(dayLedgers),
  };
}

async function wipeUserFinancialData(uid) {
  await Promise.all([
    Transaction.deleteMany({ userId: uid }),
    DayLedger.deleteMany({ userId: uid }),
    RecurringTransaction.deleteMany({ userId: uid }),
    PersonLedger.deleteMany({ userId: uid }),
    Category.deleteMany({ userId: uid }),
    Account.deleteMany({ userId: uid }),
  ]);
}

async function replaceRestore(authUserId, snap) {
  const uid = toOid(authUserId);
  await wipeUserFinancialData(uid);
  const accMap = {};
  const catMap = {};
  const personMap = {};
  for (const a of snap.accounts) {
    const oldId = String(a._id);
    delete a.userId;
    delete a.__v;
    delete a.createdAt;
    delete a.updatedAt;
    delete a._id;
    const ins = await Account.create({
      ...a,
      userId: uid,
    });
    accMap[oldId] = ins._id.toString();
  }
  for (const c of snap.categories) {
    const oldId = String(c._id);
    delete c.userId;
    delete c.__v;
    delete c.createdAt;
    delete c.updatedAt;
    delete c._id;
    const ins = await Category.create({ ...c, userId: uid });
    catMap[oldId] = ins._id.toString();
  }
  for (const p of snap.persons) {
    const oldId = String(p._id);
    delete p.userId;
    delete p.__v;
    delete p.createdAt;
    delete p.updatedAt;
    delete p._id;
    const remapLinked = (oid) =>
      oid && accMap[String(oid)] ? accMap[String(oid)] : null;
    const ins = await PersonLedger.create({
      ...p,
      userId: uid,
      linkedAccountId: remapLinked(p.linkedAccountId),
    });
    personMap[oldId] = ins._id.toString();
  }
  const recMap = {};
  for (const r of snap.recurringTransactions) {
    const oldId = String(r._id);
    delete r.userId;
    delete r.__v;
    delete r.createdAt;
    delete r.updatedAt;
    delete r._id;
    const ins = await RecurringTransaction.create({
      ...r,
      userId: uid,
      accountId: r.accountId && accMap[String(r.accountId)],
      categoryId: r.categoryId && catMap[String(r.categoryId)],
      fromAccountId:
        r.fromAccountId && accMap[String(r.fromAccountId)],
      toAccountId: r.toAccountId && accMap[String(r.toAccountId)],
      personId: r.personId && personMap[String(r.personId)],
    });
    recMap[oldId] = ins._id.toString();
  }
  let minKey = null;
  for (const t of snap.transactions) {
    delete t.__v;
    delete t.createdAt;
    delete t.updatedAt;
    delete t._id;
    delete t.userId;
    const dk =
      typeof t.dateKey === 'string'
        ? t.dateKey
        : normalizeToISTDateKey(new Date(t.date));
    if (!minKey || compareDateKeys(dk, minKey) < 0) minKey = dk;
    const statusOk = TRANSACTION_STATUSES.includes(t.status) ? t.status : 'active';
    await Transaction.create({
      ...t,
      userId: uid,
      status: statusOk,
      date: t.date ?? dateKeyToUtcNoon(dk),
      dateKey: dk,
      accountId: t.accountId && accMap[String(t.accountId)],
      categoryId: t.categoryId && catMap[String(t.categoryId)],
      fromAccountId:
        t.fromAccountId && accMap[String(t.fromAccountId)],
      toAccountId: t.toAccountId && accMap[String(t.toAccountId)],
      personId: t.personId && personMap[String(t.personId)],
      recurringTemplateId:
        t.recurringTemplateId && recMap[String(t.recurringTemplateId)]
          ? recMap[String(t.recurringTemplateId)]
          : undefined,
      materializationDateKey: t.materializationDateKey || '',
    });
  }
  for (const dl of snap.dayLedgers) {
    delete dl._id;
    delete dl.__v;
    delete dl.createdAt;
    delete dl.updatedAt;
    delete dl.userId;
    await DayLedger.create({
      ...dl,
      userId: uid,
    });
  }
  await recalculateBalancesForUser(authUserId);
  const earliest = await getEarliestTxnDateKey(authUserId);
  const start = earliest ?? minKey ?? getPreviousDateKey(normalizeToISTDateKey(new Date()));
  await recalculateLedgerChainFrom(authUserId, start ?? normalizeToISTDateKey(new Date()));
}

/**
 * Merge: upsert accounts/categories/persons then append imported transactions/remapped.
 */
async function mergeRestore(authUserId, snap) {
  const uid = toOid(authUserId);
  const accMap = {};
  for (const a of snap.accounts) {
    const ex = await Account.findOne({
      userId: uid,
      name: a.name.trim(),
      type: a.type,
    });
    let id;
    if (ex) id = ex._id;
    else {
      delete a.__v;
      delete a._id;
      const ins = await Account.create({
        name: a.name,
        type: a.type,
        openingBalance: a.openingBalance ?? 0,
        currentBalance: a.currentBalance ?? a.openingBalance ?? 0,
        isActive: a.isActive !== false,
        isDefault: !!a.isDefault,
        description: a.description ?? '',
        userId: uid,
      });
      id = ins._id;
    }
    accMap[String(a._id)] = id.toString();
  }
  const catMap = {};
  for (const c of snap.categories) {
    const ex = await Category.findOne({
      userId: uid,
      name: c.name.trim(),
      type: c.type,
    });
    let id;
    if (ex) id = ex._id;
    else {
      delete c.__v;
      delete c._id;
      const ins = await Category.create({
        name: c.name,
        type: c.type,
        icon: c.icon ?? '',
        color: c.color ?? '',
        isDefault: !!c.isDefault,
        isActive: c.isActive !== false,
        userId: uid,
      });
      id = ins._id;
    }
    catMap[String(c._id)] = id.toString();
  }
  const personMap = {};
  for (const p of snap.persons) {
    const ex = await PersonLedger.findOne({
      userId: uid,
      name: p.name.trim(),
    });
    let id;
    const linkedOid =
      p.linkedAccountId && accMap[String(p.linkedAccountId)]
        ? accMap[String(p.linkedAccountId)]
        : undefined;
    if (ex) {
      id = ex._id;
    } else {
      delete p.__v;
      delete p._id;
      const ins = await PersonLedger.create({
        name: p.name,
        linkedAccountId: linkedOid,
        totalGiven: p.totalGiven ?? 0,
        totalTaken: p.totalTaken ?? 0,
        isActive: p.isActive !== false,
        userId: uid,
      });
      id = ins._id;
    }
    personMap[String(p._id)] = id.toString();
  }

  let minKey = null;
  for (const t of snap.transactions) {
    delete t.userId;
    const dk =
      typeof t.dateKey === 'string'
        ? t.dateKey
        : normalizeToISTDateKey(new Date(t.date));
    if (!minKey || compareDateKeys(dk, minKey) < 0) minKey = dk;
    const statusOk = TRANSACTION_STATUSES.includes(t.status) ? t.status : 'active';
    delete t.__v;
    delete t._id;
    await Transaction.create({
      ...t,
      userId: uid,
      status: statusOk,
      date: t.date ?? dateKeyToUtcNoon(dk),
      dateKey: dk,
      accountId:
        t.accountId && accMap[String(t.accountId)]
          ? accMap[String(t.accountId)]
          : undefined,
      categoryId:
        t.categoryId && catMap[String(t.categoryId)]
          ? catMap[String(t.categoryId)]
          : undefined,
      fromAccountId:
        t.fromAccountId && accMap[String(t.fromAccountId)]
          ? accMap[String(t.fromAccountId)]
          : undefined,
      toAccountId:
        t.toAccountId && accMap[String(t.toAccountId)]
          ? accMap[String(t.toAccountId)]
          : undefined,
      personId:
        t.personId && personMap[String(t.personId)]
          ? personMap[String(t.personId)]
          : undefined,
      recurringTemplateId: undefined,
      materializationDateKey: '',
    });
  }
  for (const r of snap.recurringTransactions) {
    delete r.__v;
    delete r._id;
    await RecurringTransaction.create({
      ...r,
      userId: uid,
      accountId: r.accountId && accMap[String(r.accountId)],
      categoryId: r.categoryId && catMap[String(r.categoryId)],
      fromAccountId:
        r.fromAccountId && accMap[String(r.fromAccountId)],
      toAccountId: r.toAccountId && accMap[String(r.toAccountId)],
      personId: r.personId && personMap[String(r.personId)],
    });
  }
  await recalculateBalancesForUser(authUserId);
  const earliest = await getEarliestTxnDateKey(authUserId);
  await recalculateLedgerChainFrom(
    authUserId,
    earliest ?? minKey ?? normalizeToISTDateKey(new Date())
  );
}

export async function restoreFromBackup(authUserId, rawJson, options) {
  if (!options?.confirmRestore) {
    throw new AppError('confirmRestore:true is required to restore backup', 400);
  }
  let parsed = rawJson;
  if (typeof rawJson === 'string') parsed = JSON.parse(rawJson);
  const snap = validateBackupPayload(parsed);

  /** Never trust inbound user identifiers. */
  if (snap.userId !== undefined) delete snap.userId;

  if (options.replaceExisting) await replaceRestore(authUserId, snap);
  else await mergeRestore(authUserId, snap);

  return { success: true, mode: options.replaceExisting ? 'replace' : 'merge' };
}
