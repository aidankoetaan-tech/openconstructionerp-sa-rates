// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * JBCC Principal Building Agreement, Edition 6.2 (June 2024): final account and final payment
 * certificate. Clause numbers only; no JBCC text is reproduced.
 *
 * Final contract value = contract sum adjusted under cl 26:
 *   26.2   contract instructions: 26.2.1 similar work at the priced-document rates, 26.2.2 rates
 *          adjusted to the changed circumstances, 26.2.3 labour, construction equipment and
 *          materials plus a 10 % mark-up, 26.2.4 omissions at the priced-document rates.
 *   26.3   provisional work: omit the provisional value, add the work as executed.
 *   26.4   payments by the contractor on instruction for authorities' charges, opening up and
 *          testing, insurances: amount paid plus 10 %.
 *   26.5–26.8  expense and/or loss (including delay under 23.2 and 23.3, assessed under 26.7):
 *          notice within 20 working days of becoming aware or the claim is forfeited; claim within
 *          40 working days of the notice (or longer if the principal agent allows); assessment
 *          within 20 working days of receipt, otherwise deemed refused.
 *   26.9.1 prime cost amounts and budgetary allowances omitted, actual value added.
 *   26.9.2 provisional sums omitted, actual value added.
 *   26.9.3 the contractor's profit and attendance on those items prorated (excluding cost
 *          fluctuations).
 *   26.9.4 preliminaries adjusted by the method selected in the Contract Data.
 *   26.9.5 contract price adjustment (cost fluctuations), if applicable.
 *   26.9.6 rectification of discrepancies, errors and omissions.
 *
 * Dates: final account within 60 working days of practical completion (26.10); the contractor
 * accepts within 30 working days or gives notice of non-acceptance, otherwise it is deemed
 * accepted (26.11); unresolved after 10 working days, the contractor may declare a disagreement
 * (26.12); final payment certificate within 7 calendar days of acceptance (26.13, 25.15) but not
 * before the certificate of final completion. While the account is disputed, interim
 * certificates are issued for the undisputed amounts (25.16).
 *
 * Final payment certificate: 100 % of the final account including adjustments under 26 and 27
 * (25.9), with no security retained (25.12.3, 11.4.1). Built with the payment certificate
 * module's cl 25.3 arithmetic at stage "final". Payment within 14 calendar days by the employer
 * (25.10) or 21 by the contractor (25.11).
 */
import { buildCertificate, type Certificate, type RecoveryItem, type SecurityMode } from './certificate';
import { addCalendarDays, addWorkingDays, workingDaysBetween, type Calendar } from './workingDays';

export type InstructionBasis = 'similar' | 'adjusted' | 'cost' | 'omission';

export const INSTRUCTION_BASES: { key: InstructionBasis; clause: string; label: string }[] = [
  { key: 'similar', clause: '26.2.1', label: 'Similar work, priced-document rates' },
  { key: 'adjusted', clause: '26.2.2', label: 'Not similar, adjusted rates' },
  { key: 'cost', clause: '26.2.3', label: 'Labour, equipment, materials + 10 %' },
  { key: 'omission', clause: '26.2.4', label: 'Omission' },
];

export interface InstructionRow {
  ref: string;
  description: string;
  basis: InstructionBasis;
  /** Positive amount; omissions are entered as positive and deducted. 26.2.3 rows are entered at cost. */
  amount: number;
}

export interface ProvisionalRow {
  description: string;
  provisional: number;
  executed: number;
}

export type PaymentKind = 'authority' | 'testing' | 'insurance';

export interface PaymentRow {
  description: string;
  kind: PaymentKind;
  paid: number;
}

export interface ClaimRow {
  description: string;
  /** e.g. 23.2.3 */
  basis: string;
  aware?: string;
  notice?: string;
  submitted?: string;
  /** Amount assessed by the principal agent under 26.7; null if not yet assessed. */
  assessed: number | null;
}

export interface AllowanceRow {
  description: string;
  /** Amount in the contract sum (PC amount, budgetary allowance or provisional sum). */
  inSum: number;
  /** Actual value of the work, excl cost fluctuations. */
  actual: number;
  /** The contractor's tendered profit and attendance on this item. */
  profitAttendance: number;
}

export interface AmountRow {
  description: string;
  amount: number;
}

