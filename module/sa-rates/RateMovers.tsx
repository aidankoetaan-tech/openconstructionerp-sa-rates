// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileUp } from 'lucide-react';

import { Badge, Button, Card, Input } from '@/shared/ui';
import { triggerDownload } from '@/shared/lib/api';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';

import { readPackFile } from './api';
import { MOVER_KINDS, compareRatePacks, moversCsv, type Mover, type MoverKind } from './data/movers';
import { validateRatePack, type RatePack } from './data/ratepack';

function zar(v: number | null): string {
  if (v === null) return '–';
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const pct = (p: number | null): string => (p === null ? '–' : `${p > 0 ? '+' : ''}${(p * 100).toFixed(1)} %`);

const KIND_LABEL: Record<MoverKind, string> = {
  material: 'Materials',
  labour: 'Labour',
  plant: 'Plant',
  buildup: 'Build-ups',
};

const DRIVER_LABEL: Record<string, string> = {
  price: '(price)',
  quantity: '(quantity)',
  price_and_quantity: '(price and quantity)',
  added: '(added)',
  removed: '(removed)',
};

interface Slot {
  pack: RatePack | null;
  origin: string;
  problems: string[];
}

const EMPTY: Slot = { pack: null, origin: '', problems: [] };

export default function RateMovers({ loadedPack }: { loadedPack: RatePack | null }) {
  const { t } = useTranslation();
  const earlierRef = useRef<HTMLInputElement>(null);
  const laterRef = useRef<HTMLInputElement>(null);
  const [earlier, setEarlier] = useState<Slot>(EMPTY);
  const [laterOwn, setLaterOwn] = useState<Slot>(EMPTY);
  const [kind, setKind] = useState<MoverKind | 'all'>('all');
  const [threshold, setThreshold] = useState('0');
  const [showAll, setShowAll] = useState(false);

  const later: Slot = laterOwn.pack || laterOwn.problems.length
    ? laterOwn
    : loadedPack
      ? { pack: loadedPack, origin: t('sa_rates.mv.from_rates_tab', { defaultValue: 'pack loaded on the Rates tab' }), problems: [] }
      : EMPTY;

  async function load(file: File | undefined, set: (s: Slot) => void, ref: React.RefObject<HTMLInputElement | null>) {
    if (!file) return;
    try {
      const raw = await readPackFile(file);
      const errs = validateRatePack(raw);
      set(errs.length ? { pack: null, origin: file.name, problems: errs } : { pack: raw as RatePack, origin: file.name, problems: [] });
    } catch (e) {
      set({ pack: null, origin: file.name, problems: [e instanceof Error ? e.message : String(e)] });
    } finally {
      if (ref.current) ref.current.value = '';
    }
  }

  const comparison = useMemo(
    () => (earlier.pack && later.pack ? compareRatePacks(earlier.pack, later.pack) : null),
    [earlier.pack, later.pack],
  );

  const minPct = (Number(threshold) || 0) / 100;
  const shown: Mover[] = useMemo(() => {
    if (!comparison) return [];
    return comparison.movers.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false;
      if (m.status === 'unchanged') return false;
      if (m.status === 'moved') return Math.abs(m.pct ?? 0) >= minPct;
      return true;
    });
  }, [comparison, kind, minPct]);
  const LIMIT = 50;
  const visible = showAll ? shown : shown.slice(0, LIMIT);

  const slot = (
    title: string,
    s: Slot,
    ref: React.RefObject<HTMLInputElement | null>,
    onFile: (f: File | undefined) => void,
    testid: string,
  ) => (
    <div className="rounded-md border border-border p-3">
      <div className="text-sm font-medium text-content-secondary">{title}</div>
      <div className="mt-1 text-sm text-content-primary" data-testid={testid}>
        {s.pack
          ? `${s.pack.library_version}, priced ${s.pack.priced_on.split('-').reverse().join('/')} (${s.origin})`
          : t('sa_rates.mv.none', { defaultValue: 'No pack yet' })}
      </div>
      {s.problems.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
          {s.problems.slice(0, 5).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button variant="secondary" className="mt-2" onClick={() => ref.current?.click()}>
        <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
        {t('sa_rates.mv.upload', { defaultValue: 'Upload pack (.json)' })}
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={title}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </div>
  );

  return (
    <div className="space-y-6" data-testid="sa-rates-movers">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.mv.packs', { defaultValue: '1. Packs to compare' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.mv.help', {
            defaultValue:
              'Items are matched by code. Rates are City basis, excl VAT. The later pack defaults to the one loaded on the Rates tab.',
          })}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {slot(t('sa_rates.mv.earlier', { defaultValue: 'Earlier pack' }), earlier, earlierRef, (f) => load(f, setEarlier, earlierRef), 'sa-rates-movers-earlier')}
          {slot(t('sa_rates.mv.later', { defaultValue: 'Later pack' }), later, laterRef, (f) => load(f, setLaterOwn, laterRef), 'sa-rates-movers-later')}
        </div>
      </Card>

      {comparison && (
        <Card padding="md" data-testid="sa-rates-movers-result">
          <h2 className="text-base font-semibold text-content-primary">
            {t('sa_rates.mv.result', {
              defaultValue: '2. Movement from {{a}} to {{b}}',
              a: comparison.earlier.version,
              b: comparison.later.version,
            })}
          </h2>
          {comparison.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-700 dark:text-amber-400" role="note">
              {comparison.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MOVER_KINDS.map((k) => {
              const s = comparison.summary[k];
              return (
                <div key={k} className="rounded-md border border-border p-3" data-testid={`sa-rates-movers-summary-${k}`}>
                  <div className="text-xs uppercase text-content-tertiary">{KIND_LABEL[k]}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-content-primary">
                    {s.meanPct === null ? '–' : pct(s.meanPct)}
                  </div>
                  <div className="text-xs text-content-tertiary">
                    {t('sa_rates.mv.kind_line', {
                      defaultValue: 'average of {{n}}: {{up}} up, {{down}} down, {{same}} unchanged',
                      up: s.up,
                      down: s.down,
                      same: s.unchanged,
                      n: s.compared,
                    })}
                    {s.medianMovedPct !== null &&
                      t('sa_rates.mv.kind_moved', { defaultValue: '; movers median {{p}}', p: pct(s.medianMovedPct) })}
                    {s.added + s.removed > 0 &&
                      t('sa_rates.mv.kind_added', { defaultValue: '; {{a}} new, {{r}} dropped', a: s.added, r: s.removed })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-content-secondary">
                {t('sa_rates.mv.kind', { defaultValue: 'Show' })}
              </span>
              <select
                className="rounded-md border border-border bg-surface-primary px-2 py-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as MoverKind | 'all')}
              >
                <option value="all">{t('sa_rates.mv.all', { defaultValue: 'Everything' })}</option>
                {MOVER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <div className="w-48">
              <Input
                label={t('sa_rates.mv.threshold', { defaultValue: 'Moved by at least %' })}
                type="number"
                min="0"
                step="0.5"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            <span className="pb-2 text-sm text-content-secondary" data-testid="sa-rates-movers-count">
              {t('sa_rates.mv.count', { defaultValue: '{{n}} items listed', n: shown.length })}
            </span>
            <Button
              variant="secondary"
              className="ml-auto"
              onClick={() =>
                triggerDownload(
                  new Blob([moversCsv(comparison)], { type: 'text/csv' }),
                  `rate_movers_${comparison.earlier.version}_to_${comparison.later.version}.csv`.replace(/[^\w.-]+/g, '_'),
                )
              }
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              {t('sa_rates.mv.export', { defaultValue: 'Download CSV' })}
            </Button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                  <th className="py-2 pr-2">{t('sa_rates.mv.col_item', { defaultValue: 'Item' })}</th>
                  <th className="py-2 pr-2">{t('sa_rates.mv.col_unit', { defaultValue: 'Unit' })}</th>
                  <th className="py-2 pr-2 text-right">{comparison.earlier.version}</th>
                  <th className="py-2 pr-2 text-right">{comparison.later.version}</th>
                  <th className="py-2 pr-2 text-right">{t('sa_rates.mv.col_change', { defaultValue: 'Change' })}</th>
                  <th className="py-2 pr-2 text-right">%</th>
                  <th className="py-2">{t('sa_rates.mv.col_driver', { defaultValue: 'Driver (build-ups)' })}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.code} className="border-b border-border/60 align-top">
                    <td className="py-1.5 pr-2">
                      <div className="text-content-primary">{m.name}</div>
                      <div className="font-mono text-xs text-content-tertiary">{m.code}</div>
                    </td>
                    <td className="py-1.5 pr-2">{m.fromUnit ? `${m.fromUnit} → ${m.unit}` : m.unit}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{zar(m.from)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{zar(m.to)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{m.change === null ? '–' : zar(m.change)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {m.status === 'moved' ? (
                        <span className={m.pct! > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
                          {pct(m.pct)}
                        </span>
                      ) : (
                        <Badge variant={m.status === 'new' ? 'success' : m.status === 'removed' ? 'error' : 'warning'}>
                          {m.status === 'new'
                            ? t('sa_rates.mv.new', { defaultValue: 'New' })
                            : m.status === 'removed'
                              ? t('sa_rates.mv.removed', { defaultValue: 'Dropped' })
                              : t('sa_rates.mv.unit_changed', { defaultValue: 'Unit changed' })}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 text-xs text-content-tertiary">
                      {m.driver &&
                        (m.driver.resource
                          ? `${m.driver.description}: ${zar(m.driver.contribution)} ${t(`sa_rates.mv.drv_${m.driver.change}`, { defaultValue: DRIVER_LABEL[m.driver.change] })}`
                          : `${t('sa_rates.mv.profit', { defaultValue: 'Profit setting' })}: ${zar(m.driver.contribution)}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > LIMIT && !showAll && (
            <Button variant="secondary" className="mt-3" onClick={() => setShowAll(true)}>
              {t('sa_rates.mv.show_all', { defaultValue: 'Show all {{n}}', n: shown.length })}
            </Button>
          )}
          <p className="mt-3 text-xs text-content-tertiary">
            {t('sa_rates.mv.basis', {
              defaultValue:
                'Driver: the component whose quantity × unit cost moved the build-up direct cost most, excl profit. Rates are estimating benchmarks from published supplier prices.',
            })}
          </p>
        </Card>
      )}
    </div>
  );
}
