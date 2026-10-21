// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Interim payment certificate under the JBCC Principal Building Agreement,
 * Edition 6.2 (May 2018). Clause numbers below are that edition's.
 *
 * The certificate follows the order of cl 25.3:
 *
 *   25.3.1  value of work executed (to date)
 *   25.3.2  materials and goods (to date) [25.4 on site; 25.5 off site only under a guarantee]
 *   25.3.3  security adjustment [11.1.2; 11.4.1; 25.12]
 *   25.3.4  cost fluctuations (CPAP), if applicable
 *   25.3.5  gross amount certified
 *   25.3.6  amount previously certified
 *   25.3.7  amounts due to either party in the recovery statement [27.1]
 *   25.3.8  tax
 *   25.3.9  interest amounts in the recovery statement
 *   25.3.10 other non-taxable amounts
 *   25.3.11 net amount certified due to the contractor (or the employer, if negative)
 *
 * Security (cl 11.1, chosen by the contractor):
 *   variable  cl 11.1.1  guarantee for construction of 10 % of the contract sum; no deduction
 *   fixed     cl 11.1.2  5 % guarantee plus a payment reduction: cl 25.12 certifies 95 % of the
 *                        value up to the contract sum until practical completion, 97.5 % after it
 *                        and 100 % in the final certificate. Value above the contract sum, and
 *                        cost fluctuations, are certified in full.
 *   none      cl 11.4.1  no guarantee given: the employer may withhold up to 10 % of the contract
 *                        sum, reduced to 2.5 % at practical completion and to 0 % in the final
 *                        certificate. The clause sets the ceiling, not the pace, so the amount
 *                        withheld to date is an input, capped here.
 *
 * Payment falls due within 14 calendar days of the date for issue (cl 25.10); the contractor pays
 * subcontractors within 7 calendar days of the employer's due date (cl 25.13).
 *
 * VAT: the form puts recovery statement amounts (25.3.7) before tax (25.3.8) and interest
 * (25.3.9) and other non-taxable amounts (25.3.10) after it. Each recovery item carries its own
 * treatment; the tax position of a penalty or of damages is for the parties' tax adviser.
 */

export type SecurityMode = 'variable' | 'fixed' | 'none';
export type Stage = 'interim' | 'after_practical_completion' | 'final';

/** Where a recovery statement amount lands on the certificate. */
export type RecoveryTreatment = 'taxable' | 'interest' | 'non_taxable';

export interface RecoveryItem {
  description: string;
  /** Positive when due to the contractor, negative when due to the employer. */
  amount: number;
  treatment: RecoveryTreatment;
  clause?: string;
}

/** Recovery statement headings from cl 27.1, with the usual treatment as a starting point. */
export const RECOVERY_PRESETS: { key: string; description: string; clause: string; sign: 1 | -1; treatment: RecoveryTreatment }[] = [
  { key: 'penalty', description: 'Penalty', clause: '27.1.1; 24.3', sign: -1, treatment: 'taxable' },
  { key: 'employer_default_interest', description: 'Default interest due to the employer', clause: '27.1.2; 25.7.4', sign: -1, treatment: 'interest' },
  { key: 'employer_expense', description: 'Expense and/or loss of the employer', clause: '27.1.3; 27.2', sign: -1, treatment: 'taxable' },
  { key: 'contractor_default_interest', description: 'Default interest due to the contractor', clause: '27.1.4; 25.7.4', sign: 1, treatment: 'interest' },
  { key: 'compensatory_interest', description: 'Compensatory interest', clause: '27.1.5; 25.7.5', sign: 1, treatment: 'interest' },
  { key: 'damages', description: 'Damages', clause: '27.1.6', sign: 1, treatment: 'taxable' },
  { key: 'direct_contractor', description: 'Expense or loss caused by a direct contractor', clause: '27.1.7; 16.1.3', sign: 1, treatment: 'taxable' },
  { key: 'advance_payment', description: 'Advance payments', clause: '27.1.8', sign: 1, treatment: 'taxable' },
];

export interface CertificateInput {
  contractSum: number;
  security: SecurityMode;
  stage: Stage;
  /** 25.3.1, to date, excl VAT. */
  workValue: number;
  /** 25.4, to date, excl VAT. */
  materialsOnSite: number;
  /** 25.5, to date, excl VAT. Certified only when covered by a guarantee. */
  materialsOffSite: number;
  offSiteCovered: boolean;
  /** 25.3.4, to date, excl VAT (from the CPAP tab, cumulative). */
  costFluctuations: number;
  /** Security mode `none` only: the amount the employer has chosen to withhold to date. */
  withheldToDate: number;
  /** 25.3.6, the gross amount certified on the previous certificate. */
  previouslyCertified: number;
  recovery: RecoveryItem[];
  vatRegistered: boolean;
  vatRate: number;
  /** `YYYY-MM-DD`, the date for issue from the Contract Data [25.2]. */
  issueDate?: string;
}

export interface CertificateLine {
  ref: string;
  label: string;
  amount: number;
  /** Lines that are a running total rather than an amount added. */
  subtotal?: boolean;
}

export interface Certificate {
  lines: CertificateLine[];
  grossCertified: number;
  securityAdjustment: number;
  taxableAmount: number;
  tax: number;
  netDue: number;
  /** Who the net amount is due to. */
  dueTo: 'contractor' | 'employer' | 'nil';
  employerPaysBy?: string;
  subcontractorsPaidBy?: string;
  notes: string[];
  errors: string[];
}

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

