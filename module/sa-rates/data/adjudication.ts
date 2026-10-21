// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Tender adjudication for South African public construction tenders.
 *
 * Preference points: Preferential Procurement Regulations, 2022 (PPPFA).
 *   reg 4  80/20 where the Rand value is equal to or below R50 million, inclusive of all
 *          applicable taxes; reg 5  90/10 above it. "Rand value" is the total estimated value
 *          of the contract at the time of the tender invitation.
 *   Ps = W × (1 − (Pt − Pmin) / Pmin), W = 80 or 90
 *          Pt   price of the tender under consideration
 *          Pmin price of the lowest acceptable tender
 *          "price" includes all applicable taxes less all unconditional discounts.
 *   Specific goal points: at most 20 (80/20) or 10 (90/10), as specified in the tender.
 *   Points are added and rounded to two decimals; award to the highest points (reg 4, 5).
 *   Equal points: the tenderer with the most specific goal points; equal in all respects:
 *   drawing of lots (reg 8).
 *   The regulations set no floor on price points, so a tender more than double Pmin scores
 *   negative price points here and is flagged, not clipped.
 *   Not covered: income-generating tenders (the Pmax formula).
 *
 * CIDB grading: Construction Industry Development Regulations, Table 8 of reg 17, tender value
 *   limits as amended with effect from 7 October 2019 (Government Gazette 42561, 5 July 2019).
 *   The tool works out the lowest grade whose limit covers the estimated value; the tender
 *   data governs and can set a different minimum.
 *
 * Responsiveness is a judgement for the bid evaluation committee. This module records the
 * checks, applies the arithmetic and says which tender scores highest among those marked
 * responsive. It recommends nothing on its own.
 */

export const PPPFA_THRESHOLD = 50_000_000;

/** Upper tender value limit per CIDB grade (R); grade 9 has none. */
export const CIDB_GRADE_LIMITS: { grade: number; limit: number | null }[] = [
  { grade: 1, limit: 500_000 },
  { grade: 2, limit: 1_000_000 },
  { grade: 3, limit: 3_000_000 },
  { grade: 4, limit: 6_000_000 },
  { grade: 5, limit: 10_000_000 },
  { grade: 6, limit: 20_000_000 },
  { grade: 7, limit: 60_000_000 },
  { grade: 8, limit: 200_000_000 },
  { grade: 9, limit: null },
];

export const CIDB_CLASSES: { code: string; name: string }[] = [
  { code: 'GB', name: 'General building' },
  { code: 'CE', name: 'Civil engineering' },
  { code: 'EB', name: 'Electrical engineering (building)' },
  { code: 'EP', name: 'Electrical engineering (infrastructure)' },
  { code: 'ME', name: 'Mechanical engineering' },
  { code: 'SB', name: 'Specialist works' },
];

export type Check = 'yes' | 'no' | 'pending';

/** Checks that make a tender non-responsive when answered "no" or left pending. */
export const MANDATORY_CHECKS = [
  { key: 'csd', label: 'Registered on the Central Supplier Database (CSD)' },
  { key: 'tax', label: 'Tax compliance status verified (SARS / CSD)' },
  { key: 'cidbActive', label: 'CIDB registration active on the Register of Contractors' },
  { key: 'returnables', label: 'Mandatory returnable documents submitted (SBD forms, pricing schedule)' },
] as const;

export type MandatoryKey = (typeof MANDATORY_CHECKS)[number]['key'];

export interface Bidder {
  name: string;
  /** Tendered price including VAT, less unconditional discounts. */
  price: number;
  cidbGrade: number | null;
  cidbClass: string;
  checks: Record<MandatoryKey, Check>;
  /** Specific goal points verified against the evidence (B-BBEE certificate, affidavit, …). */
  specificGoalPoints: number;
  vatRegistered: boolean;
  notes?: string;
}

export interface TenderInput {
  /** Estimated Rand value at invitation, including taxes (sets 80/20 or 90/10). */
  estimatedValue: number;
  classOfWork: string;
  /** Minimum grade from the tender data; omit to use the grade the estimate requires. */
  minimumGrade?: number;
  /** Deviation from the estimate beyond which a price is flagged, as a fraction. */
  priceFlagThreshold: number;
}

export interface BidResult {
  bidder: Bidder;
  responsive: boolean;
  reasons: string[];
  flags: string[];
  deviationFromEstimate: number;
  pricePoints: number | null;
  goalPoints: number | null;
  totalPoints: number | null;
  rank: number | null;
}

export interface Adjudication {
  system: '80/20' | '90/10';
  priceWeight: number;
  goalCap: number;
  requiredGrade: number;
  lowestAcceptable: number | null;
  results: BidResult[];
  /** The responsive tender with the highest points, if there is a single one. */
  highest: BidResult | null;
  /** Set when the top tenders tie on points and on specific goal points (reg 8: draw lots). */
  drawLotsBetween: string[];
  errors: string[];
}

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export function requiredGrade(estimatedValue: number): number {
  for (const g of CIDB_GRADE_LIMITS) if (g.limit === null || estimatedValue <= g.limit) return g.grade;
  return 9;
}

export function pppfaSystem(estimatedValue: number): { system: '80/20' | '90/10'; priceWeight: number; goalCap: number } {
  return estimatedValue <= PPPFA_THRESHOLD
    ? { system: '80/20', priceWeight: 80, goalCap: 20 }
    : { system: '90/10', priceWeight: 90, goalCap: 10 };
}

export function pricePoints(weight: number, pt: number, pmin: number): number {
  return weight * (1 - (pt - pmin) / pmin);
}