export type Response = 'none' | 'accepted' | 'not_accepted';

export interface JbccFinalInput {
  contractSum: number;
  security: SecurityMode;
  instructions: InstructionRow[];
  provisionalWork: ProvisionalRow[];
  payments: PaymentRow[];
  claims: ClaimRow[];
  pcAllowances: AllowanceRow[];
  provisionalSums: AllowanceRow[];
  preliminaries: AmountRow[];
  costFluctuations: number;
  rectifications: AmountRow[];
  recovery: RecoveryItem[];
  previouslyCertified: number;
  vatRegistered: boolean;
  vatRate: number;
  practicalCompletion?: string;
  finalCompletion?: string;
  finalAccountIssued?: string;
  response: Response;
  responseDate?: string;
  finalPaymentCertificateIssued?: string;
  calendar: Calendar;
}

export interface FaLine {
  clause: string;
  label: string;
  amount: number;
  note?: string;
}

export interface FaGroup {
  clause: string;
  title: string;
  lines: FaLine[];
  total: number;
}

export interface ClaimStatus {
  row: ClaimRow;
  included: boolean;
  status: 'assessed' | 'forfeited' | 'deemed_refused' | 'awaiting_assessment' | 'incomplete';
  noticeWorkingDays?: number;
  claimWorkingDays?: number;
  assessmentDue?: string;
  flags: string[];
}

export interface JbccFinalResult {
  groups: FaGroup[];
  claims: ClaimStatus[];
  adjustments: number;
  finalContractValue: number;
  /** Final contract value ÷ contract sum − 1. */
  variance: number;
  certificate: Certificate | null;
  dates: {
    finalAccountDue?: string;
    acceptanceDue?: string;
    disagreementFrom?: string;
    acceptedOn?: string;
    finalPaymentCertificateDue?: string;
  };
  errors: string[];
  notes: string[];
}

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const total = (ls: FaLine[]) => r2(ls.reduce((s, l) => s + l.amount, 0));

const PAYMENT_LABEL: Record<PaymentKind, string> = {
  authority: 'Charges by authorities',
  testing: 'Opening up and testing',
  insurance: 'Insurances',
};

export function instructionValue(r: InstructionRow): number {
  if (r.basis === 'omission') return -Math.abs(r.amount);
  if (r.basis === 'cost') return r.amount * 1.1;
  return r.amount;
}

/** 26.9.1–26.9.3: omit the amount in the sum, add the actual value, prorate profit and attendance. */
export function allowanceAdjustment(r: AllowanceRow): { actual: number; profitAttendance: number; total: number } {
  const prorated = r.inSum > 0 ? (r.profitAttendance * r.actual) / r.inSum : r.profitAttendance;
  const actual = r.actual - r.inSum;
  const pa = prorated - r.profitAttendance;
  return { actual, profitAttendance: pa, total: actual + pa };
}

export function claimStatus(r: ClaimRow, cal: Calendar, asAt?: string): ClaimStatus {
  const flags: string[] = [];
  const s: ClaimStatus = { row: r, included: false, status: 'incomplete', flags };
  if (r.aware && r.notice) {
    s.noticeWorkingDays = workingDaysBetween(r.aware, r.notice, cal);
    if (s.noticeWorkingDays > 20) {
      flags.push(`Notice given ${s.noticeWorkingDays} working days after becoming aware: forfeited under 26.5.`);
      s.status = 'forfeited';
      return s;
    }
  } else {
    flags.push('Enter the dates of awareness and notice to check 26.5.');
  }
  if (r.notice && r.submitted) {
    s.claimWorkingDays = workingDaysBetween(r.notice, r.submitted, cal);
    if (s.claimWorkingDays > 40) flags.push(`Claim submitted ${s.claimWorkingDays} working days after notice: outside 26.6 unless the principal agent allowed more time.`);
    s.assessmentDue = addWorkingDays(r.submitted, 20, cal);
  }
  if (r.assessed !== null && Number.isFinite(r.assessed)) {
    s.status = 'assessed';
    s.included = true;
    return s;
  }
  if (s.assessmentDue && asAt && asAt > s.assessmentDue) {
    s.status = 'deemed_refused';
    flags.push('Not assessed within 20 working days: deemed refused (26.8). The contractor may give notice of disagreement (30.1).');
  } else if (s.assessmentDue) {
    s.status = 'awaiting_assessment';
  }
  return s;
}

