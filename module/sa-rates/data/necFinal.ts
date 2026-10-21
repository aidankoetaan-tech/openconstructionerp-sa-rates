// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * NEC4 Engineering and Construction Contract: final assessment of the amount due.
 *
 * Read from the NEC4 ECC (June 2017) core clauses and main Options A to E. Clause numbers
 * only; no contract text is reproduced.
 *
 *   cl 53.1  The Project Manager assesses the final amount due no later than four weeks after
 *            the Supervisor issues the Defects Certificate, or thirteen weeks after a termination
 *            certificate. Payment within three weeks of the assessment unless the Contract Data
 *            states another period.
 *   cl 53.2  If the Project Manager is late, the Contractor may issue its own assessment.
 *   cl 53.3  The assessment is conclusive unless a Party refers it within the W1, W2 or W3 periods
 *            (four weeks from issue to the Senior Representatives, Adjudicator or Dispute
 *            Avoidance Board).
 *   cl 50.3  Amount due = Price for Work Done to Date + other amounts to be paid to the Contractor
 *            − amounts to be paid by or retained from the Contractor.
 *   cl 51.1  The payment is the change in the amount due since the previous assessment; a
 *            reduction is paid by the Contractor. cl 51.5 adds tax the law requires.
 *
 * Price for Work Done to Date (11.2):
 *   A  total of the Prices for completed activities and groups of activities.
 *   B  completed quantities × rates plus the completed proportion of each lump sum.
 *   C, D, E  Defined Cost (cost of the Schedule of Cost Components less Disallowed Cost)
 *            plus the Fee (fee percentage applied to Defined Cost).
 *
 * Contractor's share (C cl 54.1–54.4, D cl 54.5–54.8): the difference between the total of the
 * Prices (C) or the Total of the Prices (D: BoQ value of completed work) and the final PWDD is
 * split into increments across the share ranges, whose limits are PWDD ÷ total of the Prices as a
 * percentage. Share = Σ increment × Contractor's share percentage. A saving is paid to the
 * Contractor; an excess is paid by the Contractor. Included in the final amount due.
 *
 * Secondary Options that carry money into the final assessment:
 *   X1   A, B: an amount for price adjustment is included in the amount due (X1.3).
 *        C, D: price adjustment is added to the total of the Prices (X1.4), so it moves the share.
 *        Not used with E.
 *   X6   bonus per day from the earlier of Completion and take-over until the Completion Date.
 *   X7   delay damages per day from the Completion Date until the earliest of Completion,
 *        take-over and a termination certificate. Partial take-over (X7.3) is entered by hand.
 *   X14  any advanced payment not yet repaid.
 *   X16  nothing is retained after the Defects Certificate is due (X16.2).
 *   X17  low performance damages.
 *   cl 46  uncorrected Defects: the cost assessed by the Project Manager is paid by the Contractor.
 *
 * Not covered: Option F, termination amounts (cl 93), X3 multiple currencies, X22 budget incentive
 * arithmetic (enter it as another amount), and the NEC3 ECC.
 */

export type MainOption = 'A' | 'B' | 'C' | 'D' | 'E';
export type DisputeOption = 'W1' | 'W2' | 'W3';

export const MAIN_OPTIONS: { code: MainOption; name: string }[] = [
  { code: 'A', name: 'Priced contract with activity schedule' },
  { code: 'B', name: 'Priced contract with bill of quantities' },
  { code: 'C', name: 'Target contract with activity schedule' },
  { code: 'D', name: 'Target contract with bill of quantities' },
  { code: 'E', name: 'Cost reimbursable contract' },
];

export const isTarget = (o: MainOption): boolean => o === 'C' || o === 'D';
export const isCostBased = (o: MainOption): boolean => o === 'C' || o === 'D' || o === 'E';

/** One share range: PWDD ÷ total of the Prices from `from` % up to `to` % (null = no upper limit). */
export interface ShareRange {
  from: number;
  to: number | null;
  /** Contractor's share percentage as a fraction, e.g. 0.5. */
  share: number;
}

export interface Adjustment {
  label: string;
  amount: number;
}

