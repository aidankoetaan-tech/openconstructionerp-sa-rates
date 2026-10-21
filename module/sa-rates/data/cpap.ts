// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Contract Price Adjustment Provisions (CPAP): the escalation method JBCC
 * contracts use when the Contract Data says cost fluctuations apply
 * (JBCC PBA 6.2 cl 25.3.4; Contract Data B 12.0).
 *
 * Per work group and valuation period:
 *
 *     A = k × V × (Xe / Xo − 1)        k = 0.85 (a 15 % non-adjustable element)
 *
 *   V   work value certified in the work group for the period, excl VAT
 *   Xo  work group index for the base month (the month tenders closed)
 *   Xe  work group index for the valuation period: the month before the
 *       certificate date when the certificate is dated on or before the 15th,
 *       otherwise the month of the certificate. If more than one new index
 *       month has been published since the last certificate, their average.
 *
 * Sources: JBCC CPAP Indices Application Manual (Series 2000 code 2118,
 * May 2005) cl 5.1 and 7.1; the same formula is examined by the SACQSP
 * (PSM 05, August 2018). Stats SA notes that updated CPAP manuals are
 * available from ASAQS, so `k` and the month rule are parameters here and
 * the defaults should be checked against the manual named in the contract.
 *
 * Indices: Stats SA statistical release P0151.1, Table 1 "Contract price
 * adjustment provisions (CPAP) work group indices", free to use with Stats SA
 * acknowledged as the source. The August 2026 release is on base Dec 2023 = 100;
 * Xo and Xe must come from the same base.
 *
 * Out of scope: certificates issued after practical completion (manual
 * cl 8.0, the Af/Vf method and the 0.55 factor on work completed late) and
 * provisional adjustments (cl 9.0). Those certificates are refused, not
 * approximated.
 */

export const STATS_SA_SOURCE =
  'Source: Statistics South Africa, P0151.1 Construction Material Price Indices, Table 1 (CPAP work group indices).';

export const DEFAULT_NON_ADJUSTABLE_FACTOR = 0.85;

/** Work groups as listed in P0151.1 Table 1 (August 2026 release). */
export const CPAP_WORK_GROUPS: { code: string; name: string }[] = [
  { code: '102', name: 'Alterations' },
  { code: '104', name: 'Earthworks' },
  { code: '106', name: 'Piling' },
  { code: '110', name: 'Concrete (excluding formwork)' },
  { code: '111', name: 'Formwork' },
  { code: '112', name: 'Precast concrete' },
  { code: '113', name: 'Post tensioning' },
  { code: '114', name: 'Reinforcement' },
  { code: '116', name: 'Brick and block work' },
  { code: '118', name: 'Masonry' },
  { code: '120', name: 'Waterproofing' },
  { code: '122', name: 'Non-metal roofing' },
  { code: '124', name: 'Metal roofing (steel)' },
  { code: '125', name: 'Metal roofing (aluminium)' },
  { code: '126', name: 'Carpentry and joinery' },
  { code: '129', name: 'Ceilings' },
  { code: '130', name: 'Resilient floor and wall coverings' },
  { code: '132', name: 'Ironmongery' },
  { code: '134', name: 'Structural steelwork in buildings' },
  { code: '136', name: 'Metalwork' },
  { code: '138', name: 'Partitioning systems' },
  { code: '140', name: 'Aluminium work' },
  { code: '141', name: 'Stainless steel work' },
  { code: '142', name: 'In situ finishes' },
  { code: '144', name: 'Tiling' },
  { code: '146', name: 'Drainage' },
  { code: '148', name: 'Plumbing' },
  { code: '149', name: 'Aluminium shop fronts and preglazed windows' },
  { code: '150', name: 'Glazing' },
  { code: '152', name: 'Painting' },
  { code: '154', name: 'Roadworks' },
  { code: '160', name: 'Electrical installations' },
  { code: '162', name: 'Electrical reticulation' },
  { code: '170', name: 'Mechanical services' },
  { code: '171', name: 'Ductwork installations' },
  { code: '172', name: 'Refrigeration installations' },
  { code: '173', name: 'Steel water pipe installations' },
  { code: '180', name: 'Lump sum domestic buildings' },
  { code: '181', name: 'Commercial/industrial buildings' },
  { code: '190', name: 'Preliminaries' },
];

const GROUP_CODES = new Set(CPAP_WORK_GROUPS.map((g) => g.code));

/** `YYYY-MM` month key. */
export type Month = string;

/** Work group code → month → index value. */
export type IndexTable = Record<string, Record<Month, number>>;

