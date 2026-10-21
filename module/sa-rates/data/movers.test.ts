// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
// The later pack is the v3.2 fixture. The earlier pack is made up from it, so
// every expected figure below can be worked by hand.
import { describe, it, expect } from 'vitest';

import { FIXTURE_PACK } from './fixturePack';
import { compareRatePacks, moversCsv, topMovers } from './movers';
import type { RatePack } from './ratepack';

function earlierPack(): RatePack {
  const p: RatePack = JSON.parse(JSON.stringify(FIXTURE_PACK));
  p.library_version = 'v3.1';
  p.priced_on = '2026-09-08';
  const res = (code: string) => p.resources.find((r) => r.code === code)!;
  const comp = (bu: string, code: string) =>
    p.buildups.find((b) => b.code === bu)!.components.find((c) => c.resource === code)!;

  res('ZA-SET-M-shutterply').rate = 110;
  comp('ZA-SET-A-fw_rough', 'ZA-SET-M-shutterply').unit_cost = 110;
  res('ZA-SET-M-fwtimber').rate = 40;
  comp('ZA-SET-A-fw_rough', 'ZA-SET-M-fwtimber').unit_cost = 40;
  // fw_rough: 203.09 − 1.125 × (0.12 × 13.284058 + 1.5 × 4.008696) = 194.53
  p.buildups.find((b) => b.code === 'ZA-SET-A-fw_rough')!.rate = 194.53;

  // bath: the artisan allowance went from 5.5 to 6 hours.
  comp('ZA-SET-A-bath_no', 'ZA-SET-L-artisan').quantity = 5.5;
  // 3321.99 − 1.125 × 0.5 × 144.456 = 3240.73
  p.buildups.find((b) => b.code === 'ZA-SET-A-bath_no')!.rate = 3240.73;

  res('ZA-SET-M-copper15').unit = 'length';
  p.resources = p.resources.filter((r) => r.code !== 'ZA-SET-M-bath');
  p.resources.push({ code: 'ZA-SET-P-mixer', kind: 'plant', name: 'Concrete mixer', unit: 'day', rate: 450, low: 450, high: 450 });
  return p;
}

describe('compareRatePacks', () => {
  const c = compareRatePacks(earlierPack(), FIXTURE_PACK);
  const by = (code: string) => c.movers.find((m) => m.code === code)!;

  it('labels the two packs', () => {
    expect(c.earlier).toEqual({ version: 'v3.1', pricedOn: '2026-09-08' });
    expect(c.later).toEqual({ version: 'v3.2', pricedOn: '2026-09-28' });
    expect(c.swapped).toBe(false);
    expect(c.profit).toBeNull();
  });

  it('works out the change on each matched resource', () => {
    const s = by('ZA-SET-M-shutterply');
    expect(s.status).toBe('moved');
    expect(s.change).toBe(13.28);
    expect(s.pct).toBeCloseTo(0.120727, 5); // 13.28 / 110
    expect(by('ZA-SET-M-fwtimber').pct).toBeCloseTo(0.10025, 5);
    expect(by('ZA-SET-L-artisan').status).toBe('unchanged');
  });

  it('flags a unit change instead of comparing the rates', () => {
    const cu = by('ZA-SET-M-copper15');
    expect(cu.status).toBe('unit_changed');
    expect(cu.pct).toBeNull();
    expect(cu.fromUnit).toBe('length');
  });

  it('reports new and removed items', () => {
    expect(by('ZA-SET-M-bath').status).toBe('new');
    expect(by('ZA-SET-P-mixer')).toMatchObject({ status: 'removed', kind: 'plant', from: 450, to: null });
  });

  it('names the component that drove each build-up', () => {
    // fw_rough: bearer 1.5 × 4.008696 = 6.01 outweighs shutterply 0.12 × 13.284058 = 1.59
    expect(by('ZA-SET-A-fw_rough').driver).toEqual({
      resource: 'ZA-SET-M-fwtimber',
      description: 'SA Pine 38x114 formwork bearer per m',
      contribution: 6.01,
      change: 'price',
    });
    // bath: 0.5 h more artisan at 144.456 = 72.23
    expect(by('ZA-SET-A-bath_no').driver).toMatchObject({ resource: 'ZA-SET-L-artisan', contribution: 72.23, change: 'quantity' });
  });

  it('summarises each kind', () => {
    expect(c.summary.material).toMatchObject({ compared: 2, up: 2, down: 0, added: 1, removed: 0 });
    expect(c.summary.material.medianPct).toBeCloseTo((0.120727 + 0.10025) / 2, 5);
    expect(c.summary.material.meanPct).toBeCloseTo((0.120727 + 0.10025) / 2, 5);
    expect(c.summary.material.medianMovedPct).toBeCloseTo((0.120727 + 0.10025) / 2, 5);
    expect(c.summary.labour).toMatchObject({ compared: 2, unchanged: 2, medianPct: 0, meanPct: 0, medianMovedPct: null });
    expect(c.summary.plant).toMatchObject({ compared: 0, removed: 1, medianPct: null });
    expect(c.summary.buildup).toMatchObject({ compared: 2, up: 2 });
  });

  it('lists the largest percentage move first', () => {
    expect(c.movers[0]!.code).toBe('ZA-SET-M-shutterply');
    expect(topMovers(c, { direction: 'up', n: 1, kind: 'buildup' })[0]!.code).toBe('ZA-SET-A-fw_rough');
    expect(topMovers(c, { direction: 'down', n: 5 })).toEqual([]);
  });

  it('writes a CSV with every item', () => {
    const csv = moversCsv(c);
    expect(csv).toContain('ZA-SET-M-shutterply,material,"Shutterply 18mm (per m2 of sheet)","m2",moved,110.00,123.28,13.28,12.07');
    expect(csv).toContain('"length -> m",unit_changed');
    expect(csv).toContain('ZA-SET-A-fw_rough,buildup');
    // two pack labels, the notes, a blank line, the header, then one row per item
    expect(csv.trim().split('\n').length).toBe(2 + c.notes.length + 1 + 1 + c.movers.length);
  });
});

describe('order and settings', () => {
  it('swaps packs given in the wrong order and says so', () => {
    const c = compareRatePacks(FIXTURE_PACK, earlierPack());
    expect(c.swapped).toBe(true);
    expect(c.earlier.version).toBe('v3.1');
    expect(c.notes.join(' ')).toMatch(/wrong order/);
    expect(c.movers.find((m) => m.code === 'ZA-SET-M-shutterply')!.change).toBe(13.28);
  });

  it('puts a build-up move down to profit when no component changed', () => {
    const later: RatePack = JSON.parse(JSON.stringify(FIXTURE_PACK));
    later.priced_on = '2026-10-28';
    later.settings.profit = 0.15;
    later.buildups.forEach((b) => (b.rate = Math.round(b.rate * (1.15 / 1.125) * 100) / 100));
    const c = compareRatePacks(FIXTURE_PACK, later);
    expect(c.profit).toEqual({ from: 0.125, to: 0.15 });
    expect(c.notes.join(' ')).toMatch(/Profit changed from 12.5 % to 15.0 %/);
    const bath = c.movers.find((m) => m.code === 'ZA-SET-A-bath_no')!;
    expect(bath.driver).toMatchObject({ resource: '', description: 'Profit setting' });
    // direct cost 2952.88 × 0.025 = 73.82
    expect(bath.driver!.contribution).toBeCloseTo(73.82, 2);
  });
});
