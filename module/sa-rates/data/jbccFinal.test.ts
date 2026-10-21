// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
// Expected figures and dates are worked by hand in the comments.
import { describe, it, expect } from 'vitest';

import { allowanceAdjustment, claimStatus, instructionValue, jbccFinalAccount, jbccFinalCsv, type JbccFinalInput } from './jbccFinal';
import { addWorkingDays, easterSunday, isWorkingDay, saPublicHolidays, workingDaysBetween } from './workingDays';

describe('working days', () => {
  it('finds Easter', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('lists the public holidays gov.za gives for 2026 and 2027, with the Sunday rule', () => {
    const y26 = saPublicHolidays(2026).map((h) => h.date);
    expect(y26).toEqual(expect.arrayContaining(['2026-04-03', '2026-04-06', '2026-08-10']));
    const y27 = saPublicHolidays(2027).map((h) => h.date);
    expect(y27).toEqual(expect.arrayContaining(['2027-03-22', '2027-03-26', '2027-03-29']));
    // 26 December 2026 is a Saturday: not moved
    expect(y26).not.toContain('2026-12-28');
  });

  it('skips weekends, public holidays and the annual holiday', () => {
    expect(isWorkingDay('2026-06-16')).toBe(false);
    expect(isWorkingDay('2026-06-17')).toBe(true);
    // Thu 2 Apr (1); Good Friday, weekend, Family Day skipped; Tue 7 (2); Wed 8 (3)
    expect(addWorkingDays('2026-04-01', 3)).toBe('2026-04-08');
    // Fri 11 Dec + 5 with a 16/12 to 08/01 builders' break: 14, 15, then 11, 12, 13 Jan
    expect(addWorkingDays('2026-12-11', 5, { annualHolidays: [{ from: '2026-12-16', to: '2027-01-08' }] })).toBe('2027-01-13');
    expect(addWorkingDays('2026-05-04', 1, { extraHolidays: ['2026-05-05'] })).toBe('2026-05-06');
    expect(workingDaysBetween('2026-02-02', '2026-02-20')).toBe(14);
  });
});

describe('cl 26 building blocks', () => {
  it('values instructions by basis', () => {
    expect(instructionValue({ ref: '', description: '', basis: 'similar', amount: 100 })).toBe(100);
    expect(instructionValue({ ref: '', description: '', basis: 'cost', amount: 100 })).toBeCloseTo(110, 9);
    expect(instructionValue({ ref: '', description: '', basis: 'omission', amount: 100 })).toBe(-100);
  });

  it('omits allowances, adds actual value and prorates profit and attendance', () => {
    // 300 000 → 360 000; P&A 15 000 × 1.2 = 18 000
    expect(allowanceAdjustment({ description: '', inSum: 300_000, actual: 360_000, profitAttendance: 15_000 })).toEqual({
      actual: 60_000,
      profitAttendance: 3_000,
      total: 63_000,
    });
  });

  it('forfeits a claim noticed more than 20 working days after awareness', () => {
    // 02/03 to 15/04/2026 = 30 working days (Good Friday and Family Day excluded)
    const s = claimStatus({ description: 'Late', basis: '23.2.3', aware: '2026-03-02', notice: '2026-04-15', submitted: '2026-05-01', assessed: 50_000 }, {});
    expect(s.noticeWorkingDays).toBe(30);
    expect(s.status).toBe('forfeited');
    expect(s.included).toBe(false);
  });

  it('treats an unassessed claim as deemed refused after 20 working days', () => {
    // submitted 10/04/2026 + 20 WD = 12/05/2026 (27/04 and 01/05 excluded)
    const row = { description: 'Delay', basis: '23.2.5', aware: '2026-02-02', notice: '2026-02-20', submitted: '2026-04-10', assessed: null };
    expect(claimStatus(row, {}, '2026-05-12').status).toBe('awaiting_assessment');
    const s = claimStatus(row, {}, '2026-05-13');
    expect(s.assessmentDue).toBe('2026-05-12');
    expect(s.status).toBe('deemed_refused');
  });
});

const input = (over: Partial<JbccFinalInput> = {}): JbccFinalInput => ({
  contractSum: 10_000_000,
  security: 'fixed',
  instructions: [
    { ref: 'CI 01', description: 'Extra paving', basis: 'similar', amount: 250_000 },
    { ref: 'CI 02', description: 'Changed screed', basis: 'adjusted', amount: 80_000 },
    { ref: 'CI 03', description: 'Make good services', basis: 'cost', amount: 40_000 },
    { ref: 'CI 04', description: 'Omit canopy', basis: 'omission', amount: 60_000 },
  ],
  provisionalWork: [{ description: 'Bulk excavation', provisional: 500_000, executed: 430_000 }],
  payments: [{ description: 'Electricity connection', kind: 'authority', paid: 20_000 }],
  claims: [
    { description: 'Late drawings', basis: '23.2.5', aware: '2026-02-02', notice: '2026-02-20', submitted: '2026-04-10', assessed: 120_000 },
    { description: 'Late claim', basis: '23.2.3', aware: '2026-03-02', notice: '2026-04-15', submitted: '2026-05-01', assessed: 50_000 },
  ],
  pcAllowances: [{ description: 'Ironmongery', inSum: 300_000, actual: 360_000, profitAttendance: 15_000 }],
  provisionalSums: [{ description: 'Fire services', inSum: 200_000, actual: 150_000, profitAttendance: 10_000 }],
  preliminaries: [{ description: 'Time-related, 3 weeks', amount: 35_000 }],
  costFluctuations: 180_000,
  rectifications: [{ description: 'Error in bill item 4.12', amount: -12_000 }],
  recovery: [{ description: 'Penalty', amount: -30_000, treatment: 'taxable', clause: '27.1.1' }],
  previouslyCertified: 10_200_000,
  vatRegistered: true,
  vatRate: 0.15,
  practicalCompletion: '2026-06-01',
  finalCompletion: '2026-09-15',
  finalAccountIssued: '2026-08-20',
  response: 'none',
  calendar: {},
  ...over,
});

describe('final account', () => {
  const r = jbccFinalAccount(input());

  it('adjusts the contract sum clause by clause', () => {
    expect(r.errors).toEqual([]);
    const by = (c: string) => r.groups.find((g) => g.clause === c)!.total;
    // 250 000 + 80 000 + 44 000 − 60 000
    expect(by('26.2')).toBe(314_000);
    expect(by('26.3')).toBe(-70_000);
    expect(by('26.4')).toBe(22_000);
    // only the assessed, in-time claim
    expect(by('26.5–26.8')).toBe(120_000);
    expect(by('26.9.1')).toBe(63_000);
    // 200 000 → 150 000; P&A 10 000 × 0.75 = 7 500
    expect(by('26.9.2')).toBe(-52_500);
    // 314 000 − 70 000 + 22 000 + 120 000 + 63 000 − 52 500 + 35 000 + 180 000 − 12 000
    expect(r.adjustments).toBe(599_500);
    expect(r.finalContractValue).toBe(10_599_500);
    expect(r.variance).toBeCloseTo(0.05995, 6);
    expect(r.notes.join(' ')).toMatch(/Late claim is left out: forfeited/);
  });

  it('certifies 100 % in the final payment certificate', () => {
    const c = r.certificate!;
    expect(c.securityAdjustment).toBe(0);
    expect(c.grossCertified).toBe(10_599_500);
    // 10 599 500 − 10 200 000 − 30 000 = 369 500; VAT 55 425; net 424 925
    expect(c.taxableAmount).toBe(369_500);
    expect(c.netDue).toBe(424_925);
    expect(c.dueTo).toBe('contractor');
  });

  it('works out the cl 26 dates in working days', () => {
    // PC 01/06/2026 + 60 WD skipping 16/06 and 10/08 = 26/08/2026
    expect(r.dates.finalAccountDue).toBe('2026-08-26');
    // issued 20/08 + 30 WD skipping 24/09 = 02/10/2026; deemed accepted
    expect(r.dates.acceptanceDue).toBe('2026-10-02');
    expect(r.dates.acceptedOn).toBe('2026-10-02');
    expect(r.dates.finalPaymentCertificateDue).toBe('2026-10-09');
    expect(r.certificate!.employerPaysBy).toBe('2026-10-23');
  });

  it('waits for final completion and handles non-acceptance', () => {
    const late = jbccFinalAccount(input({ finalCompletion: '2026-11-30' }));
    expect(late.dates.finalPaymentCertificateDue).toBe('2026-11-30');
    // notice of non-acceptance 10/09 + 10 WD skipping 24/09 = 25/09/2026
    const disputed = jbccFinalAccount(input({ response: 'not_accepted', responseDate: '2026-09-10' }));
    expect(disputed.dates.disagreementFrom).toBe('2026-09-25');
    expect(disputed.dates.finalPaymentCertificateDue).toBeUndefined();
    expect(disputed.notes.join(' ')).toMatch(/25\.16/);
  });

  it('flags the guarantee for payment when the value grows by more than 10 % (11.7)', () => {
    const big = jbccFinalAccount(input({ contractSum: 1_000_000, previouslyCertified: 0, instructions: [{ ref: '', description: '', basis: 'similar', amount: 150_000 }], provisionalWork: [], payments: [], claims: [], pcAllowances: [], provisionalSums: [], preliminaries: [], costFluctuations: 0, rectifications: [], recovery: [] }));
    expect(big.notes.join(' ')).toMatch(/11\.7/);
  });

  it('flags a late final account', () => {
    const late = jbccFinalAccount(input({ finalAccountIssued: '2026-09-01' }));
    expect(late.notes.join(' ')).toMatch(/after the 60 working days/);
  });

  it('writes a CSV with the account and the certificate', () => {
    const csv = jbccFinalCsv(r, input(), 'Final account');
    expect(csv).toContain('26.2.3,"CI 03: Make good services",44000.00,"40000.00 at cost + 10 %"');
    expect(csv).toContain('26.10,"Final contract value",10599500.00,"5.99 % on the contract sum"');
    expect(csv).toContain('25.3.11,"Net amount certified",424925.00');
  });
});
