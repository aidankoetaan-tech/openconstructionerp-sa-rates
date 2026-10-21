// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
// Expected figures are worked by hand in the comments.
import { describe, it, expect } from 'vitest';

import { checkShareRanges, contractorShare, necFinalAccount, necFinalCsv, type NecFinalInput, type ShareRange } from './necFinal';

// Contractor's share: 30 % below 90 %, 50 % from 90 % to 110 %, 100 % above 110 %.
const RANGES: ShareRange[] = [
  { from: 0, to: 90, share: 0.3 },
  { from: 90, to: 110, share: 0.5 },
  { from: 110, to: null, share: 1 },
];

const base = (over: Partial<NecFinalInput> = {}): NecFinalInput => ({
  option: 'C',
  dispute: 'W1',
  pricedPwdd: 0,
  costOfComponents: 0,
  disallowed: [],
  feePercentage: 0,
  totalOfPrices: 0,
  shareRanges: RANGES,
  priceAdjustment: 0,
  bonusPerDay: 0,
  delayDamagesPerDay: 0,
  delayDamagesReduction: 0,
  advancedPaymentOutstanding: 0,
  lowPerformanceDamages: 0,
  uncorrectedDefects: 0,
  otherToContractor: [],
  otherByContractor: [],
  previousAmountDue: 0,
  vatRate: 0,
  paymentWeeks: 3,
  ...over,
});

describe('contractorShare (cl 54)', () => {
  it('splits a saving across the ranges it crosses', () => {
    // PWDD 850 000 of 1 000 000 = 85 %; saving 150 000 runs from 85 % to 100 %
    // 85–90 %: 50 000 × 30 % = 15 000; 90–100 %: 100 000 × 50 % = 50 000; total 65 000 to the Contractor
    const s = contractorShare(850_000, 1_000_000, RANGES);
    expect(s.difference).toBe(150_000);
    expect(s.increments.map((x) => Math.round(x.increment))).toEqual([50_000, 100_000]);
    expect(s.share).toBeCloseTo(65_000, 6);
  });

  it('charges the Contractor its share of an excess', () => {
    // PWDD 1 150 000 = 115 %; 100–110 %: 100 000 × 50 % = 50 000; 110–115 %: 50 000 × 100 % = 50 000
    const s = contractorShare(1_150_000, 1_000_000, RANGES);
    expect(s.share).toBeCloseTo(-100_000, 6);
  });

  it('gives no share when PWDD equals the total of the Prices', () => {
    expect(contractorShare(1_000_000, 1_000_000, RANGES).share).toBe(0);
  });

  it('checks the ranges are contiguous and open-ended', () => {
    expect(checkShareRanges(RANGES)).toEqual([]);
    expect(checkShareRanges([{ from: 0, to: 90, share: 0.3 }, { from: 95, to: null, share: 0.5 }]).join(' ')).toMatch(/gap or overlap/);
    expect(checkShareRanges([{ from: 0, to: 90, share: 0.3 }]).join(' ')).toMatch(/no upper limit/);
    expect(checkShareRanges([{ from: 0, to: null, share: 1.5 }]).join(' ')).toMatch(/between 0 and 100/);
  });
});

describe('Option C final assessment', () => {
  const input = base({
    costOfComponents: 900_000,
    disallowed: [{ label: 'Plant not used', amount: 20_000 }],
    feePercentage: 0.08,
    totalOfPrices: 1_000_000,
    delayDamagesPerDay: 2_000,
    completionDate: '2026-03-31',
    completion: '2026-04-10',
    uncorrectedDefects: 5_000,
    otherToContractor: [{ label: 'Interest on late payment (51.2)', amount: 1_250 }],
    previousAmountDue: 900_000,
    vatRate: 0.15,
    defectsCertificate: '2026-09-30',
    assessmentDate: '2026-10-21',
  });
  const r = necFinalAccount(input);

  it('builds PWDD from Defined Cost and the Fee', () => {
    // Defined Cost 900 000 − 20 000 = 880 000; Fee 8 % = 70 400; PWDD 950 400
    expect(r.errors).toEqual([]);
    expect(r.defined).toBe(880_000);
    expect(r.fee).toBe(70_400);
    expect(r.pwdd).toBe(950_400);
  });

  it('adds the share and the other amounts, less the deductions', () => {
    // 95.04 % → saving 49 600 in the 90–110 % range at 50 % = 24 800
    expect(r.share!.share).toBe(24_800);
    // 10 days late × 2 000 = 20 000
    expect(r.delayDays).toBe(10);
    // 950 400 + 24 800 + 1 250 − 20 000 − 5 000 = 951 450
    expect(r.finalAmountDue).toBe(951_450);
    // payment 51 450; VAT 7 717.50; 59 167.50
    expect(r.payment).toBe(51_450);
    expect(r.tax).toBe(7_717.5);
    expect(r.paymentInclTax).toBe(59_167.5);
  });

  it('works out the cl 53 dates', () => {
    // Defects Certificate 30/09/2026 + 4 weeks = 28/10/2026
    expect(r.dates).toEqual({
      dueFrom: 'defects',
      assessmentDue: '2026-10-28',
      paymentDue: '2026-11-11',
      conclusiveUnlessReferredBy: '2026-11-18',
    });
  });

  it('notes that retention is released', () => {
    expect(r.lines.find((l) => l.ref === 'X16.2')).toMatchObject({ amount: 0, info: true });
  });

  it('puts X1 into the total of the Prices, so it moves the share and is not paid directly', () => {
    // total 1 000 000 + 50 000 = 1 050 000; PWDD 950 400 = 90.514 %; saving 99 600 all at 50 % = 49 800
    const x = necFinalAccount({ ...input, priceAdjustment: 50_000 });
    expect(x.share!.share).toBe(49_800);
    expect(x.finalAmountDue).toBe(951_450 - 24_800 + 49_800);
  });

  it('writes a CSV with the share increments', () => {
    const csv = necFinalCsv(r, input, 'Final assessment');
    expect(csv).toContain('"NEC4 ECC Option C"');
    expect(csv).toContain('54.4,"Contractor\'s share of the saving",24800.00,yes');
    expect(csv).toContain('95.04,100.00,49600.00,50.0,24800.00');
    expect(csv).toContain('51.1,"Final payment by the Client",51450.00,');
  });
});