export interface NecFinalInput {
  option: MainOption;
  dispute: DisputeOption;
  /** A, B: final Price for Work Done to Date. Ignored for C, D, E. */
  pricedPwdd: number;
  /** C, D, E: cost of the components in the Schedule of Cost Components, before Disallowed Cost. */
  costOfComponents: number;
  disallowed: Adjustment[];
  /** C, D, E: fee percentage as a fraction. */
  feePercentage: number;
  /** C: final total of the Prices. D: final Total of the Prices (BoQ value of completed work). */
  totalOfPrices: number;
  shareRanges: ShareRange[];
  /** X1: A, B amount for price adjustment to date (X1.3); C, D amount added to the total of the Prices (X1.4). */
  priceAdjustment: number;
  /** X6 */
  bonusPerDay: number;
  /** X7 */
  delayDamagesPerDay: number;
  /** X7.3 reduction for partial take-over, entered as an amount. */
  delayDamagesReduction: number;
  completionDate?: string;
  completion?: string;
  takeOver?: string;
  terminationCertificate?: string;
  /** X14 advanced payment not repaid at the final assessment. */
  advancedPaymentOutstanding: number;
  /** X17 */
  lowPerformanceDamages: number;
  /** cl 46 */
  uncorrectedDefects: number;
  otherToContractor: Adjustment[];
  otherByContractor: Adjustment[];
  /** Amount due at the previous assessment (cumulative), excl tax. */
  previousAmountDue: number;
  vatRate: number;
  defectsCertificate?: string;
  /** Payment period from the Contract Data, in weeks (default three, cl 53.1). */
  paymentWeeks: number;
  /** Date the final assessment is issued, if it has been. */
  assessmentDate?: string;
}

export interface Line {
  ref: string;
  label: string;
  amount: number;
  /** Shown but not added: an explanatory or nil line. */
  info?: boolean;
}

export interface ShareIncrement {
  from: number;
  to: number;
  increment: number;
  share: number;
  amount: number;
}

export interface ShareResult {
  /** Total of the Prices − PWDD: positive is a saving. */
  difference: number;
  /** PWDD ÷ total of the Prices, as a percentage. */
  ratio: number;
  increments: ShareIncrement[];
  /** Positive: paid to the Contractor. Negative: paid by the Contractor. */
  share: number;
}

export interface NecFinalResult {
  pwdd: number;
  defined: number;
  fee: number;
  share: ShareResult | null;
  bonusDays: number;
  delayDays: number;
  lines: Line[];
  finalAmountDue: number;
  /** Final amount due − previous amount due. Positive: Client pays. Negative: Contractor pays. */
  payment: number;
  tax: number;
  paymentInclTax: number;
  dates: { assessmentDue?: string; paymentDue?: string; conclusiveUnlessReferredBy?: string; dueFrom: 'defects' | 'termination' | null };
  errors: string[];
  notes: string[];
}

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const sum = (xs: Adjustment[]): number => xs.reduce((s, x) => s + (Number.isFinite(x.amount) ? x.amount : 0), 0);

const DAY = 86_400_000;
const parse = (iso?: string): number | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Number.isFinite(t) ? t : null;
};
const fmt = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => fmt(parse(iso)! + days * DAY);

/** Days from a to b (b − a), or 0 if either is missing or b is not after a. */
function daysAfter(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  return Math.max(0, Math.round((b - a) / DAY));
}

export function checkShareRanges(ranges: ShareRange[]): string[] {
  const errs: string[] = [];
  if (!ranges.length) return ['Enter the share ranges from the Contract Data.'];
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  if (sorted[0]!.from > 0) errs.push('The first share range must start at 0 %.');
  sorted.forEach((r, i) => {
    if (r.share < 0 || r.share > 1) errs.push(`Share range ${i + 1}: the Contractor's share must be between 0 and 100 %.`);
    if (r.to !== null && r.to <= r.from) errs.push(`Share range ${i + 1}: the upper limit must be above the lower limit.`);
    const next = sorted[i + 1];
    if (next && r.to !== next.from) errs.push(`Share ranges ${i + 1} and ${i + 2} leave a gap or overlap.`);
    if (!next && r.to !== null) errs.push('The last share range must have no upper limit.');
  });
  return errs;
}

/**
 * The Contractor's share under cl 54. The difference between the total of the Prices and the
 * PWDD runs between the two ratios (PWDD ÷ total, and 100 %); each part of it is shared at the
 * percentage of the range it falls in.
 */
export function contractorShare(pwdd: number, totalOfPrices: number, ranges: ShareRange[]): ShareResult {
  const ratio = (pwdd / totalOfPrices) * 100;
  const lo = Math.min(ratio, 100);
  const hi = Math.max(ratio, 100);
  const saving = pwdd < totalOfPrices;
  const increments: ShareIncrement[] = [];
  for (const r of [...ranges].sort((a, b) => a.from - b.from)) {
    const top = r.to ?? Infinity;
    const a = Math.max(lo, r.from);
    const b = Math.min(hi, top);
    if (b <= a) continue;
    const increment = ((b - a) / 100) * totalOfPrices;
    increments.push({ from: a, to: b, increment, share: r.share, amount: increment * r.share * (saving ? 1 : -1) });
  }
  return {
    difference: totalOfPrices - pwdd,
    ratio,
    increments,
    share: increments.reduce((s, x) => s + x.amount, 0),
  };
}

