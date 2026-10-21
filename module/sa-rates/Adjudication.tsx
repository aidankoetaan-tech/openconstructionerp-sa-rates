// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2 } from 'lucide-react';

import { Badge, Button, Card, Input } from '@/shared/ui';
import { triggerDownload } from '@/shared/lib/api';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';

import {
  CIDB_CLASSES,
  MANDATORY_CHECKS,
  adjudicate,
  adjudicationCsv,
  requiredGrade,
  type Bidder,
  type Check,
  type MandatoryKey,
  type TenderInput,
} from './data/adjudication';

const STORE_KEY = 'sa_rates.adjudication_draft';

interface Row {
  id: number;
  name: string;
  price: string;
  grade: string;
  cls: string;
  checks: Record<MandatoryKey, Check>;
  goals: string;
  vat: boolean;
}

interface Draft {
  title: string;
  estimate: string;
  cls: string;
  minGrade: string;
  threshold: string;
  rows: Row[];
}

const PENDING: Record<MandatoryKey, Check> = { csd: 'pending', tax: 'pending', cidbActive: 'pending', returnables: 'pending' };

const newRow = (id: number, cls: string): Row => ({
  id,
  name: '',
  price: '',
  grade: '',
  cls,
  checks: { ...PENDING },
  goals: '',
  vat: true,
});

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Draft;
  } catch {
    /* no stored draft */
  }
  return { title: '', estimate: '', cls: 'GB', minGrade: '', threshold: '15', rows: [newRow(1, 'GB')] };
}

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const SHORT: Record<MandatoryKey, string> = { csd: 'CSD', tax: 'Tax', cidbActive: 'CIDB active', returnables: 'Returnables' };