function addDays(iso: string, days: number): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** The cl 25.3.3 deduction to date, as a positive number. */
export function securityDeduction(i: Pick<CertificateInput, 'contractSum' | 'security' | 'stage' | 'withheldToDate'>, valueSubjectToSecurity: number): number {
  if (i.stage === 'final' || i.security === 'variable') return 0;
  if (i.security === 'fixed') {
    const pct = i.stage === 'interim' ? 0.05 : 0.025;
    return r2(pct * Math.min(Math.max(valueSubjectToSecurity, 0), i.contractSum));
  }
  const ceiling = (i.stage === 'interim' ? 0.1 : 0.025) * i.contractSum;
  return r2(Math.min(Math.max(i.withheldToDate, 0), ceiling, Math.max(valueSubjectToSecurity, 0)));
}

export function buildCertificate(i: CertificateInput): Certificate {
  const errors: string[] = [];
  const notes: string[] = [];
  for (const [k, v] of Object.entries({
    contractSum: i.contractSum,
    workValue: i.workValue,
    materialsOnSite: i.materialsOnSite,
    materialsOffSite: i.materialsOffSite,
    previouslyCertified: i.previouslyCertified,
    withheldToDate: i.withheldToDate,
  })) {
    if (!Number.isFinite(v) || v < 0) errors.push(`${k} must be zero or more.`);
  }
  if (!Number.isFinite(i.costFluctuations)) errors.push('costFluctuations must be a number.');
  if (!(i.contractSum > 0)) errors.push('The contract sum is needed for the security adjustment.');
  if (i.vatRegistered && !(i.vatRate >= 0 && i.vatRate < 1)) errors.push('The VAT rate must be a fraction, e.g. 0.15.');
  for (const it of i.recovery) {
    if (!Number.isFinite(it.amount)) errors.push(`Recovery item "${it.description}" has no amount.`);
  }

  const offSite = i.offSiteCovered ? i.materialsOffSite : 0;
  if (!i.offSiteCovered && i.materialsOffSite > 0) {
    notes.push('Off-site materials left out: cl 25.5 certifies them only under a guarantee for advance payment or other security acceptable to the employer.');
  }
  const materials = i.materialsOnSite + offSite;
  const deduction = securityDeduction(i, i.workValue + materials);
  if (i.security === 'none' && i.stage !== 'final' && i.withheldToDate > deduction) {
    notes.push(`Withholding capped at ${deduction.toFixed(2)} by cl 11.4.1.`);
  }
  if (i.security === 'fixed' && i.workValue + materials > i.contractSum) {
    notes.push('Value above the contract sum is certified in full (cl 25.12).');
  }

  const gross = r2(i.workValue + materials - deduction + i.costFluctuations);
  const sum = (t: RecoveryTreatment) => r2(i.recovery.filter((x) => x.treatment === t).reduce((s, x) => s + x.amount, 0));
  const recTaxable = sum('taxable');
  const recInterest = sum('interest');
  const recOther = sum('non_taxable');
  const taxable = r2(gross - i.previouslyCertified + recTaxable);
  const tax = i.vatRegistered ? r2(taxable * i.vatRate) : 0;
  const net = r2(taxable + tax + recInterest + recOther);

  const lines: CertificateLine[] = [
    { ref: '25.3.1', label: 'Value of work executed', amount: r2(i.workValue) },
    { ref: '25.3.2', label: 'Materials and goods', amount: r2(materials) },
    { ref: '25.3.3', label: 'Security adjustment', amount: -deduction },
    { ref: '25.3.4', label: 'Cost fluctuations', amount: r2(i.costFluctuations) },
    { ref: '25.3.5', label: 'Gross amount certified', amount: gross, subtotal: true },
    { ref: '25.3.6', label: 'Less amount previously certified', amount: -r2(i.previouslyCertified) },
    { ref: '25.3.7', label: 'Recovery statement amounts', amount: recTaxable },
    { ref: '', label: 'Amount subject to tax', amount: taxable, subtotal: true },
    { ref: '25.3.8', label: i.vatRegistered ? `Tax (VAT ${(i.vatRate * 100).toFixed(0)} %)` : 'Tax (contractor not VAT registered)', amount: tax },
    { ref: '25.3.9', label: 'Interest in the recovery statement', amount: recInterest },
    { ref: '25.3.10', label: 'Other non-taxable amounts', amount: recOther },
    { ref: '25.3.11', label: 'Net amount certified', amount: net, subtotal: true },
  ];

  const cert: Certificate = {
    lines,
    grossCertified: gross,
    securityAdjustment: deduction,
    taxableAmount: taxable,
    tax,
    netDue: net,
    dueTo: net > 0 ? 'contractor' : net < 0 ? 'employer' : 'nil',
    notes,
    errors,
  };
  if (i.issueDate) {
    cert.employerPaysBy = addDays(i.issueDate, 14);
    cert.subcontractorsPaidBy = addDays(i.issueDate, 21);
  }
  if (net < 0) notes.push('A negative certificate: the contractor pays the employer within 21 calendar days of the date for issue (cl 25.11).');
  if (errors.length) {
    cert.lines = [];
  }
  return cert;
}

export function certificateCsv(c: Certificate, title: string): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [esc(title), 'clause,item,amount_zar', ...c.lines.map((l) => `${l.ref},${esc(l.label)},${l.amount.toFixed(2)}`)];
  if (c.employerPaysBy) rows.push('', `25.10,${esc('Employer pays by')},${c.employerPaysBy}`);
  if (c.subcontractorsPaidBy) rows.push(`25.13,${esc('Contractor pays subcontractors by')},${c.subcontractorsPaidBy}`);
  for (const n of c.notes) rows.push(`,${esc(n)},`);
  return rows.join('\n') + '\n';
}