export function jbccFinalAccount(i: JbccFinalInput): JbccFinalResult {
  const errors: string[] = [];
  const notes: string[] = [];
  if (!(i.contractSum > 0)) errors.push('Enter the contract sum.');

  const groups: FaGroup[] = [];
  const add = (clause: string, title: string, lines: FaLine[]) => {
    if (lines.length) groups.push({ clause, title, lines, total: total(lines) });
  };

  add(
    '26.2',
    'Contract instructions',
    i.instructions.map((r) => {
      const b = INSTRUCTION_BASES.find((x) => x.key === r.basis)!;
      return {
        clause: b.clause,
        label: [r.ref, r.description].filter(Boolean).join(': ') || b.label,
        amount: r2(instructionValue(r)),
        note: r.basis === 'cost' ? `${r2(r.amount).toFixed(2)} at cost + 10 %` : undefined,
      };
    }),
  );
  add(
    '26.3',
    'Provisional work remeasured',
    i.provisionalWork.map((r) => ({
      clause: '26.3',
      label: r.description || 'Provisional work',
      amount: r2(r.executed - r.provisional),
      note: `${r2(r.provisional).toFixed(2)} omitted, ${r2(r.executed).toFixed(2)} as executed`,
    })),
  );
  add(
    '26.4',
    'Payments by the contractor on instruction',
    i.payments.map((r) => ({
      clause: '26.4',
      label: `${PAYMENT_LABEL[r.kind]}${r.description ? `: ${r.description}` : ''}`,
      amount: r2(r.paid * 1.1),
      note: `${r2(r.paid).toFixed(2)} paid + 10 %`,
    })),
  );

  const asAt = i.finalAccountIssued;
  const claims = i.claims.map((c) => claimStatus(c, i.calendar, asAt));
  add(
    '26.5–26.8',
    'Expense and/or loss, including delay (23.2, 23.3)',
    claims
      .filter((c) => c.included)
      .map((c) => ({
        clause: c.row.basis ? `26.7; ${c.row.basis}` : '26.7',
        label: c.row.description || 'Claim',
        amount: r2(c.row.assessed ?? 0),
      })),
  );

  const allowanceLines = (rows: AllowanceRow[], clause: string, what: string): FaLine[] =>
    rows.flatMap((r) => {
      const a = allowanceAdjustment(r);
      const ls: FaLine[] = [
        {
          clause,
          label: `${r.description || what}: actual less ${what.toLowerCase()}`,
          amount: r2(a.actual),
          note: `${r2(r.inSum).toFixed(2)} omitted, ${r2(r.actual).toFixed(2)} actual`,
        },
      ];
      if (r.profitAttendance) {
        ls.push({ clause: '26.9.3', label: `${r.description || what}: profit and attendance prorated`, amount: r2(a.profitAttendance) });
      }
      return ls;
    });
  add('26.9.1', 'Prime cost amounts and budgetary allowances', allowanceLines(i.pcAllowances, '26.9.1', 'Allowance'));
  add('26.9.2', 'Provisional sums', allowanceLines(i.provisionalSums, '26.9.2', 'Provisional sum'));
  add(
    '26.9.4',
    'Preliminaries (method in the Contract Data)',
    i.preliminaries.map((r) => ({ clause: '26.9.4', label: r.description || 'Preliminaries adjustment', amount: r2(r.amount) })),
  );
  if (i.costFluctuations) add('26.9.5', 'Contract price adjustment (cost fluctuations)', [{ clause: '26.9.5', label: 'Cost fluctuations to final', amount: r2(i.costFluctuations) }]);
  add(
    '26.9.6',
    'Rectifications',
    i.rectifications.map((r) => ({ clause: '26.9.6', label: r.description || 'Rectification', amount: r2(r.amount) })),
  );

  const adjustments = r2(groups.reduce((s, g) => s + g.total, 0));
  const finalContractValue = r2(i.contractSum + adjustments);
  const variance = i.contractSum > 0 ? finalContractValue / i.contractSum - 1 : 0;

  if (variance > 0.1) notes.push('The contract value exceeds the contract sum by more than 10 %: the guarantee for payment is to be adjusted at the employer’s expense (11.7).');
  for (const c of claims) {
    if (c.status === 'forfeited') notes.push(`${c.row.description || 'A claim'} is left out: forfeited under 26.5.`);
    if (c.status === 'deemed_refused') notes.push(`${c.row.description || 'A claim'} is left out: deemed refused under 26.8.`);
    if (c.status === 'awaiting_assessment') notes.push(`${c.row.description || 'A claim'} is left out until assessed (due ${c.assessmentDue}).`);
  }

  // Dates
  const dates: JbccFinalResult['dates'] = {};
  if (i.practicalCompletion) dates.finalAccountDue = addWorkingDays(i.practicalCompletion, 60, i.calendar);
  if (i.finalAccountIssued) {
    dates.acceptanceDue = addWorkingDays(i.finalAccountIssued, 30, i.calendar);
    if (dates.finalAccountDue && i.finalAccountIssued > dates.finalAccountDue) {
      notes.push(`The final account was issued after the 60 working days allowed by 26.10 (due ${dates.finalAccountDue}).`);
    }
  }
  if (i.response === 'accepted' && i.responseDate) dates.acceptedOn = i.responseDate;
  if (i.response === 'none' && dates.acceptanceDue) {
    dates.acceptedOn = dates.acceptanceDue;
    notes.push('No acceptance or notice of non-acceptance recorded: the account is deemed accepted at the end of the 30 working days (26.11).');
  }
  if (i.response === 'not_accepted' && i.responseDate) {
    dates.disagreementFrom = addWorkingDays(i.responseDate, 10, i.calendar);
    notes.push('While the final account is disputed, interim certificates are issued for the undisputed amounts (25.16).');
  }
  if (dates.acceptedOn) {
    let due = addCalendarDays(dates.acceptedOn, 7)!;
    if (i.finalCompletion && i.finalCompletion > due) {
      due = i.finalCompletion;
      notes.push('The final payment certificate waits for the certificate of final completion (25.15).');
    }
    if (!i.finalCompletion) notes.push('The final payment certificate cannot issue before the certificate of final completion (25.15).');
    dates.finalPaymentCertificateDue = due;
  }

  let certificate: Certificate | null = null;
  if (!errors.length) {
    certificate = buildCertificate({
      contractSum: i.contractSum,
      security: i.security,
      stage: 'final',
      workValue: r2(finalContractValue - i.costFluctuations),
      materialsOnSite: 0,
      materialsOffSite: 0,
      offSiteCovered: false,
      costFluctuations: i.costFluctuations,
      withheldToDate: 0,
      previouslyCertified: i.previouslyCertified,
      recovery: i.recovery,
      vatRegistered: i.vatRegistered,
      vatRate: i.vatRate,
      issueDate: i.finalPaymentCertificateIssued ?? dates.finalPaymentCertificateDue,
    });
    if (certificate.errors.length) errors.push(...certificate.errors);
  }

  return { groups, claims, adjustments, finalContractValue, variance, certificate, dates, errors, notes };
}

