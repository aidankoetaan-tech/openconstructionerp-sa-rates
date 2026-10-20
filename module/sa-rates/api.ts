// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
/**
 * HTTP side of the SA rates module: load a rate pack, read what is already
 * installed, and apply an install plan through the existing Costs and
 * Assemblies endpoints. No new backend endpoint is needed.
 */
import { apiGet, apiPatch, apiPost } from '@/shared/lib/api';

import {
  ASSEMBLY_TAG,
  COST_REGION,
  COST_SOURCE,
  assemblyImportPayload,
  diffComponents,
  type CostItemPayload,
  type ExistingAssembly,
  type ExistingComponent,
  type ExistingCostItem,
  type InstallPlan,
  type RatePack,
} from './data/ratepack';

/** Default published pack. Browsers can only fetch it when the server's CSP
 *  `connect-src` allows https://setout.co.za; uploading the file always works. */
export const DEFAULT_PACK_URL = 'https://setout.co.za/api/ratepack/latest';

export async function fetchPackFromUrl(url: string, accessKey?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessKey) headers['X-Setout-Key'] = accessKey;
  const res = await fetch(url, { headers, credentials: 'omit' });
  if (!res.ok) throw new Error(`Rate pack request failed: HTTP ${res.status}`);
  return res.json();
}

export async function readPackFile(file: File): Promise<unknown> {
  return JSON.parse(await file.text());
}

/* ── Reading what is installed ─────────────────────────────────────── */

interface CostPage {
  items: { id: string; code: string; rate: number | string; description: string; unit: string }[];
  next_cursor?: string | null;
  has_more?: boolean;
}

export async function fetchInstalledCostItems(): Promise<ExistingCostItem[]> {
  const out: ExistingCostItem[] = [];
  let cursor: string | null | undefined;
  let offset = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const qs = new URLSearchParams({ source: COST_SOURCE, region: COST_REGION, limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    else qs.set('offset', String(offset));
    const page = await apiGet<CostPage>(`/v1/costs/?${qs}`);
    for (const it of page.items) {
      out.push({ id: it.id, code: it.code, rate: Number(it.rate), description: it.description, unit: it.unit });
    }
    if (!page.has_more || page.items.length === 0) break;
    cursor = page.next_cursor;
    offset += page.items.length;
  }
  return out;
}

interface AssemblyPage {
  items: { id: string; code: string; metadata?: Record<string, unknown> }[];
  total: number;
}

export async function fetchInstalledAssemblies(): Promise<ExistingAssembly[]> {
  const out: ExistingAssembly[] = [];
  for (let offset = 0; offset < 50_000; offset += 500) {
    const qs = new URLSearchParams({ tag: ASSEMBLY_TAG, limit: '500', offset: String(offset) });
    const page = await apiGet<AssemblyPage>(`/v1/assemblies/?${qs}`);
    // The tag filter is a LIKE over the metadata JSON, so keep only our codes.
    out.push(...page.items.filter((a) => a.code.startsWith('ZA-SET-A-')).map((a) => ({ id: a.id, code: a.code })));
    if (offset + page.items.length >= page.total || page.items.length === 0) break;
  }
  return out;
}

/* ── Applying a plan ───────────────────────────────────────────────── */

export interface InstallProgress {
  step: 'costs' | 'assemblies' | 'reprice' | 'done';
  done: number;
  total: number;
}

export interface InstallResult {
  costsCreated: number;
  costsUpdated: number;
  assembliesCreated: number;
  assembliesRepriced: number;
  componentsPatched: number;
  /** Assemblies whose stored recipe no longer matches the pack; left alone. */
  skipped: { code: string; reason: string }[];
  failed: { code: string; error: string }[];
}

/** Run `tasks` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function applyInstallPlan(
  pack: RatePack,
  plan: InstallPlan,
  onProgress: (p: InstallProgress) => void,
): Promise<InstallResult> {
  const result: InstallResult = {
    costsCreated: 0,
    costsUpdated: 0,
    assembliesCreated: 0,
    assembliesRepriced: 0,
    componentsPatched: 0,
    skipped: [],
    failed: [],
  };

  // 1. Cost items: bulk create in chunks, then patch the ones that moved.
  const costTotal = plan.costCreates.length + plan.costUpdates.length;
  let costDone = 0;
  for (let i = 0; i < plan.costCreates.length; i += 200) {
    const chunk = plan.costCreates.slice(i, i + 200);
    try {
      const created = await apiPost<unknown[], CostItemPayload[]>('/v1/costs/bulk/', chunk);
      result.costsCreated += created.length;
    } catch (e) {
      for (const c of chunk) result.failed.push({ code: c.code, error: errText(e) });
    }
    costDone += chunk.length;
    onProgress({ step: 'costs', done: costDone, total: costTotal });
  }
  await pool(plan.costUpdates, 4, async (u) => {
    try {
      await apiPatch(`/v1/costs/${u.id}`, u.patch);
      result.costsUpdated += 1;
    } catch (e) {
      result.failed.push({ code: u.code, error: errText(e) });
    }
    costDone += 1;
    onProgress({ step: 'costs', done: costDone, total: costTotal });
  });

  // 2. New assemblies, one import call each (components travel with it).
  let asmDone = 0;
  await pool(plan.assemblyCreates, 4, async (b) => {
    try {
      await apiPost('/v1/assemblies/import/', assemblyImportPayload(b, pack));
      result.assembliesCreated += 1;
    } catch (e) {
      result.failed.push({ code: b.code, error: errText(e) });
    }
    asmDone += 1;
    onProgress({ step: 'assemblies', done: asmDone, total: plan.assemblyCreates.length });
  });

  // 3. Installed assemblies: re-price the components that moved, refresh
  //    profit and uplifts from the pack's Settings.
  let repDone = 0;
  await pool(plan.assemblyUpdates, 4, async ({ id, buildup }) => {
    try {
      const full = await apiGet<{ components: ExistingComponent[]; metadata?: Record<string, unknown> }>(
        `/v1/assemblies/${id}`,
      );
      const diff = diffComponents(full.components ?? [], buildup);
      if (diff.kind === 'recipe_changed') {
        result.skipped.push({ code: buildup.code, reason: diff.reason });
      } else {
        for (const p of diff.patches) {
          await apiPatch(`/v1/assemblies/${id}/components/${p.id}`, {
            unit_cost: p.unit_cost,
            quantity: p.quantity,
          });
          result.componentsPatched += 1;
        }
        await apiPatch(`/v1/assemblies/${id}`, {
          bid_factor: 1 + pack.settings.profit,
          regional_factors: pack.regional_factors,
          // PATCH replaces metadata wholesale, and the install tag lives in
          // metadata.tags, so merge onto what is stored rather than overwrite.
          metadata: {
            ...(full.metadata ?? {}),
            setout_library_version: pack.library_version,
            setout_priced_on: pack.priced_on,
          },
        });
        result.assembliesRepriced += 1;
      }
    } catch (e) {
      result.failed.push({ code: buildup.code, error: errText(e) });
    }
    repDone += 1;
    onProgress({ step: 'reprice', done: repDone, total: plan.assemblyUpdates.length });
  });

  onProgress({ step: 'done', done: 1, total: 1 });
  return result;
}
