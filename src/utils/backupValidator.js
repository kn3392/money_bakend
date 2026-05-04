import { ACCOUNT_TYPE_VALUES } from '../models/Account.js';
import { CATEGORY_TYPE_VALUES } from '../models/Category.js';
import { TRANSACTION_TYPE_VALUES } from '../models/Transaction.js';
import { FREQUENCY_VALUES } from '../models/RecurringTransaction.js';

function isPlainObject(o) {
  return o !== null && typeof o === 'object' && !Array.isArray(o);
}

/**
 * Validates SmartKhata JSON backup envelope (never trusts nested userIds).
 */
export function validateBackupPayload(data) {
  if (!isPlainObject(data)) throw new Error('Backup must be a JSON object');

  const { version } = data;
  if (version !== 1)
    throw new Error('Unsupported backup version (expected version 1)');

  const requiredArrays = [
    'accounts',
    'categories',
    'persons',
    'transactions',
    'recurringTransactions',
    'dayLedgers',
  ];
  for (const k of requiredArrays) {
    if (!Array.isArray(data[k])) throw new Error(`Missing or invalid array: ${k}`);
  }

  for (const a of data.accounts) {
    if (!isPlainObject(a) || typeof a.name !== 'string')
      throw new Error('Invalid account row');
    if (!ACCOUNT_TYPE_VALUES.includes(a.type)) throw new Error('Invalid account type');
  }

  for (const c of data.categories) {
    if (!isPlainObject(c) || typeof c.name !== 'string')
      throw new Error('Invalid category row');
    if (!CATEGORY_TYPE_VALUES.includes(c.type))
      throw new Error('Invalid category type');
  }

  for (const p of data.persons) {
    if (!isPlainObject(p) || typeof p.name !== 'string')
      throw new Error('Invalid person row');
  }

  for (const t of data.transactions) {
    if (!isPlainObject(t)) throw new Error('Invalid transaction row');
    if (!TRANSACTION_TYPE_VALUES.includes(t.type))
      throw new Error('Invalid transaction type in backup');
  }

  for (const r of data.recurringTransactions) {
    if (!isPlainObject(r)) throw new Error('Invalid recurring row');
    if (!TRANSACTION_TYPE_VALUES.includes(r.type))
      throw new Error('Invalid recurring type');
    if (!FREQUENCY_VALUES.includes(r.frequency))
      throw new Error('Invalid recurring frequency');
  }

  for (const d of data.dayLedgers) {
    if (!isPlainObject(d)) throw new Error('Invalid dayLedger row');
  }

  return data;
}
