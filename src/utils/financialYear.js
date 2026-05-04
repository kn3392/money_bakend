import { AppError } from './AppError.js';

/**
 * Indian financial year: April (month 4) – March (month 3 next calendar year).
 * All calendar calculations use Asia/Kolkata (IST).
 */

/**
 * @param {Date} [input]
 * @returns {string} YYYY-MM-DD in IST
 */
export function getISTDateKey(input = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * @param {Date} [date]
 * @returns {string} e.g. "2025-2026" for FY Apr 2025 – Mar 2026
 */
export function getFinancialYearLabelForDate(date = new Date()) {
  const key = getISTDateKey(date);
  const [y, m] = key.split('-').map(Number);
  const month = m;
  const year = y;
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${fyStartYear}-${fyStartYear + 1}`;
}

/**
 * Parse YYYY-MM-DD as UTC noon on that calendar day (stable storage).
 * @param {string} dateKey
 * @returns {Date}
 */
export function dateKeyToUtcNoon(dateKey) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

/** IST calendar days in month (1–12 Greg). */
export function daysInGregorianCalendarMonth(year, calendarMonth /* 1–12 */) {
  return new Date(Date.UTC(year, calendarMonth, 0)).getUTCDate();
}

/** @returns {{ startKey: string; endKey: string }} IST keys */
export function calendarMonthYearToRange(month, year) {
  const mo = Number(month);
  const y = Number(year);
  if (mo < 1 || mo > 12)
    throw new AppError('Month must be 1–12', 400);
  const mStr = String(mo).padStart(2, '0');
  const dim = daysInGregorianCalendarMonth(y, mo);
  return {
    startKey: `${y}-${mStr}-01`,
    endKey: `${y}-${mStr}-${String(dim).padStart(2, '0')}`,
  };
}

/** @param {string} fy e.g. 2026-27 */
export function parseFinancialYearParam(fy) {
  const s = String(fy).trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m)
    throw new AppError('financialYear must look like 2026-27', 400);
  const yStart = Number(m[1]);
  const endShort = Number(m[2]);
  const yEnd = yStart + 1;
  if ((yEnd % 100) !== endShort)
    throw new AppError('financialYear suffix does not match year+1', 400);
  return {
    startKey: `${yStart}-04-01`,
    endKey: `${yEnd}-03-31`,
    label: s,
  };
}

export function shiftISTMonths(dateKey, deltaMonths) {
  const [sy, smo, sd] = dateKey.split('-').map(Number);
  let Mo = smo;
  let y = sy;
  let dm = deltaMonths;
  Mo += dm;
  while (Mo > 12) {
    Mo -= 12;
    y++;
  }
  while (Mo < 1) {
    Mo += 12;
    y--;
  }
  const dim = daysInGregorianCalendarMonth(y, Mo);
  const dCap = Math.min(sd, dim);
  return `${y}-${String(Mo).padStart(2, '0')}-${String(dCap).padStart(2, '0')}`;
}
