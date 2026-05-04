import { getISTDateKey } from './financialYear.js';

/**
 * @param {string} dateKey
 * @returns {boolean}
 */
function isValidGregorianParts(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Normalizes incoming date string / Date to IST calendar key YYYY-MM-DD.
 * @param {string | Date} input
 * @returns {string}
 */
export function normalizeToISTDateKey(input) {
  if (input instanceof Date) {
    return getISTDateKey(input);
  }
  if (typeof input === 'string') {
    const s = input.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!isValidGregorianParts(y, mo, d)) {
        throw new Error(`Invalid calendar date: ${s}`);
      }
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new Error('Invalid date value');
    }
    return getISTDateKey(d);
  }
  throw new Error('Date must be a string or Date');
}

/**
 * Shift IST calendar date key by deltaDays (Gregorian arithmetic on Y-M-D components via UTC helpers).
 * @param {string} dateKey
 * @param {number} deltaDays
 */
export function shiftISTDateKey(dateKey, deltaDays) {
  const [Y, M, D] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D + deltaDays));
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** @param {string} dateKey */
export function getPreviousDateKey(dateKey) {
  return shiftISTDateKey(dateKey, -1);
}

/** @param {string} dateKey */
export function getNextDateKey(dateKey) {
  return shiftISTDateKey(dateKey, 1);
}

/** @param {string} a @param {string} b IST keys YYYY-MM-DD */
export function compareDateKeys(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
