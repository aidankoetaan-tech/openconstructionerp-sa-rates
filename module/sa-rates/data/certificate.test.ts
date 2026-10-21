// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
// Every expected figure below is worked by hand in the comment beside it.
import { describe, it, expect } from 'vitest';

import { buildCertificate, certificateCsv, securityDeduction, type CertificateInput } from './certificate';

const base: CertificateInput = {
  contractSum: 10_000_000,
  security: 'fixed',
  stage: 'interim',
  workValue: 4_000_000,
  materialsOnSite: 200_000,
  materialsOffSite: 0,
  offSiteCovered: false,
  costFluctuations: 50_000,
  withheldToDate: 0,
  previouslyCertified: 3_000_000,
  recovery: [],
  vatRegistered: true,
  vatRate: 0.15,
  issueDate: '2026-09-25',
};

const line = (c: ReturnType<typeof buildCertificate>, ref: string) => c.lines.find((l) => l.ref === ref)!.amount;

describe('security adjustment (cl 11 and 25.12)', () => {
  it('fixed guarantee: 5 % of the value up to practical completion', () => {
    // 5 % of 4 200 000
    expect(securityDeduction(base, 4_200_000)).toBe(210_000);
  });

  it('fixed guarantee: halves to 2.5 % after practical completion and is released in the final certificate', () => {
    expect(securityDeduction({ ...base, stage: 'after_practical_completion' }, 4_200_000)).toBe(105_000);
    expect(securityDeduction({ ...base, stage: 'final' }, 4_200_000)).toBe(0);
  });

  it('fixed guarantee: value above the contract sum is not reduced', () => {
    // contract sum 1 000 000, value 1 100 000: 5 % of 1 000 000 only
    expect(securityDeduction({ ...base, contractSum: 1_000_000 }, 1_100_000)).toBe(50_000);
  });

  it('variable guarantee: nothing deducted', () => {
    expect(securityDeduction({ ...base, security: 'variable' }, 4_200_000)).toBe(0);
  });

  it('no guarantee: withholding capped at 10 % of the contract sum, then 2.5 % after practical completion', () => {
    const none = { ...base, security: 'none' as const, withheldToDate: 1_200_000 };
    expect(securityDeduction(none, 4_200_000)).toBe(1_000_000);
    expect(securityDeduction({ ...none, stage: 'after_practical_completion' }, 4_200_000)).toBe(250_000);
    expect(securityDeduction({ ...none, stage: 'final' }, 4_200_000)).toBe(0);
  });
});

describe('the certificate in cl 25.3 order', () => {
  it('works through a worked example', () => {
    const c = buildCertificate({
      ...base,
      recovery: [
        { description: 'Penalty', amount: -20_000, treatment: 'taxable' },
        { description: 'Compensatory interest', amount: 1_500, treatment: 'interest' },
      ],
    });
    expect(c.errors).toEqual([]);
    // 4 000 000 + 200 000 − 210 000 + 50 000
    expect(c.grossCertified).toBe(4_040_000);
    expect(line(c, '25.3.3')).toBe(-210_000);
    // 4 040 000 − 3 000 000 − 20 000
    expect(c.taxableAmount).toBe(1_020_000);
    expect(c.tax).toBe(153_000);
    // 1 020 000 + 153 000 + 1 500
    expect(c.netDue).toBe(1_174_500);
    expect(c.dueTo).toBe('contractor');
    expect(c.lines.map((l) => l.ref)).toEqual([
      '25.3.1', '25.3.2', '25.3.3', '25.3.4', '25.3.5', '25.3.6', '25.3.7', '', '25.3.8', '25.3.9', '25.3.10', '25.3.11',
    ]);
  });

  it('gives the payment dates from the date for issue', () => {
    const c = buildCertificate(base);
    expect(c.employerPaysBy).toBe('2026-10-09'); // + 14 calendar days, cl 25.10
    expect(c.subcontractorsPaidBy).toBe('2026-10-16'); // + 7 more, cl 25.13
  });

  it('leaves off-site materials out unless they are covered by a guarantee', () => {
    const uncovered = buildCertificate({ ...base, materialsOffSite: 100_000 });
    expect(line(uncovered, '25.3.2')).toBe(200_000);
    expect(uncovered.notes.join(' ')).toMatch(/cl 25.5/);
    const covered = buildCertificate({ ...base, materialsOffSite: 100_000, offSiteCovered: true });
    expect(line(covered, '25.3.2')).toBe(300_000);
    // 5 % now taken on 4 300 000
    expect(covered.securityAdjustment).toBe(215_000);
  });

  it('charges no VAT when the contractor is not registered', () => {
    const c = buildCertificate({ ...base, vatRegistered: false });
    expect(c.tax).toBe(0);
    expect(c.netDue).toBe(c.taxableAmount);
  });

  it('allows a negative certificate and says the contractor pays', () => {
    const c = buildCertificate({ ...base, previouslyCertified: 4_100_000 });
    // 4 040 000 − 4 100 000 = −60 000; VAT −9 000
    expect(c.netDue).toBe(-69_000);
    expect(c.dueTo).toBe('employer');
    expect(c.notes.join(' ')).toMatch(/cl 25.11/);
  });

  it('keeps non-taxable recovery amounts out of the VAT base', () => {
    const c = buildCertificate({
      ...base,
      recovery: [{ description: 'Damages', amount: 10_000, treatment: 'non_taxable' }],
    });
    expect(c.taxableAmount).toBe(1_040_000);
    expect(line(c, '25.3.10')).toBe(10_000);
    // 1 040 000 × 1.15 + 10 000
    expect(c.netDue).toBe(1_206_000);
  });

  it('refuses incomplete input instead of certifying part of it', () => {
    const c = buildCertificate({ ...base, contractSum: 0 });
    expect(c.errors.length).toBeGreaterThan(0);
    expect(c.lines).toEqual([]);
  });

  it('exports the certificate lines and dates as CSV', () => {
    const csv = certificateCsv(buildCertificate(base), 'Payment certificate 7');
    expect(csv).toContain('25.3.5,"Gross amount certified",4040000.00');
    expect(csv).toContain('25.10,"Employer pays by",2026-10-09');
  });
});
