// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Working days for JBCC periods.
 *
 * JBCC PBA 6.2 defines working days as calendar days excluding Saturdays, Sundays, proclaimed
 * public holidays and the contractor's recorded annual holiday periods [CD].
 *
 * Public holidays: Public Holidays Act 36 of 1994, as listed on gov.za. Twelve fixed or Easter-based
 * days; when one falls on a Sunday the following Monday is a public holiday. A holiday on a
 * Saturday is not moved. Holidays proclaimed for a single occasion (an election day, say) are not
 * predictable and are passed in as extra dates.
 */

const DAY = 86_400_000;

const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d);

export function parseIso(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = utc(Number(m[1]), Number(m[2]), Number(m[3]));
  return iso(t) === s ? t : null;
}

/** Easter Sunday (Gregorian), anonymous computus. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(year, month, day));
}

/** South African public holidays for a year, including the Monday after any that fall on a Sunday. */
export function saPublicHolidays(year: number): { date: string; name: string }[] {
  const easter = parseIso(easterSunday(year))!;
  const list: { date: string; name: string }[] = [
    { date: iso(utc(year, 1, 1)), name: "New Year's Day" },
    { date: iso(utc(year, 3, 21)), name: 'Human Rights Day' },
    { date: iso(easter - 2 * DAY), name: 'Good Friday' },
    { date: iso(easter + DAY), name: 'Family Day' },
    { date: iso(utc(year, 4, 27)), name: 'Freedom Day' },
    { date: iso(utc(year, 5, 1)), name: "Workers' Day" },
    { date: iso(utc(year, 6, 16)), name: 'Youth Day' },
    { date: iso(utc(year, 8, 9)), name: "National Women's Day" },
    { date: iso(utc(year, 9, 24)), name: 'Heritage Day' },
    { date: iso(utc(year, 12, 16)), name: 'Day of Reconciliation' },
    { date: iso(utc(year, 12, 25)), name: 'Christmas Day' },
    { date: iso(utc(year, 12, 26)), name: 'Day of Goodwill' },
  ];
  const observed = list
    .filter((h) => new Date(parseIso(h.date)!).getUTCDay() === 0)
    .map((h) => ({ date: iso(parseIso(h.date)! + DAY), name: `${h.name} (observed)` }));
  return [...list, ...observed].sort((a, b) => a.date.localeCompare(b.date));
}

export interface Calendar {
  /** Extra proclaimed holidays, `YYYY-MM-DD`. */
  extraHolidays?: string[];
  /** The contractor's recorded annual holiday periods from the Contract Data, inclusive. */
  annualHolidays?: { from: string; to: string }[];
}

export function isWorkingDay(date: string, cal: Calendar = {}): boolean {
  const t = parseIso(date);
  if (t === null) return false;
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const year = Number(date.slice(0, 4));
  if (saPublicHolidays(year).some((h) => h.date === date)) return false;
  if (cal.extraHolidays?.includes(date)) return false;
  for (const p of cal.annualHolidays ?? []) {
    if (p.from && p.to && date >= p.from && date <= p.to) return false;
  }
  return true;
}

/**
 * The date `n` working days after `start` (the start date itself is not counted, as with
 * "within n working days of" a date).
 */
export function addWorkingDays(start: string, n: number, cal: Calendar = {}): string | undefined {
  let t = parseIso(start);
  if (t === null || !(n >= 0)) return undefined;
  let left = n;
  while (left > 0) {
    t += DAY;
    if (isWorkingDay(iso(t), cal)) left -= 1;
  }
  return iso(t);
}

export function addCalendarDays(start: string, n: number): string | undefined {
  const t = parseIso(start);
  return t === null ? undefined : iso(t + n * DAY);
}

/** Working days after `from` up to and including `to`; 0 if `to` is not after `from`. */
export function workingDaysBetween(from: string, to: string, cal: Calendar = {}): number {
  const a = parseIso(from);
  const b = parseIso(to);
  if (a === null || b === null || b <= a) return 0;
  let n = 0;
  for (let t = a + DAY; t <= b; t += DAY) if (isWorkingDay(iso(t), cal)) n += 1;
  return n;
}
