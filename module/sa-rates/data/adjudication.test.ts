// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
// Expected figures are worked by hand in the comments.
import { describe, it, expect } from 'vitest';

import { adjudicate, adjudicationCsv, pppfaSystem, pricePoints, requiredGrade, type Bidder, type TenderInput } from './adjudication';

const ok = { csd: 'yes', tax: 'yes', cidbActive: 'yes', returnables: 'yes' } as const;
const bid = (name: string, price: number, grade: number | null, goals: number, over: Partial<Bidder> = {}): Bidder => ({
  name,
  price,
  cidbGrade: grade,
  cidbClass: 'GB',
  checks: { ...ok },
  specificGoalPoints: goals,
  vatRegistered: true,
  ...over,
});
const tender: TenderInput = { estimatedValue: 10_000_000, classOfWork: 'GB', priceFlagThreshold: 0.15 };

describe('thresholds', () => {
  it('uses 80/20 up to and including R50 million and 90/10 above it', () => {
    expect(pppfaSystem(50_000_000).system).toBe('80/20');
    expect(pppfaSystem(50_000_001)).toEqual({ system: '90/10', priceWeight: 90, goalCap: 10 });
  });

  it('reads the CIDB grade off the 2019 tender value limits', () => {
    expect(requiredGrade(500_000)).toBe(1);
    expect(requiredGrade(500_001)).toBe(2);
    expect(requiredGrade(10_000_000)).toBe(5);
    expect(requiredGrade(60_000_000)).toBe(7);
    expect(requiredGrade(60_000_001)).toBe(8);
    expect(requiredGrade(900_000_000)).toBe(9);
  });

  it('applies the price formula', () => {
    // 80 × (1 − 500 000 / 9 000 000) = 75.5556
    expect(pricePoints(80, 9_500_000, 9_000_000)).toBeCloseTo(75.5556, 4);
    expect(pricePoints(90, 9_000_000, 9_000_000)).toBe(90);
  });
});

describe('a five-tender evaluation', () => {
  const a = adjudicate(tender, [
    bid('A', 9_500_000, 6, 12),
    bid('B', 9_000_000, 5, 4),
    bid('C', 8_000_000, 4, 20),
    bid('D', 10_450_000, 7, 10, { checks: { ...ok, tax: 'no' } }),
    bid('E', 11_700_000, 5, 25),
  ]);
  const by = (n: string) => a.results.find((r) => r.bidder.name === n)!;

  it('requires grade 5GB for a R10 million building tender', () => {
    expect(a.requiredGrade).toBe(5);
    expect(a.system).toBe('80/20');
  });

  it('sets aside the under-graded and the tax non-compliant tenders', () => {
    expect(by('C').responsive).toBe(false);
    expect(by('C').reasons.join(' ')).toMatch(/grade 4GB, tender requires 5GB/);
    expect(by('D').responsive).toBe(false);
    expect(by('D').reasons.join(' ')).toMatch(/Tax compliance/);
  });

  it('scores the responsive tenders against the lowest acceptable price', () => {
    // C is cheaper but not acceptable, so Pmin is B at 9 000 000
    expect(a.lowestAcceptable).toBe(9_000_000);
    expect(by('A').totalPoints).toBe(87.56); // 75.56 + 12
    expect(by('B').totalPoints).toBe(84); // 80 + 4
    // E: 80 × (1 − 2 700 000 / 9 000 000) = 56; goals capped at 20
    expect(by('E').pricePoints).toBe(56);
    expect(by('E').goalPoints).toBe(20);
    expect(by('E').flags.join(' ')).toMatch(/capped/);
  });

  it('ranks by total points and names the highest', () => {
    expect([by('A').rank, by('B').rank, by('E').rank]).toEqual([1, 2, 3]);
    expect(a.highest?.bidder.name).toBe('A');
    expect(by('C').rank).toBeNull();
  });

  it('flags prices outside the estimate threshold', () => {
    expect(by('C').flags.join(' ')).toMatch(/Below the estimate by 20.0 %/);
    expect(by('E').flags.join(' ')).toMatch(/Above the estimate by 17.0 %/);
    expect(by('A').flags).toEqual([]);
  });

  it('writes a CSV report in rank order', () => {
    const csv = adjudicationCsv(a, tender, 'T01/2026');
    const lines = csv.split('\n');
    expect(lines.find((l) => l.startsWith('1,'))).toMatch(/^1,"A",9500000.00/);
    expect(csv).toContain('"CIDB requirement",5GB');
  });
});

describe('ties (reg 8)', () => {
  it('breaks equal points on specific goal points', () => {
    // X: 80 + 5 = 85; Y: 80 × (1 − 0.125) = 70, + 15 = 85
    const a = adjudicate({ ...tender, estimatedValue: 1_000_000 }, [
      bid('X', 1_000_000, 2, 5),
      bid('Y', 1_125_000, 2, 15),
    ]);
    expect(a.results.map((r) => r.totalPoints)).toEqual([85, 85]);
    expect(a.highest?.bidder.name).toBe('Y');
  });

  it('leaves a full tie to the drawing of lots', () => {
    const a = adjudicate(tender, [bid('P', 9_000_000, 5, 10), bid('Q', 9_000_000, 6, 10)]);
    expect(a.highest).toBeNull();
    expect(a.drawLotsBetween).toEqual(['P', 'Q']);
  });
});

describe('edges', () => {
  it('does not clip negative price points and says so', () => {
    const a = adjudicate(tender, [bid('Low', 9_000_000, 5, 0), bid('High', 19_000_000, 7, 0)]);
    const high = a.results.find((r) => r.bidder.name === 'High')!;
    // 80 × (1 − 10 000 000 / 9 000 000) = −8.89
    expect(high.pricePoints).toBe(-8.89);
    expect(high.flags.join(' ')).toMatch(/negative price points/);
  });

  it('treats an unverified check as not yet responsive', () => {
    const a = adjudicate(tender, [bid('U', 9_000_000, 5, 0, { checks: { ...ok, csd: 'pending' } })]);
    expect(a.results[0]!.responsive).toBe(false);
    expect(a.results[0]!.reasons.join(' ')).toMatch(/not yet verified/);
  });

  it('honours a minimum grade set in the tender data', () => {
    const a = adjudicate({ ...tender, minimumGrade: 6 }, [bid('B', 9_000_000, 5, 0)]);
    expect(a.results[0]!.responsive).toBe(false);
  });

  it('needs an estimate and a class of work before it scores anything', () => {
    expect(adjudicate({ ...tender, estimatedValue: 0 }, []).errors.length).toBeGreaterThan(0);
    expect(adjudicate({ ...tender, classOfWork: '' }, []).errors.length).toBeGreaterThan(0);
  });
});