export function adjudicate(tender: TenderInput, bidders: Bidder[]): Adjudication {
  const errors: string[] = [];
  if (!(tender.estimatedValue > 0)) errors.push('The estimated Rand value is needed to pick 80/20 or 90/10 and the CIDB grade.');
  if (!CIDB_CLASSES.some((c) => c.code === tender.classOfWork)) errors.push('Choose the CIDB class of work.');
  const sys = pppfaSystem(tender.estimatedValue);
  const grade = tender.minimumGrade ?? requiredGrade(tender.estimatedValue);
  const base: Adjudication = {
    ...sys,
    requiredGrade: grade,
    lowestAcceptable: null,
    results: [],
    highest: null,
    drawLotsBetween: [],
    errors,
  };
  if (errors.length) return base;

  const results: BidResult[] = bidders.map((b) => {
    const reasons: string[] = [];
    const flags: string[] = [];
    if (!(b.price > 0)) reasons.push('No tendered price.');
    for (const c of MANDATORY_CHECKS) {
      if (b.checks[c.key] === 'no') reasons.push(`${c.label}: no.`);
      else if (b.checks[c.key] !== 'yes') reasons.push(`${c.label}: not yet verified.`);
    }
    if (b.cidbGrade === null) reasons.push('No CIDB grade.');
    else if (b.cidbClass !== tender.classOfWork) reasons.push(`CIDB class ${b.cidbClass || '–'}, tender requires ${tender.classOfWork}.`);
    else if (b.cidbGrade < grade) reasons.push(`CIDB grade ${b.cidbGrade}${b.cidbClass}, tender requires ${grade}${tender.classOfWork} or higher.`);
    if (b.specificGoalPoints < 0) reasons.push('Specific goal points cannot be negative.');
    if (b.specificGoalPoints > sys.goalCap) flags.push(`Specific goal points claimed above the ${sys.goalCap}-point maximum; capped.`);
    const dev = b.price > 0 ? (b.price - tender.estimatedValue) / tender.estimatedValue : 0;
    if (b.price > 0 && Math.abs(dev) > tender.priceFlagThreshold) {
      flags.push(
        `${dev < 0 ? 'Below' : 'Above'} the estimate by ${(Math.abs(dev) * 100).toFixed(1)} %: check the pricing for errors, front-loading or unrealistic rates before relying on it.`,
      );
    }
    return {
      bidder: b,
      responsive: reasons.length === 0,
      reasons,
      flags,
      deviationFromEstimate: dev,
      pricePoints: null,
      goalPoints: null,
      totalPoints: null,
      rank: null,
    };
  });

  const responsive = results.filter((r) => r.responsive);
  if (responsive.length) {
    const pmin = Math.min(...responsive.map((r) => r.bidder.price));
    base.lowestAcceptable = pmin;
    for (const r of responsive) {
      const ps = pricePoints(sys.priceWeight, r.bidder.price, pmin);
      const goals = Math.min(Math.max(r.bidder.specificGoalPoints, 0), sys.goalCap);
      r.pricePoints = r2(ps);
      r.goalPoints = r2(goals);
      r.totalPoints = r2(ps + goals);
      if (ps < 0) r.flags.push('More than double the lowest acceptable price: negative price points (the regulations set no floor).');
    }
    const ordered = [...responsive].sort(
      (a, b) => b.totalPoints! - a.totalPoints! || b.goalPoints! - a.goalPoints!,
    );
    ordered.forEach((r, i) => {
      const prev = ordered[i - 1];
      r.rank = prev && prev.totalPoints === r.totalPoints && prev.goalPoints === r.goalPoints ? prev.rank : i + 1;
    });
    const top = ordered.filter((r) => r.rank === 1);
    if (top.length === 1) base.highest = top[0]!;
    else base.drawLotsBetween = top.map((r) => r.bidder.name);
  }
  base.results = results;
  return base;
}

export function adjudicationCsv(a: Adjudication, tender: TenderInput, title: string): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    esc(title),
    `${esc('System')},${a.system}`,
    `${esc('Estimated Rand value incl VAT')},${tender.estimatedValue.toFixed(2)}`,
    `${esc('CIDB requirement')},${a.requiredGrade}${tender.classOfWork}`,
    `${esc('Lowest acceptable price')},${a.lowestAcceptable === null ? '' : a.lowestAcceptable.toFixed(2)}`,
    '',
    'rank,tenderer,price_incl_vat,vs_estimate_pct,cidb,csd,tax,cidb_active,returnables,responsive,price_points,goal_points,total_points,reasons,flags',
  ];
  const sorted = [...a.results].sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));
  for (const r of sorted) {
    const b = r.bidder;
    rows.push(
      [
        r.rank ?? '',
        esc(b.name),
        b.price.toFixed(2),
        (r.deviationFromEstimate * 100).toFixed(1),
        b.cidbGrade === null ? '' : `${b.cidbGrade}${b.cidbClass}`,
        b.checks.csd,
        b.checks.tax,
        b.checks.cidbActive,
        b.checks.returnables,
        r.responsive ? 'yes' : 'no',
        r.pricePoints ?? '',
        r.goalPoints ?? '',
        r.totalPoints ?? '',
        esc(r.reasons.join(' ')),
        esc(r.flags.join(' ')),
      ].join(','),
    );
  }
  rows.push('', esc('Arithmetic per the Preferential Procurement Regulations, 2022, regs 4, 5 and 8. Responsiveness and award are for the bid committee.'));
  return rows.join('\n') + '\n';
}