export default function Adjudication() {
  const { t } = useTranslation();
  const initial = useRef(loadDraft()).current;
  const nextId = useRef(initial.rows.reduce((m, r) => Math.max(m, r.id), 0) + 1);
  const [d, setD] = useState<Draft>(initial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(d));
    } catch {
      /* storage blocked: the draft lives for this page view only */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setRow = (id: number, patch: Partial<Row>) =>
    setD((x) => ({ ...x, rows: x.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  const estimate = num(d.estimate);
  const tender: TenderInput = {
    estimatedValue: Number.isFinite(estimate) ? estimate : 0,
    classOfWork: d.cls,
    minimumGrade: d.minGrade ? Number(d.minGrade) : undefined,
    priceFlagThreshold: (Number.isFinite(num(d.threshold)) ? num(d.threshold) : 15) / 100,
  };
  const bidders: Bidder[] = d.rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      price: Number.isFinite(num(r.price)) ? num(r.price) : 0,
      cidbGrade: r.grade ? Number(r.grade) : null,
      cidbClass: r.cls,
      checks: r.checks,
      specificGoalPoints: Number.isFinite(num(r.goals)) ? num(r.goals) : 0,
      vatRegistered: r.vat,
    }));
  const result = useMemo(
    () => (tender.estimatedValue > 0 && bidders.length ? adjudicate(tender, bidders) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tender), JSON.stringify(bidders)],
  );

  const select = 'w-full rounded-md border border-border bg-surface-primary px-1.5 py-1.5 text-sm';
  const autoGrade = tender.estimatedValue > 0 ? requiredGrade(tender.estimatedValue) : null;

  return (
    <div className="space-y-6" data-testid="sa-rates-adjudication">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.adj.tender', { defaultValue: '1. Tender' })}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label={t('sa_rates.adj.title', { defaultValue: 'Tender number and title' })}
            value={d.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <Input
            label={t('sa_rates.adj.estimate', { defaultValue: 'Estimated Rand value incl VAT' })}
            hint={t('sa_rates.adj.estimate_hint', { defaultValue: 'At invitation; sets 80/20 or 90/10' })}
            type="number"
            className="text-right tabular-nums"
            value={d.estimate}
            onChange={(e) => set('estimate', e.target.value)}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">
              {t('sa_rates.adj.class', { defaultValue: 'CIDB class of work' })}
            </span>
            <select className={select} value={d.cls} onChange={(e) => set('cls', e.target.value)}>
              {CIDB_CLASSES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label={t('sa_rates.adj.min_grade', { defaultValue: 'Minimum grade (tender data)' })}
            hint={
              autoGrade
                ? t('sa_rates.adj.min_grade_hint', { defaultValue: 'Blank uses {{g}}, from the value', g: `${autoGrade}${d.cls}` })
                : undefined
            }
            type="number"
            min="1"
            max="9"
            value={d.minGrade}
            onChange={(e) => set('minGrade', e.target.value)}
          />
          <Input
            label={t('sa_rates.adj.threshold', { defaultValue: 'Flag prices beyond ± % of estimate' })}
            type="number"
            value={d.threshold}
            onChange={(e) => set('threshold', e.target.value)}
          />
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.adj.tenderers', { defaultValue: '2. Tenderers and compliance' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.adj.tenderers_help', {
            defaultValue:
              'Price including VAT, less unconditional discounts. Specific goal points as verified against the evidence the tender asks for. A check left pending keeps a tender out of the scoring.',
          })}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                <th className="py-2 pr-2">{t('sa_rates.adj.col_name', { defaultValue: 'Tenderer' })}</th>
                <th className="py-2 pr-2 text-right">{t('sa_rates.adj.col_price', { defaultValue: 'Price' })}</th>
                <th className="py-2 pr-2">{t('sa_rates.adj.col_grade', { defaultValue: 'Grade' })}</th>
                <th className="py-2 pr-2">{t('sa_rates.adj.col_class', { defaultValue: 'Class' })}</th>
                {MANDATORY_CHECKS.map((c) => (
                  <th key={c.key} className="py-2 pr-2" title={c.label}>
                    {SHORT[c.key]}
                  </th>
                ))}
                <th className="py-2 pr-2">{t('sa_rates.adj.col_goals', { defaultValue: 'Goal pts' })}</th>
                <th className="py-2 pr-2">VAT</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">
                    <Input
                      aria-label={t('sa_rates.adj.col_name', { defaultValue: 'Tenderer' })}
                      value={r.name}
                      onChange={(e) => setRow(r.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="w-40 py-1.5 pr-2">
                    <Input
                      aria-label={t('sa_rates.adj.col_price', { defaultValue: 'Price' })}
                      type="number"
                      className="text-right tabular-nums"
                      value={r.price}
                      onChange={(e) => setRow(r.id, { price: e.target.value })}
                    />
                  </td>
                  <td className="w-16 py-1.5 pr-2">
                    <Input
                      aria-label={t('sa_rates.adj.col_grade', { defaultValue: 'Grade' })}
                      type="number"
                      min="1"
                      max="9"
                      value={r.grade}
                      onChange={(e) => setRow(r.id, { grade: e.target.value })}
                    />
                  </td>
                  <td className="w-20 py-1.5 pr-2">
                    <select
                      className={select}
                      aria-label={t('sa_rates.adj.col_class', { defaultValue: 'Class' })}
                      value={r.cls}
                      onChange={(e) => setRow(r.id, { cls: e.target.value })}
                    >
                      {CIDB_CLASSES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  {MANDATORY_CHECKS.map((c) => (
                    <td key={c.key} className="w-24 py-1.5 pr-2">
                      <select
                        className={select}
                        aria-label={c.label}
                        value={r.checks[c.key]}
                        onChange={(e) => setRow(r.id, { checks: { ...r.checks, [c.key]: e.target.value as Check } })}
                      >
                        <option value="pending">…</option>
                        <option value="yes">{t('sa_rates.adj.yes', { defaultValue: 'Yes' })}</option>
                        <option value="no">{t('sa_rates.adj.no', { defaultValue: 'No' })}</option>
                      </select>
                    </td>
                  ))}
                  <td className="w-20 py-1.5 pr-2">
                    <Input
                      aria-label={t('sa_rates.adj.col_goals', { defaultValue: 'Goal pts' })}
                      type="number"
                      value={r.goals}
                      onChange={(e) => setRow(r.id, { goals: e.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={t('sa_rates.adj.vat', { defaultValue: 'VAT registered' })}
                      checked={r.vat}
                      onChange={(e) => setRow(r.id, { vat: e.target.checked })}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      className="text-content-tertiary hover:text-red-600"
                      aria-label={t('sa_rates.adj.remove', { defaultValue: 'Remove tenderer' })}
                      onClick={() => setD((x) => ({ ...x, rows: x.rows.length > 1 ? x.rows.filter((y) => y.id !== r.id) : x.rows }))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const id = nextId.current;
            nextId.current += 1;
            setD((x) => ({ ...x, rows: [...x.rows, newRow(id, x.cls)] }));
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {t('sa_rates.adj.add', { defaultValue: 'Add tenderer' })}
        </Button>
      </Card>

      {result && (
        <Card padding="md" data-testid="sa-rates-adjudication-result">
          <h2 className="text-base font-semibold text-content-primary">
            {t('sa_rates.adj.evaluation', { defaultValue: '3. Evaluation' })}
          </h2>
          {result.errors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mt-1 text-sm text-content-secondary">
                {t('sa_rates.adj.summary', {
                  defaultValue:
                    '{{system}} preference point system. CIDB requirement {{grade}}. Lowest acceptable price {{pmin}}.',
                  system: result.system,
                  grade: `${result.requiredGrade}${d.cls}`,
                  pmin: result.lowestAcceptable === null ? '–' : zar(result.lowestAcceptable),
                })}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">{t('sa_rates.adj.col_name', { defaultValue: 'Tenderer' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.adj.col_price', { defaultValue: 'Price' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.adj.col_vs', { defaultValue: 'vs estimate' })}</th>
                      <th className="py-2 pr-2">{t('sa_rates.adj.col_resp', { defaultValue: 'Responsive' })}</th>
                      <th className="py-2 pr-2 text-right">Ps</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.adj.col_goals', { defaultValue: 'Goal pts' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.adj.col_total', { defaultValue: 'Total' })}</th>
                      <th className="py-2">{t('sa_rates.adj.col_notes', { defaultValue: 'Reasons and flags' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.results]
                      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
                      .map((r) => (
                        <tr key={r.bidder.name} className="border-b border-border/60 align-top">
                          <td className="py-1.5 pr-2 font-semibold">{r.rank ?? '–'}</td>
                          <td className="py-1.5 pr-2">{r.bidder.name}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{zar(r.bidder.price)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">
                            {(r.deviationFromEstimate * 100).toFixed(1)} %
                          </td>
                          <td className="py-1.5 pr-2">
                            <Badge variant={r.responsive ? 'success' : 'error'}>
                              {r.responsive ? t('sa_rates.adj.yes', { defaultValue: 'Yes' }) : t('sa_rates.adj.no', { defaultValue: 'No' })}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{r.pricePoints?.toFixed(2) ?? '–'}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{r.goalPoints?.toFixed(2) ?? '–'}</td>
                          <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{r.totalPoints?.toFixed(2) ?? '–'}</td>
                          <td className="py-1.5 text-xs text-content-tertiary">{[...r.reasons, ...r.flags].join(' ')}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm font-medium" data-testid="sa-rates-adjudication-outcome">
                {result.highest
                  ? t('sa_rates.adj.highest', {
                      defaultValue: 'Highest points among responsive tenders: {{name}} ({{pts}}).',
                      name: result.highest.bidder.name,
                      pts: result.highest.totalPoints?.toFixed(2),
                    })
                  : result.drawLotsBetween.length
                    ? t('sa_rates.adj.lots', {
                        defaultValue: 'Equal in all respects: {{names}}. Regulation 8 decides this by drawing lots.',
                        names: result.drawLotsBetween.join(', '),
                      })
                    : t('sa_rates.adj.none', { defaultValue: 'No responsive tender yet.' })}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-content-tertiary">
                  {t('sa_rates.adj.basis', {
                    defaultValue:
                      'Preferential Procurement Regulations, 2022 (regs 4, 5 and 8); CIDB tender value limits from 7 October 2019. Responsiveness and award are for the bid committee.',
                  })}
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    triggerDownload(
                      new Blob([adjudicationCsv(result, tender, d.title || 'Tender evaluation')], { type: 'text/csv' }),
                      `tender_evaluation_${(d.title || 'draft').replace(/[^\w-]+/g, '_')}.csv`,
                    )
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('sa_rates.adj.export', { defaultValue: 'Download CSV' })}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