export function jbccFinalCsv(r: JbccFinalResult, i: JbccFinalInput, title: string): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [esc(title), `${esc('Contract')},${esc('JBCC PBA Edition 6.2 (June 2024)')}`, '', 'clause,item,amount_excl_vat,note'];
  rows.push(`,${esc('Contract sum')},${i.contractSum.toFixed(2)},`);
  for (const g of r.groups) {
    for (const l of g.lines) rows.push([l.clause, esc(l.label), l.amount.toFixed(2), esc(l.note ?? '')].join(','));
  }
  rows.push(`,${esc('Total adjustments')},${r.adjustments.toFixed(2)},`);
  rows.push(`26.10,${esc('Final contract value')},${r.finalContractValue.toFixed(2)},${esc(`${(r.variance * 100).toFixed(2)} % on the contract sum`)}`);
  if (r.certificate) {
    rows.push('', esc('Final payment certificate (25.9, 25.12.3)'), 'clause,item,amount');
    for (const l of r.certificate.lines) rows.push([l.ref, esc(l.label), l.amount.toFixed(2)].join(','));
  }
  rows.push('', esc('Arithmetic per JBCC PBA 6.2 clauses 25, 26 and 27. Check against the Contract Data before issue.'));
  return rows.join('\n') + '\n';
}
