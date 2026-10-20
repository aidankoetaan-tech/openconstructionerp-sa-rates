// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
//
// Run:  npx vitest run src/modules/sa-rates
import { describe, it, expect } from 'vitest';

import { FIXTURE_PACK } from './fixturePack';
import {
  assemblyImportPayload,
  buildupRate,
  costItemPayload,
  diffComponents,
  filterRows,
  planInstall,
  rateRows,
  validateRatePack,
  type RatePack,
} from './ratepack';

const clone = (): RatePack => JSON.parse(JSON.stringify(FIXTURE_PACK)) as RatePack;

describe('validateRatePack', () => {
  it('accepts a pack exported from the v3.2 workbook', () => {
    expect(validateRatePack(FIXTURE_PACK)).toEqual([]);
  });

  it('rejects something that is not a pack', () => {
    expect(validateRatePack(null)).toEqual(['Not a JSON object.']);
    expect(validateRatePack({ schema: 'other' }).length).toBeGreaterThan(0);
  });

  it('rejects a currency other than ZAR', () => {
    const p = clone();
    (p as { currency: string }).currency = 'EUR';
    expect(validateRatePack(p)).toContain('Currency must be ZAR.');
  });

  it('catches a component that names a resource the pack does not carry', () => {
    const p = clone();
    p.buildups[0]!.components[0]!.resource = 'ZA-SET-M-nothing';
    expect(validateRatePack(p).join(' ')).toMatch(/unknown resource ZA-SET-M-nothing/);
  });

  it('catches a published rate the components do not reproduce', () => {
    const p = clone();
    p.buildups[0]!.rate += 5;
    expect(validateRatePack(p).join(' ')).toMatch(/components give 203\.09, pack says 208\.09/);
  });
});

describe('build-up arithmetic', () => {
  it('reproduces the Rate Index City rate for rough formwork (R203.09/m2)', () => {
    const b = FIXTURE_PACK.buildups.find((x) => x.id === 'fw_rough')!;
    expect(buildupRate(b, FIXTURE_PACK.settings.profit)).toBeCloseTo(203.09, 2);
  });

  it('applies the small-town and rural uplifts from Settings', () => {
    const row = rateRows(FIXTURE_PACK).find((r) => r.code === 'ZA-SET-A-fw_rough')!;
    expect(row.smallTown).toBeCloseTo(203.09 * 1.06, 2);
    expect(row.rural).toBeCloseTo(203.09 * 1.15, 2);
  });
});

describe('payloads', () => {
  it('maps a resource to a ZAR cost item in region ZA', () => {
    const r = FIXTURE_PACK.resources.find((x) => x.kind === 'labour')!;
    const p = costItemPayload(r, FIXTURE_PACK);
    expect(p).toMatchObject({ code: r.code, currency: 'ZAR', region: 'ZA', source: 'setout', unit: 'hr' });
    expect(p.tags).toContain('setout-v3.2');
  });

  it('carries profit as bid factor and keeps component costs excl profit', () => {
    const b = FIXTURE_PACK.buildups[0]!;
    const { assembly } = assemblyImportPayload(b, FIXTURE_PACK);
    expect(assembly.bid_factor).toBeCloseTo(1.125, 6);
    expect(assembly.regional_factors).toEqual({ ZA_CITY: 1, ZA_SMALL_TOWN: 1.06, ZA_RURAL: 1.15 });
    const direct = assembly.components.reduce((s, c) => s + c.quantity * c.factor * c.unit_cost, 0);
    expect(direct * assembly.bid_factor).toBeCloseTo(b.rate, 2);
    expect(assembly.components.map((c) => c.resource_type)).toEqual(
      b.components.map((c) => ({ material: 'material', labour: 'labor', plant: 'equipment' })[c.kind]),
    );
  });
});

describe('planInstall', () => {
  it('creates everything on an empty server', () => {
    const plan = planInstall(FIXTURE_PACK, [], []);
    expect(plan.costCreates).toHaveLength(FIXTURE_PACK.resources.length);
    expect(plan.assemblyCreates).toHaveLength(FIXTURE_PACK.buildups.length);
    expect(plan.costUpdates).toHaveLength(0);
  });

  it('patches only the cost items whose rate moved', () => {
    const existing = FIXTURE_PACK.resources.map((r, i) => {
      const p = costItemPayload(r, FIXTURE_PACK);
      return { id: `id-${i}`, code: r.code, rate: i === 0 ? p.rate - 10 : p.rate, description: p.description, unit: p.unit };
    });
    const plan = planInstall(FIXTURE_PACK, existing, []);
    expect(plan.costCreates).toHaveLength(0);
    expect(plan.costUpdates).toHaveLength(1);
    expect(plan.costUpdates[0]!.patch.rate).toBe(costItemPayload(FIXTURE_PACK.resources[0]!, FIXTURE_PACK).rate);
    expect(plan.costUnchanged).toBe(FIXTURE_PACK.resources.length - 1);
  });

  it('updates assemblies it already installed instead of duplicating them', () => {
    const b = FIXTURE_PACK.buildups[0]!;
    const plan = planInstall(FIXTURE_PACK, [], [{ id: 'a1', code: b.code }]);
    expect(plan.assemblyUpdates.map((u) => u.id)).toEqual(['a1']);
    expect(plan.assemblyCreates.map((x) => x.code)).not.toContain(b.code);
  });
});

describe('diffComponents', () => {
  const b = FIXTURE_PACK.buildups[0]!;
  const stored = b.components.map((c, i) => ({
    id: `c${i}`,
    description: c.description,
    quantity: c.quantity,
    unit_cost: String(c.unit_cost),
    sort_order: i,
    metadata: { setout_resource: c.resource },
  }));

  it('returns no patches when nothing moved', () => {
    expect(diffComponents(stored, b)).toEqual({ kind: 'patches', patches: [] });
  });

  it('patches a component whose price moved', () => {
    const moved = stored.map((c, i) => (i === 1 ? { ...c, unit_cost: '1.00' } : c));
    const d = diffComponents(moved, b);
    expect(d.kind).toBe('patches');
    if (d.kind === 'patches') expect(d.patches).toEqual([{ id: 'c1', unit_cost: b.components[1]!.unit_cost, quantity: b.components[1]!.quantity }]);
  });

  it('refuses to rewrite a recipe someone has changed', () => {
    expect(diffComponents(stored.slice(1), b).kind).toBe('recipe_changed');
    const swapped = stored.map((c, i) => (i === 0 ? { ...c, metadata: { setout_resource: 'other' } } : c));
    expect(diffComponents(swapped, b).kind).toBe('recipe_changed');
  });
});

describe('filterRows', () => {
  it('matches every word, case-insensitive', () => {
    const rows = rateRows(FIXTURE_PACK);
    expect(filterRows(rows, 'ROUGH formwork').map((r) => r.code)).toEqual(['ZA-SET-A-fw_rough']);
    expect(filterRows(rows, '')).toHaveLength(rows.length);
    expect(filterRows(rows, 'formwork bath')).toHaveLength(0);
  });
});
