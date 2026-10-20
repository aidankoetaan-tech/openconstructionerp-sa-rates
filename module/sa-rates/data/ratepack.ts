// SPDX-License-Identifier: AGPL-3.0-only
// South African rates & build-ups module for OpenConstructionERP.
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * Rate pack contract and the pure logic that turns a pack into API payloads.
 *
 * A rate pack (`setout.za.ratepack/1`) is a JSON export of the Setout BOQ
 * master build-up: supplier-priced materials, BIBC-loaded labour and plant
 * hire as resources, and ASAQS-style build-ups whose components reference
 * those resources. Everything here is side-effect free so it can be unit
 * tested without a backend; `../api.ts` does the HTTP.
 *
 * Mapping into OpenConstructionERP:
 *   resource  -> cost item   (code `ZA-SET-…`, region ZA, currency ZAR, source `setout`)
 *   build-up  -> assembly    (components priced excl profit, profit as `bid_factor`,
 *                             small-town / rural uplifts as `regional_factors`)
 */

export const RATEPACK_SCHEMA = 'setout.za.ratepack/1';
export const COST_SOURCE = 'setout';
export const COST_REGION = 'ZA';
export const ASSEMBLY_TAG = 'setout-za';
export const ASSEMBLY_CATEGORY = 'Setout SA build-ups';

export type ResourceKind = 'material' | 'labour' | 'plant';

export interface RatePackResource {
  code: string;
  kind: ResourceKind;
  name: string;
  unit: string;
  /** City average, ZAR excl VAT, per `unit`. */
  rate: number;
  low: number;
  high: number;
  key?: string;
  suppliers?: number;
  dated?: string;
  basis?: string;
  source_url?: string;
}

