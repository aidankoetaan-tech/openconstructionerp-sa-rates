// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Rate movers: what changed between two rate packs.
 *
 * Items are matched by code, which the pack keeps stable from month to month.
 * A resource or build-up whose unit changed is reported but not given a
 * percentage, because the two rates are not measuring the same thing.
 *
 * For a build-up present in both packs, the driver is the component whose
 * contribution to the direct cost (quantity × unit cost, excl profit) moved the
 * most. A change in the pack's profit setting is reported separately, because
 * it moves every build-up rate at once.
 */
import { directCost, type RatePack, type RatePackBuildup, type ResourceKind } from './ratepack';

export type MoverKind = ResourceKind | 'buildup';
export type MoverStatus = 'moved' | 'unchanged' | 'new' | 'removed' | 'unit_changed';

export interface Driver {
  resource: string;
  description: string;
  /** Change in this component's contribution to direct cost, excl profit. */
  contribution: number;
  /** What happened to the component itself. */
  change: 'price' | 'quantity' | 'price_and_quantity' | 'added' | 'removed';
}

export interface Mover {
  code: string;
  kind: MoverKind;
  name: string;
  unit: string;
  from: number | null;
  to: number | null;
  change: number | null;
  /** Fractional change, e.g. 0.052 for 5.2 %. Null when it cannot be compared. */
  pct: number | null;
  status: MoverStatus;
  /** Earlier unit, where it differs. */
  fromUnit?: string;
  driver?: Driver;
}

export interface KindSummary {
  compared: number;
  up: number;
  down: number;
  unchanged: number;
  added: number;
  removed: number;
  /** Median of the percentage changes of compared items, unchanged ones included. */
  medianPct: number | null;
  /** Mean percentage change across compared items, unchanged ones included (an unweighted basket). */
  meanPct: number | null;
  /** Median percentage change of the items that moved. */
  medianMovedPct: number | null;
}

export interface PackLabel {
  version: string;
  pricedOn: string;
}

export interface Comparison {
  earlier: PackLabel;
  later: PackLabel;
  /** True when the packs were given in the wrong order and swapped. */
  swapped: boolean;
  profit: { from: number; to: number } | null;
  movers: Mover[];
  summary: Record<MoverKind, KindSummary>;
  notes: string[];
}

export const MOVER_KINDS: MoverKind[] = ['material', 'labour', 'plant', 'buildup'];

const r2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
/** Rates are published to the cent; anything smaller is rounding noise. */
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function emptySummary(): KindSummary {
  return { compared: 0, up: 0, down: 0, unchanged: 0, added: 0, removed: 0, medianPct: null, meanPct: null, medianMovedPct: null };
}

function compareRates(
  base: Pick<Mover, 'code' | 'kind' | 'name' | 'unit'>,
  earlier: { rate: number; unit: string } | undefined,
  later: { rate: number; unit: string } | undefined,
): Mover {
  if (!earlier) return { ...base, from: null, to: later!.rate, change: null, pct: null, status: 'new' };
  if (!later) return { ...base, unit: earlier.unit, from: earlier.rate, to: null, change: null, pct: null, status: 'removed' };
  if (earlier.unit !== later.unit) {
    return { ...base, fromUnit: earlier.unit, from: earlier.rate, to: later.rate, change: null, pct: null, status: 'unit_changed' };
  }
  const change = r2(later.rate - earlier.rate);
  const pct = earlier.rate !== 0 ? (later.rate - earlier.rate) / earlier.rate : null;
  return {
    ...base,
    from: earlier.rate,
    to: later.rate,
    change,
    pct,
    status: same(earlier.rate, later.rate) ? 'unchanged' : 'moved',
  };
}

/** The component that moved the build-up's direct cost the most. */
export function buildupDriver(earlier: RatePackBuildup, later: RatePackBuildup): Driver | undefined {
  const before = new Map(earlier.components.map((c) => [c.resource, c]));
  const after = new Map(later.components.map((c) => [c.resource, c]));
  const codes = new Set([...before.keys(), ...after.keys()]);
  let best: Driver | undefined;
  for (const code of codes) {
    const a = before.get(code);
    const b = after.get(code);
    const contribution = (b ? b.quantity * b.unit_cost : 0) - (a ? a.quantity * a.unit_cost : 0);
    if (Math.abs(contribution) < 0.005) continue;
    let change: Driver['change'];
    if (!a) change = 'added';
    else if (!b) change = 'removed';
    else {
      const q = a.quantity !== b.quantity;
      const p = !same(a.unit_cost, b.unit_cost);
      change = q && p ? 'price_and_quantity' : q ? 'quantity' : 'price';
    }
    if (!best || Math.abs(contribution) > Math.abs(best.contribution)) {
      best = { resource: code, description: (b ?? a)!.description, contribution: r2(contribution), change };
    }
  }
  return best;
}