describe('the other main Options', () => {
  it('A: PWDD as entered, X1.3 paid, X6 bonus, advanced payment recovered', () => {
    // 4 days early × 1 500 = 6 000; 2 000 000 + 30 000 + 6 000 − 100 000 = 1 936 000
    const r = necFinalAccount(
      base({
        option: 'A',
        pricedPwdd: 2_000_000,
        priceAdjustment: 30_000,
        bonusPerDay: 1_500,
        completionDate: '2026-06-30',
        completion: '2026-06-28',
        takeOver: '2026-06-26',
        advancedPaymentOutstanding: 100_000,
        previousAmountDue: 1_950_000,
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.share).toBeNull();
    expect(r.bonusDays).toBe(4);
    expect(r.finalAmountDue).toBe(1_936_000);
    // the Contractor repays 14 000
    expect(r.payment).toBe(-14_000);
  });

  it('D: the share is against the Total of the Prices', () => {
    // PWDD 1 100 000 × 1.1 = 1 210 000 against 1 100 000 = 110 %: 100–110 % at 50 % → −55 000
    const r = necFinalAccount(base({ option: 'D', costOfComponents: 1_100_000, feePercentage: 0.1, totalOfPrices: 1_100_000 }));
    expect(r.share!.share).toBe(-55_000);
    expect(r.lines.find((l) => l.ref === '54.8')!.label).toMatch(/excess/);
    expect(r.finalAmountDue).toBe(1_155_000);
  });

  it('E: no share, and X1 is refused', () => {
    const r = necFinalAccount(base({ option: 'E', costOfComponents: 500_000, feePercentage: 0.1 }));
    expect(r.share).toBeNull();
    expect(r.finalAmountDue).toBe(550_000);
    expect(necFinalAccount(base({ option: 'E', costOfComponents: 500_000, priceAdjustment: 1 })).errors.join(' ')).toMatch(/not used with Option E/);
  });

  it('B: delay damages stop at take-over, less an X7.3 reduction', () => {
    // late 01/05 → take-over 11/05 = 10 days × 3 000 = 30 000 − 6 000 = 24 000
    const r = necFinalAccount(
      base({
        option: 'B',
        pricedPwdd: 800_000,
        delayDamagesPerDay: 3_000,
        delayDamagesReduction: 6_000,
        completionDate: '2026-05-01',
        takeOver: '2026-05-11',
        completion: '2026-05-20',
      }),
    );
    expect(r.delayDays).toBe(10);
    expect(r.finalAmountDue).toBe(776_000);
  });
});

describe('dates and checks', () => {
  it('runs thirteen weeks from a termination certificate and points to cl 93', () => {
    const r = necFinalAccount(base({ option: 'A', pricedPwdd: 1, terminationCertificate: '2026-01-05' }));
    expect(r.dates.dueFrom).toBe('termination');
    expect(r.dates.assessmentDue).toBe('2026-04-06');
    expect(r.notes.join(' ')).toMatch(/cl 93/);
  });

  it('flags a late assessment (cl 53.2)', () => {
    const r = necFinalAccount(base({ option: 'A', pricedPwdd: 1, defectsCertificate: '2026-01-05', assessmentDate: '2026-03-01' }));
    expect(r.notes.join(' ')).toMatch(/53\.2/);
  });

  it('needs the inputs each Option depends on', () => {
    expect(necFinalAccount(base({ option: 'A' })).errors.join(' ')).toMatch(/Price for Work Done to Date/);
    expect(necFinalAccount(base({ costOfComponents: 1, feePercentage: 0.1 })).errors.join(' ')).toMatch(/total of the Prices/);
    expect(necFinalAccount(base({ option: 'A', pricedPwdd: 1, delayDamagesPerDay: 10 })).errors.join(' ')).toMatch(/Completion Date/);
  });
});