export interface RatePackComponent {
  resource: string;
  kind: ResourceKind;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

export interface RatePackBuildup {
  code: string;
  id: string;
  name: string;
  heading?: string;
  unit: string;
  /** Published City average rate incl profit, excl VAT. */
  rate: number;
  components: RatePackComponent[];
}

export interface RatePack {
  schema: string;
  library_version: string;
  priced_on: string;
  region: string;
  currency: string;
  basis: string;
  publisher: { name: string; url: string; contact?: string };
  disclaimer: string;
  settings: {
    profit: number;
    small_town_uplift: number;
    rural_uplift: number;
    vat: number;
    labour_oncost: number;
  };
  regional_factors: Record<string, number>;
  counts: { resources: number; materials: number; buildups: number };
  resources: RatePackResource[];
  buildups: RatePackBuildup[];
}

/* ── Validation ────────────────────────────────────────────────────── */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Check a parsed JSON value is a usable rate pack. Returns the problems found;
 * an empty list means the pack is safe to install. Cross-checks every
 * build-up: components must name a resource in the pack, and the components
 * plus profit must reproduce the published rate to within one cent.
 */
export function validateRatePack(raw: unknown): string[] {
  const errs: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Not a JSON object.'];
  const p = raw as Partial<RatePack>;
  if (p.schema !== RATEPACK_SCHEMA) errs.push(`Unknown schema "${String(p.schema)}", expected ${RATEPACK_SCHEMA}.`);
  if (p.currency !== 'ZAR') errs.push('Currency must be ZAR.');
  if (!isStr(p.library_version)) errs.push('Missing library_version.');
  if (!isStr(p.priced_on) || !/^\d{4}-\d{2}-\d{2}$/.test(p.priced_on)) errs.push('priced_on must be YYYY-MM-DD.');
  const s = p.settings;
  if (!s || ![s.profit, s.small_town_uplift, s.rural_uplift, s.vat].every((x) => isNum(x) && x >= 0 && x < 1)) {
    errs.push('settings must carry profit, small_town_uplift, rural_uplift and vat as fractions.');
  }
  if (!Array.isArray(p.resources) || p.resources.length === 0) errs.push('No resources.');
  if (!Array.isArray(p.buildups) || p.buildups.length === 0) errs.push('No build-ups.');
  if (errs.length) return errs;

  const codes = new Set<string>();
  for (const r of p.resources!) {
    if (!isStr(r.code) || !isStr(r.name) || !isStr(r.unit) || !isNum(r.rate) || r.rate < 0) {
      errs.push(`Resource ${String(r.code)} is incomplete.`);
      continue;
    }
    if (codes.has(r.code)) errs.push(`Duplicate resource code ${r.code}.`);
    codes.add(r.code);
  }
  const profit = s!.profit;
  for (const b of p.buildups!) {
    if (!isStr(b.code) || !isStr(b.name) || !isStr(b.unit) || !isNum(b.rate) || !Array.isArray(b.components)) {
      errs.push(`Build-up ${String(b.code)} is incomplete.`);
      continue;
    }
    for (const c of b.components) {
      if (!codes.has(c.resource)) errs.push(`${b.code}: component references unknown resource ${c.resource}.`);
      if (!isNum(c.quantity) || c.quantity < 0 || !isNum(c.unit_cost) || c.unit_cost < 0) {
        errs.push(`${b.code}: component "${c.description}" has a bad quantity or unit cost.`);
      }
    }
    const rebuilt = buildupRate(b, profit);
    if (Math.abs(rebuilt - b.rate) > 0.01) {
      errs.push(`${b.code}: components give ${rebuilt.toFixed(2)}, pack says ${b.rate.toFixed(2)}.`);
    }
    if (errs.length > 50) {
      errs.push('…stopped after 50 problems.');
      break;
    }
  }
  return errs;
}

/** Direct cost of a build-up (sum of quantity × unit cost), excl profit. */
export function directCost(b: Pick<RatePackBuildup, 'components'>): number {
  return b.components.reduce((sum, c) => sum + c.quantity * c.unit_cost, 0);
}

/** Rate incl profit, City basis. */
export function buildupRate(b: Pick<RatePackBuildup, 'components'>, profit: number): number {
  return directCost(b) * (1 + profit);
}

/* ── API payloads ──────────────────────────────────────────────────── */

const RESOURCE_TYPE: Record<ResourceKind, string> = {
  material: 'material',
  labour: 'labor',
  plant: 'equipment',
};

export interface CostItemPayload {
  code: string;
  description: string;
  unit: string;
  rate: number;
  currency: 'ZAR';
  source: typeof COST_SOURCE;
  region: typeof COST_REGION;
  tags: string[];
  classification: Record<string, string>;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function costItemPayload(r: RatePackResource, pack: Pick<RatePack, 'library_version'>): CostItemPayload {
  const range = r.low !== r.high ? ` (range R${r.low.toFixed(2)}–R${r.high.toFixed(2)})` : '';
  return {
    code: r.code,
    description: `${r.name}${range}`,
    unit: r.unit,
    rate: round2(r.rate),
    currency: 'ZAR',
    source: COST_SOURCE,
    region: COST_REGION,
    tags: [ASSEMBLY_TAG, `setout-${r.kind}`, `setout-${pack.library_version}`],
    classification: { setout_kind: r.kind },
  };
}

export interface AssemblyComponentPayload {
  description: string;
  quantity: number;
  factor: number;
  unit: string;
  unit_cost: number;
  resource_type: string;
  sort_order: number;
  metadata: { setout_resource: string };
}

export interface AssemblyImportPayload {
  assembly: {
    code: string;
    name: string;
    description: string;
    unit: string;
    category: string;
    currency: 'ZAR';
    bid_factor: number;
    regional_factors: Record<string, number>;
    tags: string[];
    components: AssemblyComponentPayload[];
  };
}

export function componentPayloads(b: RatePackBuildup): AssemblyComponentPayload[] {
  return b.components.map((c, i) => ({
    description: c.description,
    quantity: c.quantity,
    factor: 1,
    unit: c.unit,
    unit_cost: c.unit_cost,
    resource_type: RESOURCE_TYPE[c.kind],
    sort_order: i,
    metadata: { setout_resource: c.resource },
  }));
}

export function assemblyImportPayload(b: RatePackBuildup, pack: RatePack): AssemblyImportPayload {
  return {
    assembly: {
      code: b.code,
      name: b.name,
      description:
        `Setout SA build-up ${b.id}, library ${pack.library_version} priced ${pack.priced_on}. ` +
        `City (Johannesburg) basis excl VAT; profit ${(pack.settings.profit * 100).toFixed(1)}% as bid factor. ` +
        pack.disclaimer,
      unit: b.unit,
      category: ASSEMBLY_CATEGORY,
      currency: 'ZAR',
      bid_factor: 1 + pack.settings.profit,
      regional_factors: pack.regional_factors,
      tags: [ASSEMBLY_TAG, `setout-${pack.library_version}`],
      components: componentPayloads(b),
    },
  };
}

/* ── Install / update planning ─────────────────────────────────────── */

export interface ExistingCostItem {
  id: string;
  code: string;
  rate: number;
  description: string;
  unit: string;
}

export interface ExistingAssembly {
  id: string;
  code: string;
}

export interface InstallPlan {
  costCreates: CostItemPayload[];
  costUpdates: { id: string; code: string; from: number; patch: Partial<CostItemPayload> }[];
  costUnchanged: number;
  assemblyCreates: RatePackBuildup[];
  /** Existing assemblies to re-price component by component. */
  assemblyUpdates: { id: string; buildup: RatePackBuildup }[];
}

/**
 * Work out what an install has to do against what the server already holds.
 * Matching is by code, which the pack keeps stable across versions, so a
 * monthly update changes rates in place instead of piling up duplicates.
 */
export function planInstall(
  pack: RatePack,
  costs: ExistingCostItem[],
  assemblies: ExistingAssembly[],
): InstallPlan {
  const costByCode = new Map(costs.map((c) => [c.code, c]));
  const asmByCode = new Map(assemblies.map((a) => [a.code, a]));
  const plan: InstallPlan = {
    costCreates: [],
    costUpdates: [],
    costUnchanged: 0,
    assemblyCreates: [],
    assemblyUpdates: [],
  };
  for (const r of pack.resources) {
    const payload = costItemPayload(r, pack);
    const have = costByCode.get(r.code);
    if (!have) {
      plan.costCreates.push(payload);
      continue;
    }
    const patch: Partial<CostItemPayload> = {};
    if (Math.abs(have.rate - payload.rate) >= 0.005) patch.rate = payload.rate;
    if (have.description !== payload.description) patch.description = payload.description;
    if (have.unit !== payload.unit) patch.unit = payload.unit;
    if (Object.keys(patch).length) {
      patch.tags = payload.tags;
      plan.costUpdates.push({ id: have.id, code: r.code, from: have.rate, patch });
    } else {
      plan.costUnchanged += 1;
    }
  }
  for (const b of pack.buildups) {
    const have = asmByCode.get(b.code);
    if (have) plan.assemblyUpdates.push({ id: have.id, buildup: b });
    else plan.assemblyCreates.push(b);
  }
  return plan;
}

export interface ExistingComponent {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number | string;
  sort_order: number;
  metadata?: Record<string, unknown> | null;
}

export type ComponentDiff =
  | { kind: 'patches'; patches: { id: string; unit_cost: number; quantity: number }[] }
  | { kind: 'recipe_changed'; reason: string };

/**
 * Compare a stored assembly's components with the pack's recipe. A monthly
 * pack only moves prices, so the normal result is a short list of unit-cost
 * patches. If the recipe itself differs (line added, removed or swapped) the
 * assembly is reported instead of rewritten: it may have been edited by hand.
 */
export function diffComponents(existing: ExistingComponent[], b: RatePackBuildup): ComponentDiff {
  const ordered = [...existing].sort((x, y) => x.sort_order - y.sort_order);
  if (ordered.length !== b.components.length) {
    return {
      kind: 'recipe_changed',
      reason: `${ordered.length} components stored, pack has ${b.components.length}`,
    };
  }
  const patches: { id: string; unit_cost: number; quantity: number }[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const have = ordered[i]!;
    const want = b.components[i]!;
    const tag = have.metadata?.['setout_resource'];
    if (tag !== want.resource) {
      return { kind: 'recipe_changed', reason: `line ${i + 1} is not ${want.resource}` };
    }
    const cost = Number(have.unit_cost);
    if (Math.abs(cost - want.unit_cost) > 1e-6 || Math.abs(have.quantity - want.quantity) > 1e-9) {
      patches.push({ id: have.id, unit_cost: want.unit_cost, quantity: want.quantity });
    }
  }
  return { kind: 'patches', patches };
}

/* ── Read-side helpers for the page ───────────────────────────────── */

export interface RateRow {
  code: string;
  name: string;
  unit: string;
  city: number;
  smallTown: number;
  rural: number;
  lines: number;
}

export function rateRows(pack: RatePack): RateRow[] {
  const st = 1 + pack.settings.small_town_uplift;
  const ru = 1 + pack.settings.rural_uplift;
  return pack.buildups.map((b) => ({
    code: b.code,
    name: b.name,
    unit: b.unit,
    city: b.rate,
    smallTown: round2(b.rate * st),
    rural: round2(b.rate * ru),
    lines: b.components.length,
  }));
}

export function filterRows(rows: RateRow[], query: string): RateRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const words = q.split(/\s+/);
  return rows.filter((r) => {
    const hay = `${r.name} ${r.code} ${r.unit}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