/** Browser storage key for the last complete CPAP result, read by the payment certificate tab. */
export const CPAP_LAST_KEY = 'sa_rates.cpap_last';

export interface CpapLast {
  /** Adjustment for this certificate, excl VAT. */
  amount: number;
  certificateDate: string;
  indexMonths: Month[];
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(v: string): v is Month {
  return MONTH_RE.test(v);
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const total = y * 12 + (mo - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** Months after `from` up to and including `to`, oldest first. */
export function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = addMonths(from, 1); m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * The index month for a certificate date (`YYYY-MM-DD`): the previous month
 * when the certificate is dated on or before `cutoffDay`, otherwise the same
 * month (manual cl 5.1).
 */
export function indexMonthFor(certificateDate: string, cutoffDay = 15): Month {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(certificateDate);
  if (!m) throw new Error(`Certificate date must be YYYY-MM-DD, got "${certificateDate}"`);
  const month = `${m[1]}-${m[2]}`;
  return Number(m[3]) <= cutoffDay ? addMonths(month, -1) : month;
}

/** A = k × V × (Xe / Xo − 1). */
export function adjustmentAmount(value: number, xe: number, xo: number, k = DEFAULT_NON_ADJUSTABLE_FACTOR): number {
  if (!(xo > 0) || !(xe > 0)) throw new Error('Index values must be positive');
  return k * value * (xe / xo - 1);
}

/* ── Index import ──────────────────────────────────────────────────── */

/** "110,9" or "110.9" or "110,9r" (Stats SA marks revisions with r). */
export function parseIndexValue(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(/r$/i, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return v > 0 ? v : null;
}

/** "2026-08", "Aug 2026", "Aug-26", "2026/08". */
export function parseMonth(raw: string): Month | null {
  const s = raw.trim();
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m) {
    const mm = Number(m[2]);
    return mm >= 1 && mm <= 12 ? `${m[1]}-${String(mm).padStart(2, '0')}` : null;
  }
  m = /^([A-Za-z]{3})[a-z]*[\s-]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      m[1]!.toLowerCase(),
    );
    if (idx < 0) return null;
    const year = m[2]!.length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return `${year}-${String(idx + 1).padStart(2, '0')}`;
  }
  return null;
}

export interface ImportResult {
  table: IndexTable;
  values: number;
  problems: string[];
}

/**
 * Read indices from CSV or tab-separated text. Two layouts are accepted:
 *
 *   long:  work_group,month,value          (one value per row)
 *   wide:  work_group,Aug 2025,Sep 2025,…  (months across, groups down)
 *
 * The work group cell may carry the name after the code ("110 Concrete").
 * Semicolon-separated files are accepted, since a comma is the decimal
 * separator in the Stats SA release.
 */
export function importIndices(text: string, into: IndexTable = {}): ImportResult {
  const table: IndexTable = JSON.parse(JSON.stringify(into)) as IndexTable;
  const problems: string[] = [];
  let values = 0;
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { table, values, problems: ['Nothing to import.'] };
  const sep = lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(';') ? ';' : ',';
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')));
  const groupOf = (cell: string): string | null => {
    const code = /^(\d{3})\b/.exec(cell)?.[1];
    return code && GROUP_CODES.has(code) ? code : null;
  };
  const put = (code: string, month: Month, v: number) => {
    (table[code] ??= {})[month] = v;
    values += 1;
  };

  const header = rows[0]!;
  const headerMonths = header.slice(1).map(parseMonth);
  const wide = headerMonths.length > 1 && headerMonths.filter(Boolean).length >= headerMonths.length / 2;

  if (wide) {
    for (const [i, row] of rows.slice(1).entries()) {
      const code = groupOf(row[0] ?? '');
      if (!code) {
        if (row[0]) problems.push(`Line ${i + 2}: "${row[0]}" is not a CPAP work group`);
        continue;
      }
      headerMonths.forEach((month, j) => {
        const cell = row[j + 1];
        if (!month || cell === undefined || cell === '') return;
        const v = parseIndexValue(cell);
        if (v === null) problems.push(`Line ${i + 2}, ${month}: "${cell}" is not an index value`);
        else put(code, month, v);
      });
    }
  } else {
    for (const [i, row] of rows.entries()) {
      const code = groupOf(row[0] ?? '');
      const month = parseMonth(row[1] ?? '');
      const v = parseIndexValue(row[2] ?? '');
      if (!code || !month || v === null) {
        if (i === 0 && !code) continue; // header row
        problems.push(`Line ${i + 1}: expected work group, month, value`);
        continue;
      }
      put(code, month, v);
    }
  }
  if (values === 0 && problems.length === 0) problems.push('No index values found.');
  return { table, values, problems };
}

export function exportIndicesCsv(table: IndexTable): string {
  const lines = ['work_group,month,value'];
  for (const code of Object.keys(table).sort()) {
    for (const month of Object.keys(table[code]!).sort()) {
      lines.push(`${code},${month},${table[code]![month]}`);
    }
  }
  return lines.join('\n') + '\n';
}

/* ── Certificate adjustment ────────────────────────────────────────── */

export interface CpapLine {
  workGroup: string;
  /** Work value certified this period in the group, excl VAT. Negative for a reduction. */
  value: number;
}

export interface CpapInput {
  baseMonth: Month;
  /** `YYYY-MM-DD`. */
  certificateDate: string;
  /** Index month used on the previous certificate; omit on the first one. */
  previousIndexMonth?: Month;
  /** `YYYY-MM-DD`, to refuse certificates the interim method does not cover. */
  practicalCompletionDate?: string;
  lines: CpapLine[];
  k?: number;
  cutoffDay?: number;
}

export interface CpapLineResult extends CpapLine {
  name: string;
  xo: number;
  xe: number;
  /** Months averaged into Xe (one month in the usual case). */
  xeMonths: Month[];
  adjustment: number;
}

export interface CpapResult {
  indexMonth: Month;
  lines: CpapLineResult[];
  totalValue: number;
  totalAdjustment: number;
  /** Index values the calculation needs and the table lacks. */
  missing: { workGroup: string; month: Month }[];
  errors: string[];
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function calculateCertificate(input: CpapInput, table: IndexTable): CpapResult {
  const k = input.k ?? DEFAULT_NON_ADJUSTABLE_FACTOR;
  const errors: string[] = [];
  const missing: { workGroup: string; month: Month }[] = [];
  const result: CpapResult = { indexMonth: '', lines: [], totalValue: 0, totalAdjustment: 0, missing, errors };

  if (!isMonth(input.baseMonth)) errors.push('Base month must be YYYY-MM.');
  if (!(k > 0 && k <= 1)) errors.push('The adjustable proportion must be between 0 and 1.');
  let indexMonth = '';
  try {
    indexMonth = indexMonthFor(input.certificateDate, input.cutoffDay ?? 15);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (input.practicalCompletionDate && input.certificateDate > input.practicalCompletionDate) {
    errors.push(
      'This certificate is dated after practical completion. Those are adjusted by the late-certificate method (manual cl 8.0), which this calculator does not do.',
    );
  }
  if (input.previousIndexMonth && !isMonth(input.previousIndexMonth)) errors.push('Previous index month must be YYYY-MM.');
  if (errors.length) return result;

  result.indexMonth = indexMonth;
  if (indexMonth <= input.baseMonth) {
    errors.push(`The index month ${indexMonth} is not after the base month ${input.baseMonth}; no adjustment applies yet.`);
    return result;
  }
  // cl 7.1: average every index month published since the one last used.
  const xeMonths =
    input.previousIndexMonth && input.previousIndexMonth < indexMonth
      ? monthsBetween(input.previousIndexMonth, indexMonth)
      : [indexMonth];

  const names = new Map(CPAP_WORK_GROUPS.map((g) => [g.code, g.name]));
  for (const line of input.lines) {
    if (!names.has(line.workGroup)) {
      errors.push(`"${line.workGroup}" is not a CPAP work group.`);
      continue;
    }
    if (!Number.isFinite(line.value)) {
      errors.push(`Work group ${line.workGroup}: value is not a number.`);
      continue;
    }
    const series = table[line.workGroup] ?? {};
    const xo = series[input.baseMonth];
    if (xo === undefined) missing.push({ workGroup: line.workGroup, month: input.baseMonth });
    const xeValues: number[] = [];
    for (const m of xeMonths) {
      const v = series[m];
      if (v === undefined) missing.push({ workGroup: line.workGroup, month: m });
      else xeValues.push(v);
    }
    if (xo === undefined || xeValues.length !== xeMonths.length) continue;
    const xe = xeValues.reduce((s, v) => s + v, 0) / xeValues.length;
    const adjustment = round2(adjustmentAmount(line.value, xe, xo, k));
    result.lines.push({ ...line, name: names.get(line.workGroup)!, xo, xe, xeMonths, adjustment });
  }
  if (missing.length === 0 && errors.length === 0) {
    result.totalValue = round2(result.lines.reduce((s, l) => s + l.value, 0));
    result.totalAdjustment = round2(result.lines.reduce((s, l) => s + l.adjustment, 0));
  } else {
    result.lines = [];
  }
  return result;
}
