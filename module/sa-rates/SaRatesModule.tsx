// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, MapPin, RefreshCw, Search, ShieldCheck } from 'lucide-react';

import { Badge, Button, Card, Input } from '@/shared/ui';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';
import { useToastStore } from '@/stores/useToastStore';

import {
  DEFAULT_PACK_URL,
  applyInstallPlan,
  fetchInstalledAssemblies,
  fetchInstalledCostItems,
  fetchPackFromUrl,
  readPackFile,
  type InstallProgress,
  type InstallResult,
} from './api';
import { filterRows, planInstall, rateRows, validateRatePack, type InstallPlan, type RatePack } from './data/ratepack';

const CpapCalculator = lazy(() => import('./CpapCalculator'));

const URL_KEY = 'sa_rates.pack_url';
const ROW_LIMIT = 200;

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: the field just won't be remembered */
  }
}

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function pct(v: number): string {
  return `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%`;
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export default function SaRatesModule() {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [packUrl, setPackUrl] = useState(() => readStored(URL_KEY, DEFAULT_PACK_URL));
  const [accessKey, setAccessKey] = useState('');
  const [pack, setPack] = useState<RatePack | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'rates' | 'cpap'>('rates');

  const rows = useMemo(() => (pack ? rateRows(pack) : []), [pack]);
  const shown = useMemo(() => filterRows(rows, query), [rows, query]);

  function accept(raw: unknown, origin: string) {
    const errs = validateRatePack(raw);
    setPlan(null);
    setResult(null);
    if (errs.length) {
      setPack(null);
      setProblems(errs);
      return;
    }
    setProblems([]);
    setPack(raw as RatePack);
    addToast({
      type: 'success',
      title: t('sa_rates.loaded', { defaultValue: 'Rate pack loaded' }),
      message: origin,
    });
  }

  async function loadFromUrl() {
    setLoading(true);
    try {
      writeStored(URL_KEY, packUrl);
      accept(await fetchPackFromUrl(packUrl, accessKey || undefined), packUrl);
    } catch (e) {
      setPack(null);
      setProblems([
        e instanceof Error ? e.message : String(e),
        t('sa_rates.fetch_hint', {
          defaultValue:
            'If the browser blocked the request, your server does not allow this address yet. Download the pack and upload the file instead.',
        }),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadFromFile(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    try {
      accept(await readPackFile(file), file.name);
    } catch (e) {
      setPack(null);
      setProblems([e instanceof Error ? e.message : String(e)]);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function checkInstalled() {
    if (!pack) return;
    setChecking(true);
    setResult(null);
    try {
      const [costs, assemblies] = await Promise.all([fetchInstalledCostItems(), fetchInstalledAssemblies()]);
      setPlan(planInstall(pack, costs, assemblies));
    } catch (e) {
      addToast({
        type: 'error',
        title: t('sa_rates.check_failed', { defaultValue: 'Could not read the installed library' }),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setChecking(false);
    }
  }

  async function install() {
    if (!pack || !plan) return;
    setProgress({ step: 'costs', done: 0, total: 1 });
    try {
      const r = await applyInstallPlan(pack, plan, setProgress);
      setResult(r);
      setPlan(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['costs'] }),
        queryClient.invalidateQueries({ queryKey: ['assemblies'] }),
      ]);
      addToast({
        type: r.failed.length ? 'warning' : 'success',
        title: t('sa_rates.installed', { defaultValue: 'SA library {{version}} installed', version: pack.library_version }),
        message: t('sa_rates.installed_msg', {
          defaultValue: '{{failed}} failed, {{skipped}} left unchanged',
          failed: r.failed.length,
          skipped: r.skipped.length,
        }),
      });
    } finally {
      setProgress(null);
    }
  }

  const busy = loading || checking || progress !== null;
  const nothingToDo =
    plan &&
    plan.costCreates.length + plan.costUpdates.length + plan.assemblyCreates.length + plan.assemblyUpdates.length === 0;

  return (
    <div className="space-y-6" data-testid="sa-rates-page">
      <div>
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-oe-blue" aria-hidden />
          <h1 className="text-2xl font-bold text-content-primary">
            {t('modules.sa_rates.name', { defaultValue: 'SA Rates & Build-ups' })}
          </h1>
          <Badge variant="neutral">ZAR</Badge>
        </div>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.subtitle', {
            defaultValue:
              'Install South African supplier-priced materials, BIBC labour, plant hire and ASAQS-style build-ups as cost items and assemblies, and refresh them each month.',
          })}
        </p>
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ['rates', t('sa_rates.tab_rates', { defaultValue: 'Rates & build-ups' })],
            ['cpap', t('sa_rates.tab_cpap', { defaultValue: 'CPAP escalation' })],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px px-3 py-2 text-sm ${
              tab === id ? 'border-b-2 border-oe-blue font-medium text-content-primary' : 'text-content-tertiary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cpap' && (
        <Suspense fallback={null}>
          <CpapCalculator />
        </Suspense>
      )}

      {tab === 'rates' && (
        <>
          {/* ── 1. Load a pack ─────────────────────────────────────────── */}
          <Card padding="md">
            <h2 className="text-base font-semibold text-content-primary">
              {t('sa_rates.step_load', { defaultValue: '1. Load the rate pack' })}
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_14rem_auto]">
              <Input
                aria-label={t('sa_rates.pack_url', { defaultValue: 'Pack address' })}
                value={packUrl}
                onChange={(e) => setPackUrl(e.target.value)}
                placeholder={DEFAULT_PACK_URL}
              />
              <Input
                aria-label={t('sa_rates.access_key', { defaultValue: 'Access key' })}
                type="password"
                autoComplete="off"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder={t('sa_rates.access_key', { defaultValue: 'Access key' })}
              />
              <Button variant="primary" onClick={loadFromUrl} disabled={busy || !packUrl}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden />
                {t('sa_rates.fetch', { defaultValue: 'Fetch' })}
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm text-content-secondary">
              <span>{t('sa_rates.or', { defaultValue: 'or' })}</span>
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
                {t('sa_rates.upload', { defaultValue: 'Upload pack file (.json)' })}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void loadFromFile(e.target.files?.[0])}
              />
            </div>
            {problems.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Card>

          {pack && (
            <>
              {/* ── Pack summary ───────────────────────────────────────── */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card padding="sm">
                  <div className="text-xs uppercase text-content-tertiary">
                    {t('sa_rates.library', { defaultValue: 'Library' })}
                  </div>
                  <div className="text-lg font-semibold">{pack.library_version}</div>
                  <div className="text-xs text-content-tertiary">
                    {t('sa_rates.priced_on', { defaultValue: 'Priced {{date}}', date: ddmmyyyy(pack.priced_on) })}
                  </div>
                </Card>
                <Card padding="sm">
                  <div className="text-xs uppercase text-content-tertiary">
                    {t('sa_rates.resources', { defaultValue: 'Resources' })}
                  </div>
                  <div className="text-lg font-semibold">{pack.counts.resources}</div>
                  <div className="text-xs text-content-tertiary">
                    {t('sa_rates.materials_n', {
                      defaultValue: '{{m}} materials, {{o}} labour and plant',
                      m: pack.counts.materials,
                      o: pack.counts.resources - pack.counts.materials,
                    })}
                  </div>
                </Card>
                <Card padding="sm">
                  <div className="text-xs uppercase text-content-tertiary">
                    {t('sa_rates.buildups', { defaultValue: 'Build-ups' })}
                  </div>
                  <div className="text-lg font-semibold">{pack.counts.buildups}</div>
                  <div className="text-xs text-content-tertiary">
                    {t('sa_rates.as_assemblies', { defaultValue: 'installed as assemblies' })}
                  </div>
                </Card>
                <Card padding="sm">
                  <div className="text-xs uppercase text-content-tertiary">
                    {t('sa_rates.settings', { defaultValue: 'Settings' })}
                  </div>
                  <div className="text-sm">
                    {t('sa_rates.settings_line', {
                      defaultValue: 'Profit {{p}} · small town +{{s}} · rural +{{r}}',
                      p: pct(pack.settings.profit),
                      s: pct(pack.settings.small_town_uplift),
                      r: pct(pack.settings.rural_uplift),
                    })}
                  </div>
                  <div className="text-xs text-content-tertiary">
                    {t('sa_rates.excl_vat', { defaultValue: 'City (Johannesburg) basis, excl VAT' })}
                  </div>
                </Card>
              </div>

              {/* ── 2. Install / update ────────────────────────────────── */}
              <Card padding="md">
                <h2 className="text-base font-semibold text-content-primary">
                  {t('sa_rates.step_install', { defaultValue: '2. Install or update' })}
                </h2>
                <p className="mt-1 text-sm text-content-tertiary">
                  {t('sa_rates.install_help', {
                    defaultValue:
                      'Matched by code, so a monthly pack changes prices in place. Assemblies you have edited by hand are reported, not overwritten.',
                  })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={checkInstalled} disabled={busy}>
                    <RefreshCw className={`mr-1.5 h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden />
                    {t('sa_rates.check', { defaultValue: 'Compare with installed' })}
                  </Button>
                  <Button variant="primary" onClick={install} disabled={busy || !plan || !!nothingToDo}>
                    <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
                    {t('sa_rates.install', { defaultValue: 'Install / update' })}
                  </Button>
                  {progress && progress.step !== 'done' && (
                    <span className="text-sm text-content-secondary" aria-live="polite">
                      {t(`sa_rates.progress_${progress.step}`, { defaultValue: progress.step })} {progress.done}/
                      {progress.total}
                    </span>
                  )}
                </div>
                {plan && (
                  <ul className="mt-4 space-y-1 text-sm" data-testid="sa-rates-plan">
                    <li>
                      {t('sa_rates.plan_costs', {
                        defaultValue: 'Cost items: {{c}} new, {{u}} with a new price, {{s}} unchanged',
                        c: plan.costCreates.length,
                        u: plan.costUpdates.length,
                        s: plan.costUnchanged,
                      })}
                    </li>
                    <li>
                      {t('sa_rates.plan_asm', {
                        defaultValue: 'Assemblies: {{c}} new, {{u}} to re-price',
                        c: plan.assemblyCreates.length,
                        u: plan.assemblyUpdates.length,
                      })}
                    </li>
                    {nothingToDo && (
                      <li className="text-content-tertiary">
                        {t('sa_rates.up_to_date', { defaultValue: 'Already up to date.' })}
                      </li>
                    )}
                  </ul>
                )}
                {result && (
                  <div className="mt-4 space-y-2 text-sm" data-testid="sa-rates-result">
                    <p>
                      {t('sa_rates.result', {
                        defaultValue:
                          '{{cc}} cost items created, {{cu}} re-priced; {{ac}} assemblies created, {{ar}} re-priced ({{cp}} component prices changed).',
                        cc: result.costsCreated,
                        cu: result.costsUpdated,
                        ac: result.assembliesCreated,
                        ar: result.assembliesRepriced,
                        cp: result.componentsPatched,
                      })}
                    </p>
                    {result.skipped.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-amber-700 dark:text-amber-400">
                          {t('sa_rates.skipped', {
                            defaultValue: '{{n}} assemblies left alone: their recipe differs from the pack',
                            n: result.skipped.length,
                          })}
                        </summary>
                        <ul className="mt-1 list-disc pl-5">
                          {result.skipped.map((s) => (
                            <li key={s.code}>
                              {s.code}: {s.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {result.failed.length > 0 && (
                      <details open>
                        <summary className="cursor-pointer text-red-600 dark:text-red-400">
                          {t('sa_rates.failed', { defaultValue: '{{n}} failed', n: result.failed.length })}
                        </summary>
                        <ul className="mt-1 list-disc pl-5">
                          {result.failed.slice(0, 50).map((f) => (
                            <li key={f.code}>
                              {f.code}: {f.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </Card>

              {/* ── Rates ──────────────────────────────────────────────── */}
              <Card padding="md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-content-primary">
                    {t('sa_rates.rates', { defaultValue: 'Build-up rates' })}
                  </h2>
                  <div className="w-full max-w-xs">
                    <Input
                      icon={<Search className="h-4 w-4" aria-hidden />}
                      aria-label={t('sa_rates.search', { defaultValue: 'Search build-ups' })}
                      placeholder={t('sa_rates.search', { defaultValue: 'Search build-ups' })}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="sa-rates-table">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                        <th className="py-2 pr-3">{t('sa_rates.col_buildup', { defaultValue: 'Build-up' })}</th>
                        <th className="py-2 pr-3">{t('sa_rates.col_unit', { defaultValue: 'Unit' })}</th>
                        <th className="py-2 pr-3 text-right">{t('sa_rates.col_city', { defaultValue: 'City' })}</th>
                        <th className="py-2 pr-3 text-right">{t('sa_rates.col_small', { defaultValue: 'Small town' })}</th>
                        <th className="py-2 text-right">{t('sa_rates.col_rural', { defaultValue: 'Rural' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.slice(0, ROW_LIMIT).map((r) => (
                        <tr key={r.code} className="border-b border-border/60">
                          <td className="py-1.5 pr-3">{r.name}</td>
                          <td className="py-1.5 pr-3 text-content-tertiary">{r.unit}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{zar(r.city)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{zar(r.smallTown)}</td>
                          <td className="py-1.5 text-right tabular-nums">{zar(r.rural)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length > ROW_LIMIT && (
                    <p className="mt-2 text-xs text-content-tertiary">
                      {t('sa_rates.more_rows', {
                        defaultValue: 'Showing {{n}} of {{total}}. Narrow the search to see the rest.',
                        n: ROW_LIMIT,
                        total: shown.length,
                      })}
                    </p>
                  )}
                </div>
                <p className="mt-4 text-xs text-content-tertiary">
                  {pack.disclaimer}{' '}
                  <a className="underline" href={pack.publisher.url} target="_blank" rel="noreferrer">
                    {pack.publisher.name}
                  </a>
                </p>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