export function compareRatePacks(first: RatePack, second: RatePack): Comparison {
  const swapped = first.priced_on > second.priced_on;
  const earlier = swapped ? second : first;
  const later = swapped ? first : second;
  const notes: string[] = [];
  if (swapped) notes.push(`The packs were in the wrong order, so ${earlier.library_version} (${earlier.priced_on}) is treated as the earlier one.`);
  if (earlier.priced_on === later.priced_on && earlier.library_version === later.library_version) {
    notes.push('Both packs carry the same version and pricing date.');
  }
  const profit = same(earlier.settings.profit, later.settings.profit)
    ? null
    : { from: earlier.settings.profit, to: later.settings.profit };
  if (profit) {
    notes.push(
      `Profit changed from ${(profit.from * 100).toFixed(1)} % to ${(profit.to * 100).toFixed(1)} %, which moves every build-up rate before any price change.`,
    );
  }

  const movers: Mover[] = [];

  const resBefore = new Map(earlier.resources.map((r) => [r.code, r]));
  const resAfter = new Map(later.resources.map((r) => [r.code, r]));
  for (const code of new Set([...resBefore.keys(), ...resAfter.keys()])) {
    const a = resBefore.get(code);
    const b = resAfter.get(code);
    const ref = (b ?? a)!;
    movers.push(compareRates({ code, kind: ref.kind, name: ref.name, unit: ref.unit }, a, b));
  }

  const buBefore = new Map(earlier.buildups.map((x) => [x.code, x]));
  const buAfter = new Map(later.buildups.map((x) => [x.code, x]));
  for (const code of new Set([...buBefore.keys(), ...buAfter.keys()])) {
    const a = buBefore.get(code);
    const b = buAfter.get(code);
    const ref = (b ?? a)!;
    const m = compareRates({ code, kind: 'buildup', name: ref.name, unit: ref.unit }, a, b);
    if (a && b && m.status === 'moved') {
      const driver = buildupDriver(a, b);
      if (driver) m.driver = driver;
      else if (profit) {
        m.driver = { resource: '', description: 'Profit setting', contribution: r2(directCost(b) * (profit.to - profit.from)), change: 'price' };
      }
    }
    movers.push(m);
  }

  const summary = Object.fromEntries(MOVER_KINDS.map((k) => [k, emptySummary()])) as Record<MoverKind, KindSummary>;
  for (const k of MOVER_KINDS) {
    const of = movers.filter((m) => m.kind === k);
    const s = summary[k];
    const compared = of.filter((m) => m.status === 'moved' || m.status === 'unchanged');
    s.compared = compared.length;
    s.up = compared.filter((m) => m.status === 'moved' && m.change! > 0).length;
    s.down = compared.filter((m) => m.status === 'moved' && m.change! < 0).length;
    s.unchanged = compared.filter((m) => m.status === 'unchanged').length;
    s.added = of.filter((m) => m.status === 'new').length;
    s.removed = of.filter((m) => m.status === 'removed').length;
    const pcts = compared.map((m) => m.pct).filter((p): p is number => p !== null);
    s.medianPct = median(pcts);
    s.meanPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    s.medianMovedPct = median(compared.filter((m) => m.status === 'moved' && m.pct !== null).map((m) => m.pct!));
  }

  movers.sort((x, y) => Math.abs(y.pct ?? 0) - Math.abs(x.pct ?? 0) || x.code.localeCompare(y.code));

  return {
    earlier: { version: earlier.library_version, pricedOn: earlier.priced_on },
    later: { version: later.library_version, pricedOn: later.priced_on },
    swapped,
    profit,
    movers,
    summary,
    notes,
  };
}

/** Moved items at or beyond a percentage threshold, largest first. */
export function topMovers(c: Comparison, opts: { direction: 'up' | 'down'; n: number; kind?: MoverKind }): Mover[] {
  return c.movers
    .filter((m) => m.status === 'moved' && m.pct !== null && (!opts.kind || m.kind === opts.kind))
    .filter((m) => (opts.direction === 'up' ? m.pct! > 0 : m.pct! < 0))
    .sort((a, b) => (opts.direction === 'up' ? b.pct! - a.pct! : a.pct! - b.pct!))
    .slice(0, opts.n);
}

export function moversCsv(c: Comparison): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const num = (v: number | null) => (v === null ? '' : v.toFixed(2));
  const rows = [
    `${esc('Earlier pack')},${esc(`${c.earlier.version} ${c.earlier.pricedOn}`)}`,
    `${esc('Later pack')},${esc(`${c.later.version} ${c.later.pricedOn}`)}`,
    ...c.notes.map((n) => esc(n)),
    '',
    'code,kind,name,unit,status,from_excl_vat,to_excl_vat,change,change_pct,driver,driver_change,driver_contribution',
  ];
  for (const m of c.movers) {
    rows.push(
      [
        m.code,
        m.kind,
        esc(m.name),
        esc(m.fromUnit ? `${m.fromUnit} -> ${m.unit}` : m.unit),
        m.status,
        num(m.from),
        num(m.to),
        num(m.change),
        m.pct === null ? '' : (m.pct * 100).toFixed(2),
        m.driver ? esc(m.driver.resource ? `${m.driver.resource} ${m.driver.description}` : m.driver.description) : '',
        m.driver?.change ?? '',
        m.driver ? m.driver.contribution.toFixed(2) : '',
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}
