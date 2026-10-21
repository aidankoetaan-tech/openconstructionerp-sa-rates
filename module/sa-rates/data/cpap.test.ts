// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
import { describe, it, expect } from 'vitest';

import {
  CPAP_WORK_GROUPS,
  addMonths,
  adjustmentAmount,
  calculateCertificate,
  exportIndicesCsv,
  importIndices,
  indexMonthFor,
  monthsBetween,
  parseIndexValue,
  parseMonth,
  type IndexTable,
} from './cpap';

// Jul / Aug 2026 values as printed in P0151.1 (August 2026), Table 1.
const AUG_2026_EXTRACT = [
  'work_group;Jul 2026;Aug 2026',
  '110 Concrete (excluding formwork);117,5;115,9',
  '114 Reinforcement;102,8;103,3',
  '116 Brick and block work;106,4;106,5',
].join('\n');

describe('the formula', () => {
  it('keeps 15 % of the work value out of adjustment', () => {
    // V = R1 000 000, index up 10 %: 0.85 × 1 000 000 × 0.10
    expect(adjustmentAmount(1_000_000, 110, 100)).toBeCloseTo(85_000, 6);
  });

  it('reduces the contract value when the index falls', () => {
    expect(adjustmentAmount(200_000, 95, 100)).toBeCloseTo(-8_500, 6);
  });

  it('refuses a zero index rather than dividing by it', () => {
    expect(() => adjustmentAmount(1, 110, 0)).toThrow();
  });
});

describe('which index month a certificate uses', () => {
  it('uses the previous month up to and including the 15th', () => {
    expect(indexMonthFor('2026-09-15')).toBe('2026-08');
    expect(indexMonthFor('2026-01-03')).toBe('2025-12');
  });

  it('uses the same month after the 15th', () => {
    expect(indexMonthFor('2026-09-16')).toBe('2026-09');
  });

  it('counts months across a year end', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('reading indices', () => {
  it('reads the decimal comma and the revision mark Stats SA prints', () => {
    expect(parseIndexValue('110,9')).toBe(110.9);
    expect(parseIndexValue('110,9r')).toBe(110.9);
    expect(parseIndexValue('..')).toBeNull();
  });

  it('reads the month spellings in the release and in spreadsheets', () => {
    expect(parseMonth('Aug 2026')).toBe('2026-08');
    expect(parseMonth('Aug-26')).toBe('2026-08');
    expect(parseMonth('2026/8')).toBe('2026-08');
    expect(parseMonth('August 2026')).toBe('2026-08');
    expect(parseMonth('2026-13')).toBeNull();
  });

  it('imports a wide, semicolon-separated extract of Table 1', () => {
    const r = importIndices(AUG_2026_EXTRACT);
    expect(r.problems).toEqual([]);
    expect(r.values).toBe(6);
    expect(r.table['110']).toEqual({ '2026-07': 117.5, '2026-08': 115.9 });
  });

  it('imports the long layout and merges into what is already held', () => {
    const first = importIndices(AUG_2026_EXTRACT).table;
    const r = importIndices('work_group,month,value\n114,2026-09,104.1\n', first);
    expect(r.table['114']).toEqual({ '2026-07': 102.8, '2026-08': 103.3, '2026-09': 104.1 });
    expect(r.table['110']!['2026-08']).toBe(115.9);
  });

  it('names the rows it could not read instead of dropping them', () => {
    const r = importIndices('work_group,month,value\n999,2026-08,100\n110,2026-08,abc\n');
    expect(r.values).toBe(0);
    expect(r.problems).toHaveLength(2);
  });

  it('round-trips through its own CSV export', () => {
    const t = importIndices(AUG_2026_EXTRACT).table;
    expect(importIndices(exportIndicesCsv(t)).table).toEqual(t);
  });

  it('knows the 40 work groups of the current release', () => {
    expect(CPAP_WORK_GROUPS).toHaveLength(40);
    expect(new Set(CPAP_WORK_GROUPS.map((g) => g.code)).size).toBe(40);
  });
});

describe('a payment certificate', () => {
  const table: IndexTable = {
    '110': { '2026-03': 110, '2026-07': 117.5, '2026-08': 115.9 },
    '116': { '2026-03': 100, '2026-07': 106.4, '2026-08': 106.5 },
  };

  it('adjusts each work group on its own index and totals them', () => {
    const r = calculateCertificate(
      {
        baseMonth: '2026-03',
        certificateDate: '2026-09-10', // on or before the 15th: August index
        lines: [
          { workGroup: '110', value: 400_000 },
          { workGroup: '116', value: 250_000 },
        ],
      },
      table,
    );
    expect(r.errors).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.indexMonth).toBe('2026-08');
    // 0.85 × 400 000 × (115.9/110 − 1) = 18 236.36; 0.85 × 250 000 × 0.065 = 13 812.50
    expect(r.lines.map((l) => l.adjustment)).toEqual([18_236.36, 13_812.5]);
    expect(r.totalAdjustment).toBe(32_048.86);
    expect(r.totalValue).toBe(650_000);
  });

  it('averages the months published since the last certificate', () => {
    const r = calculateCertificate(
      {
        baseMonth: '2026-03',
        certificateDate: '2026-09-10',
        previousIndexMonth: '2026-06',
        lines: [{ workGroup: '116', value: 100_000 }],
      },
      table,
    );
    expect(r.lines[0]!.xeMonths).toEqual(['2026-07', '2026-08']);
    expect(r.lines[0]!.xe).toBeCloseTo(106.45, 6);
    expect(r.lines[0]!.adjustment).toBe(5_482.5);
  });

  it('lists the index values it still needs and returns no partial total', () => {
    const r = calculateCertificate(
      { baseMonth: '2026-02', certificateDate: '2026-09-20', lines: [{ workGroup: '110', value: 1 }] },
      table,
    );
    expect(r.missing).toEqual([
      { workGroup: '110', month: '2026-02' },
      { workGroup: '110', month: '2026-09' },
    ]);
    expect(r.lines).toEqual([]);
    expect(r.totalAdjustment).toBe(0);
  });

  it('refuses a certificate after practical completion', () => {
    const r = calculateCertificate(
      {
        baseMonth: '2026-03',
        certificateDate: '2026-09-10',
        practicalCompletionDate: '2026-08-31',
        lines: [{ workGroup: '110', value: 1 }],
      },
      table,
    );
    expect(r.errors.join(' ')).toMatch(/after practical completion/);
  });

  it('applies a different adjustable proportion when the contract states one', () => {
    const r = calculateCertificate(
      { baseMonth: '2026-03', certificateDate: '2026-09-10', k: 0.9, lines: [{ workGroup: '116', value: 100_000 }] },
      table,
    );
    expect(r.lines[0]!.adjustment).toBe(5_850);
  });
});