export function necFinalAccount(i: NecFinalInput): NecFinalResult {
  const errors: string[] = [];
  const notes: string[] = [];
  const cost = isCostBased(i.option);
  const target = isTarget(i.option);

  const disallowed = sum(i.disallowed);
  const defined = cost ? i.costOfComponents - disallowed : 0;
  const fee = cost ? defined * i.feePercentage : 0;
  const pwdd = cost ? defined + fee : i.pricedPwdd;

  if (cost && !(i.costOfComponents > 0)) errors.push('Enter the final cost of the components in the Schedule of Cost Components.');
  if (cost && !(i.feePercentage >= 0)) errors.push('Enter the fee percentage from the Contract Data.');
  if (!cost && !(i.pricedPwdd > 0)) errors.push('Enter the final Price for Work Done to Date.');
  if (i.option === 'E' && i.priceAdjustment) errors.push('Option X1 is not used with Option E.');

  let share: ShareResult | null = null;
  if (target) {
    const tp = i.totalOfPrices + i.priceAdjustment;
    if (!(i.totalOfPrices > 0)) errors.push(i.option === 'D' ? 'Enter the final Total of the Prices (BoQ value of completed work).' : 'Enter the final total of the Prices.');
    errors.push(...checkShareRanges(i.shareRanges));
    if (!errors.length) share = contractorShare(pwdd, tp, i.shareRanges);
  }

  const cd = parse(i.completionDate);
  const done = parse(i.completion);
  const taken = parse(i.takeOver);
  const term = parse(i.terminationCertificate);
  const bonusFrom = [done, taken].filter((x): x is number => x !== null);
  const bonusDays = i.bonusPerDay > 0 && bonusFrom.length ? daysAfter(Math.min(...bonusFrom), cd) : 0;
  const delayTo = [done, taken, term].filter((x): x is number => x !== null);
  const delayDays = i.delayDamagesPerDay > 0 && delayTo.length ? daysAfter(cd, Math.min(...delayTo)) : 0;
  if ((i.bonusPerDay > 0 || i.delayDamagesPerDay > 0) && cd === null) errors.push('Enter the Completion Date to work out the X6 bonus or X7 delay damages.');
  const delayDamages = Math.max(0, delayDays * i.delayDamagesPerDay - i.delayDamagesReduction);

  const lines: Line[] = [];
  if (cost) {
    lines.push({ ref: '11.2', label: 'Cost of components (Schedule of Cost Components)', amount: i.costOfComponents, info: true });
    for (const d of i.disallowed) lines.push({ ref: '11.2', label: `Less Disallowed Cost: ${d.label || 'unnamed'}`, amount: -d.amount, info: true });
    lines.push({ ref: '11.2', label: 'Defined Cost', amount: defined, info: true });
    lines.push({ ref: '11.2', label: `Fee at ${(i.feePercentage * 100).toFixed(2)} %`, amount: fee, info: true });
  }
  lines.push({ ref: '50.3', label: 'Price for Work Done to Date', amount: pwdd });
  if ((i.option === 'A' || i.option === 'B') && i.priceAdjustment) lines.push({ ref: 'X1.3', label: 'Price adjustment for inflation', amount: i.priceAdjustment });
  if (target && share) {
    if (i.priceAdjustment) lines.push({ ref: 'X1.4', label: 'Price adjustment added to the total of the Prices (in the share, not paid directly)', amount: i.priceAdjustment, info: true });
    lines.push({
      ref: i.option === 'C' ? '54.4' : '54.8',
      label: share.share >= 0 ? "Contractor's share of the saving" : "Contractor's share of the excess",
      amount: share.share,
    });
  }
  if (bonusDays) lines.push({ ref: 'X6.1', label: `Bonus for early Completion, ${bonusDays} days`, amount: bonusDays * i.bonusPerDay });
  for (const o of i.otherToContractor) lines.push({ ref: '50.3', label: o.label || 'Other amount to the Contractor', amount: o.amount });
  if (delayDamages) lines.push({ ref: 'X7.1', label: `Delay damages, ${delayDays} days${i.delayDamagesReduction ? ' less X7.3 reduction' : ''}`, amount: -delayDamages });
  if (i.lowPerformanceDamages) lines.push({ ref: 'X17.1', label: 'Low performance damages', amount: -i.lowPerformanceDamages });
  if (i.uncorrectedDefects) lines.push({ ref: '46', label: 'Uncorrected Defects', amount: -i.uncorrectedDefects });
  if (i.advancedPaymentOutstanding) lines.push({ ref: 'X14.3', label: 'Advanced payment not yet repaid', amount: -i.advancedPaymentOutstanding });
  for (const o of i.otherByContractor) lines.push({ ref: '50.3', label: o.label || 'Other amount paid by the Contractor', amount: -o.amount });
  lines.push({ ref: 'X16.2', label: 'Retention: nothing retained once the Defects Certificate is due', amount: 0, info: true });

  const finalAmountDue = r2(lines.filter((l) => !l.info).reduce((s, l) => s + l.amount, 0));
  const payment = r2(finalAmountDue - i.previousAmountDue);
  const tax = r2(payment * i.vatRate);

  if (i.option === 'E') notes.push('Option E has no Contractor’s share; the Prices are a forecast only.');
  if (target && share && share.ratio > 0) notes.push(`PWDD is ${share.ratio.toFixed(2)} % of the total of the Prices.`);

  const dc = parse(i.defectsCertificate);
  const dueFrom: 'defects' | 'termination' | null = term !== null ? 'termination' : dc !== null ? 'defects' : null;
  const dates: NecFinalResult['dates'] = { dueFrom };
  if (dueFrom === 'termination') dates.assessmentDue = fmt(term! + 13 * 7 * DAY);
  else if (dueFrom === 'defects') dates.assessmentDue = fmt(dc! + 4 * 7 * DAY);
  const issued = parse(i.assessmentDate);
  if (issued !== null) {
    dates.paymentDue = fmt(issued + (i.paymentWeeks || 3) * 7 * DAY);
    dates.conclusiveUnlessReferredBy = fmt(issued + 4 * 7 * DAY);
    if (dates.assessmentDue && i.assessmentDate! > dates.assessmentDue) {
      notes.push('The assessment was issued after the cl 53.1 period; under cl 53.2 the Contractor could have issued its own.');
    }
  }
  if (term !== null) notes.push('After termination the amounts due follow cl 93, which this tab does not work out.');

  return {
    pwdd: r2(pwdd),
    defined: r2(defined),
    fee: r2(fee),
    share: share ? { ...share, share: r2(share.share) } : null,
    bonusDays,
    delayDays,
    lines: lines.map((l) => ({ ...l, amount: r2(l.amount) })),
    finalAmountDue,
    payment,
    tax,
    paymentInclTax: r2(payment + tax),
    dates,
    errors,
    notes,
  };
}

export const DISPUTE_ROUTE: Record<DisputeOption, string> = {
  W1: 'refer to the Senior Representatives within four weeks of the assessment (cl 53.3, Option W1)',
  W2: 'refer to the Senior Representatives or the Adjudicator within four weeks of the assessment (cl 53.3, Option W2)',
  W3: 'refer to the Dispute Avoidance Board (cl 53.3, Option W3)',
};

export function necFinalCsv(r: NecFinalResult, i: NecFinalInput, title: string): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    esc(title),
    `${esc('Contract')},${esc(`NEC4 ECC Option ${i.option}`)}`,
    '',
    'ref,item,amount_excl_tax,counted',
    ...r.lines.map((l) => [l.ref, esc(l.label), l.amount.toFixed(2), l.info ? 'no' : 'yes'].join(',')),
    `53.1,${esc('Final amount due')},${r.finalAmountDue.toFixed(2)},`,
    `51.1,${esc('Less amount due at the previous assessment')},${(-i.previousAmountDue).toFixed(2)},`,
    `51.1,${esc(r.payment >= 0 ? 'Final payment by the Client' : 'Final payment by the Contractor')},${r.payment.toFixed(2)},`,
    `51.5,${esc('Tax')},${r.tax.toFixed(2)},`,
    `,${esc('Final payment incl tax')},${r.paymentInclTax.toFixed(2)},`,
  ];
  if (r.share) {
    rows.push('', 'share_range_from_pct,share_range_to_pct,increment,contractor_share_pct,share_amount');
    for (const s of r.share.increments) {
      rows.push([s.from.toFixed(2), s.to.toFixed(2), s.increment.toFixed(2), (s.share * 100).toFixed(1), s.amount.toFixed(2)].join(','));
    }
  }
  rows.push('', esc('Arithmetic per the NEC4 ECC (June 2017) cl 50, 51, 53 and 54 and the secondary Options named. Check against the Contract Data and any Z clauses.'));
  return rows.join('\n') + '\n';
}
