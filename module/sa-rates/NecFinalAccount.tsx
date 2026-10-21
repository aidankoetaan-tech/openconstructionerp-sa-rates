// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2 } from 'lucide-react';

import { Button, Card, Input } from '@/shared/ui';
import { triggerDownload } from '@/shared/lib/api';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';

import {
  DISPUTE_ROUTE,
  MAIN_OPTIONS,
  isCostBased,
  isTarget,
  necFinalAccount,
  necFinalCsv,
  type DisputeOption,
  type MainOption,
  type NecFinalInput,
} from './data/necFinal';

const STORE_KEY = 'sa_rates.nec_final_draft';

interface Row {
  id: number;
  label: string;
  amount: string;
}
interface RangeRow {
  id: number;
  from: string;
  to: string;
  share: string;
}

interface Draft {
  title: string;
  option: MainOption;
  dispute: DisputeOption;
  pricedPwdd: string;
  costOfComponents: string;
  feePct: string;
  totalOfPrices: string;
  priceAdjustment: string;
  disallowed: Row[];
  ranges: RangeRow[];
  bonusPerDay: string;
  delayPerDay: string;
  delayReduction: string;
  completionDate: string;
  completion: string;
  takeOver: string;
  termination: string;
  defectsCertificate: string;
  assessmentDate: string;
  paymentWeeks: string;
  advanced: string;
  lowPerformance: string;
  uncorrected: string;
  toContractor: Row[];
  byContractor: Row[];
  previous: string;
  vatPct: string;
}

const EMPTY: Draft = {
  title: '',
  option: 'C',
  dispute: 'W2',
  pricedPwdd: '',
  costOfComponents: '',
  feePct: '',
  totalOfPrices: '',
  priceAdjustment: '',
  disallowed: [],
  ranges: [
    { id: 1, from: '0', to: '90', share: '' },
    { id: 2, from: '90', to: '110', share: '' },
    { id: 3, from: '110', to: '', share: '' },
  ],
  bonusPerDay: '',
  delayPerDay: '',
  delayReduction: '',
  completionDate: '',
  completion: '',
  takeOver: '',
  termination: '',
  defectsCertificate: '',
  assessmentDate: '',
  paymentWeeks: '3',
  advanced: '',
  lowPerformance: '',
  uncorrected: '',
  toContractor: [],
  byContractor: [],
  previous: '',
  vatPct: '15',
};

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    /* no stored draft */
  }
  return EMPTY;
}

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s) || 0);

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function ddmmyyyy(iso?: string): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function NecFinalAccount() {
  const { t } = useTranslation();
  const initial = useRef(loadDraft()).current;
  const nextId = useRef(
    Math.max(0, ...initial.disallowed.map((r) => r.id), ...initial.ranges.map((r) => r.id), ...initial.toContractor.map((r) => r.id), ...initial.byContractor.map((r) => r.id)) + 1,
  );
  const [d, setD] = useState<Draft>(initial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(d));
    } catch {
      /* storage blocked: the draft lives for this page view only */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const newId = () => {
    const id = nextId.current;
    nextId.current += 1;
    return id;
  };

  const input: NecFinalInput = useMemo(
    () => ({
      option: d.option,
      dispute: d.dispute,
      pricedPwdd: num(d.pricedPwdd),
      costOfComponents: num(d.costOfComponents),
      disallowed: d.disallowed.map((r) => ({ label: r.label, amount: num(r.amount) })),
      feePercentage: num(d.feePct) / 100,
      totalOfPrices: num(d.totalOfPrices),
      shareRanges: d.ranges.map((r) => ({ from: num(r.from), to: r.to.trim() === '' ? null : num(r.to), share: num(r.share) / 100 })),
      priceAdjustment: num(d.priceAdjustment),
      bonusPerDay: num(d.bonusPerDay),
      delayDamagesPerDay: num(d.delayPerDay),
      delayDamagesReduction: num(d.delayReduction),
      completionDate: d.completionDate || undefined,
      completion: d.completion || undefined,
      takeOver: d.takeOver || undefined,
      terminationCertificate: d.termination || undefined,
      advancedPaymentOutstanding: num(d.advanced),
      lowPerformanceDamages: num(d.lowPerformance),
      uncorrectedDefects: num(d.uncorrected),
      otherToContractor: d.toContractor.map((r) => ({ label: r.label, amount: num(r.amount) })),
      otherByContractor: d.byContractor.map((r) => ({ label: r.label, amount: num(r.amount) })),
      previousAmountDue: num(d.previous),
      vatRate: num(d.vatPct) / 100,
      defectsCertificate: d.defectsCertificate || undefined,
      paymentWeeks: num(d.paymentWeeks) || 3,
      assessmentDate: d.assessmentDate || undefined,
    }),
    [d],
  );
  const started = d.option === 'A' || d.option === 'B' ? num(d.pricedPwdd) > 0 : num(d.costOfComponents) > 0;
  const r = useMemo(() => (started ? necFinalAccount(input) : null), [started, input]);

  const cost = isCostBased(d.option);
  const target = isTarget(d.option);
  const select = 'w-full rounded-md border border-border bg-surface-primary px-2 py-2 text-sm';

  const money = (k: keyof Draft, label: string, hint?: string) => (
    <Input
      label={label}
      hint={hint}
      type="number"
      step="0.01"
      className="text-right tabular-nums"
      value={d[k] as string}
      onChange={(e) => set(k, e.target.value as never)}
    />
  );
  const date = (k: keyof Draft, label: string) => (
    <Input label={label} type="date" value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} />
  );

  const rows = (k: 'disallowed' | 'toContractor' | 'byContractor', addLabel: string, placeholder: string) => (
    <div className="mt-3">
      {d[k].map((row) => (
        <div key={row.id} className="mb-2 flex items-center gap-2">
          <Input
            aria-label={`${addLabel}: description`}
            className="flex-1"
            placeholder={placeholder}
            value={row.label}
            onChange={(e) => set(k, d[k].map((x) => (x.id === row.id ? { ...x, label: e.target.value } : x)))}
          />
          <div className="w-44">
            <Input
              aria-label={`${addLabel}: amount`}
              type="number"
              step="0.01"
              className="text-right tabular-nums"
              value={row.amount}
              onChange={(e) => set(k, d[k].map((x) => (x.id === row.id ? { ...x, amount: e.target.value } : x)))}
            />
          </div>
          <button
            type="button"
            className="text-content-tertiary hover:text-red-600"
            aria-label={t('sa_rates.nf.remove', { defaultValue: 'Remove' })}
            onClick={() => set(k, d[k].filter((x) => x.id !== row.id))}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => set(k, [...d[k], { id: newId(), label: '', amount: '' }])}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        {addLabel}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="sa-rates-nec-final">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.nf.contract', { defaultValue: '1. Contract and dates' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.nf.help', {
            defaultValue:
              'NEC4 Engineering and Construction Contract (June 2017), final assessment under cl 53. Amounts excl tax. Check the Contract Data and any Z clauses before relying on the result.',
          })}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label={t('sa_rates.nf.title', { defaultValue: 'Contract title' })} value={d.title} onChange={(e) => set('title', e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">{t('sa_rates.nf.option', { defaultValue: 'Main Option' })}</span>
            <select className={select} value={d.option} onChange={(e) => set('option', e.target.value as MainOption)}>
              {MAIN_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code}: {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">{t('sa_rates.nf.dispute', { defaultValue: 'Dispute resolution Option' })}</span>
            <select className={select} value={d.dispute} onChange={(e) => set('dispute', e.target.value as DisputeOption)}>
              <option value="W1">W1</option>
              <option value="W2">W2</option>
              <option value="W3">W3</option>
            </select>
          </label>
          <Input
            label={t('sa_rates.nf.pay_weeks', { defaultValue: 'Payment period (weeks)' })}
            hint={t('sa_rates.nf.pay_weeks_hint', { defaultValue: 'Three unless the Contract Data says otherwise' })}
            type="number"
            value={d.paymentWeeks}
            onChange={(e) => set('paymentWeeks', e.target.value)}
          />
          {date('completionDate', t('sa_rates.nf.cd', { defaultValue: 'Completion Date' }))}
          {date('completion', t('sa_rates.nf.completion', { defaultValue: 'Completion (certified)' }))}
          {date('takeOver', t('sa_rates.nf.takeover', { defaultValue: 'Take-over of the works' }))}
          {date('defectsCertificate', t('sa_rates.nf.dc', { defaultValue: 'Defects Certificate issued' }))}
          {date('termination', t('sa_rates.nf.term', { defaultValue: 'Termination certificate (if any)' }))}
          {date('assessmentDate', t('sa_rates.nf.assessed', { defaultValue: 'Final assessment issued' }))}
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.nf.pwdd', { defaultValue: '2. Price for Work Done to Date' })}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!cost &&
            money(
              'pricedPwdd',
              t('sa_rates.nf.priced_pwdd', { defaultValue: 'Final Price for Work Done to Date' }),
              d.option === 'A'
                ? t('sa_rates.nf.pwdd_a', { defaultValue: 'Total of the Prices for completed activities' })
                : t('sa_rates.nf.pwdd_b', { defaultValue: 'Completed quantities × rates, plus lump sums' }),
            )}
          {cost && money('costOfComponents', t('sa_rates.nf.coc', { defaultValue: 'Cost of components (final)' }), t('sa_rates.nf.coc_hint', { defaultValue: 'Schedule of Cost Components, before Disallowed Cost' }))}
          {cost && (
            <Input
              label={t('sa_rates.nf.fee', { defaultValue: 'Fee percentage' })}
              type="number"
              step="0.01"
              value={d.feePct}
              onChange={(e) => set('feePct', e.target.value)}
            />
          )}
          {target &&
            money(
              'totalOfPrices',
              d.option === 'C'
                ? t('sa_rates.nf.top_c', { defaultValue: 'Final total of the Prices' })
                : t('sa_rates.nf.top_d', { defaultValue: 'Final Total of the Prices' }),
              d.option === 'C'
                ? t('sa_rates.nf.top_c_hint', { defaultValue: 'Activity Schedule incl implemented compensation events' })
                : t('sa_rates.nf.top_d_hint', { defaultValue: 'BoQ value of work completed (11.2(35))' }),
            )}
          {d.option !== 'E' &&
            money(
              'priceAdjustment',
              t('sa_rates.nf.x1', { defaultValue: 'X1 price adjustment' }),
              target
                ? t('sa_rates.nf.x1_target', { defaultValue: 'Added to the total of the Prices (X1.4)' })
                : t('sa_rates.nf.x1_priced', { defaultValue: 'Amount included in the amount due (X1.3)' }),
            )}
        </div>
        {cost && rows('disallowed', t('sa_rates.nf.add_disallowed', { defaultValue: 'Add Disallowed Cost' }), t('sa_rates.nf.disallowed_ph', { defaultValue: 'e.g. Plant not used to Provide the Works' }))}

        {target && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-content-primary">
              {t('sa_rates.nf.ranges', { defaultValue: "Share ranges and Contractor's share (Contract Data)" })}
            </h3>
            <table className="mt-2 w-full max-w-xl text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                  <th className="py-2 pr-2">{t('sa_rates.nf.from', { defaultValue: 'From %' })}</th>
                  <th className="py-2 pr-2">{t('sa_rates.nf.to', { defaultValue: 'To % (blank: no limit)' })}</th>
                  <th className="py-2 pr-2">{t('sa_rates.nf.share', { defaultValue: "Contractor's share %" })}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {d.ranges.map((rg) => (
                  <tr key={rg.id}>
                    {(['from', 'to', 'share'] as const).map((f) => (
                      <td key={f} className="py-1 pr-2">
                        <Input
                          aria-label={`share range ${f}`}
                          type="number"
                          value={rg[f]}
                          onChange={(e) => set('ranges', d.ranges.map((x) => (x.id === rg.id ? { ...x, [f]: e.target.value } : x)))}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="text-content-tertiary hover:text-red-600"
                        aria-label={t('sa_rates.nf.remove', { defaultValue: 'Remove' })}
                        onClick={() => set('ranges', d.ranges.filter((x) => x.id !== rg.id))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="secondary" className="mt-2" onClick={() => set('ranges', [...d.ranges, { id: newId(), from: '', to: '', share: '' }])}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {t('sa_rates.nf.add_range', { defaultValue: 'Add share range' })}
            </Button>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.nf.other', { defaultValue: '3. Other amounts and the previous assessment' })}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money('bonusPerDay', t('sa_rates.nf.x6', { defaultValue: 'X6 bonus per day' }))}
          {money('delayPerDay', t('sa_rates.nf.x7', { defaultValue: 'X7 delay damages per day' }))}
          {money('delayReduction', t('sa_rates.nf.x73', { defaultValue: 'X7.3 reduction for part take-over' }))}
          {money('advanced', t('sa_rates.nf.x14', { defaultValue: 'X14 advanced payment not repaid' }))}
          {money('lowPerformance', t('sa_rates.nf.x17', { defaultValue: 'X17 low performance damages' }))}
          {money('uncorrected', t('sa_rates.nf.cl46', { defaultValue: 'Uncorrected Defects (cl 46)' }))}
          {money('previous', t('sa_rates.nf.previous', { defaultValue: 'Amount due at the previous assessment' }), t('sa_rates.nf.previous_hint', { defaultValue: 'Cumulative, excl tax' }))}
          <Input label={t('sa_rates.nf.vat', { defaultValue: 'VAT rate %' })} type="number" step="0.01" value={d.vatPct} onChange={(e) => set('vatPct', e.target.value)} />
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-content-primary">{t('sa_rates.nf.to_contractor', { defaultValue: 'Other amounts to the Contractor' })}</h3>
            {rows('toContractor', t('sa_rates.nf.add_to', { defaultValue: 'Add amount to the Contractor' }), t('sa_rates.nf.to_ph', { defaultValue: 'e.g. interest on late payment (51.2)' }))}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content-primary">{t('sa_rates.nf.by_contractor', { defaultValue: 'Other amounts paid by the Contractor' })}</h3>
            {rows('byContractor', t('sa_rates.nf.add_by', { defaultValue: 'Add amount from the Contractor' }), t('sa_rates.nf.by_ph', { defaultValue: 'e.g. Client’s cost under another clause' }))}
          </div>
        </div>
      </Card>

      {r && (
        <Card padding="md" data-testid="sa-rates-nec-final-result">
          <h2 className="text-base font-semibold text-content-primary">
            {d.title || t('sa_rates.nf.result', { defaultValue: 'Final assessment' })}: {`NEC4 ECC Option ${d.option}`}
          </h2>
          {r.errors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
              {r.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {r.lines.map((l, i) => (
                    <tr key={`${l.ref}-${i}`} className={`border-b border-border/60 ${l.info ? 'text-content-tertiary' : ''}`}>
                      <td className="w-16 py-1.5 pr-3">{l.ref}</td>
                      <td className="py-1.5 pr-3">{l.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{zar(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border font-semibold">
                    <td className="py-2 pr-3">53.1</td>
                    <td className="py-2 pr-3">{t('sa_rates.nf.final_due', { defaultValue: 'Final amount due' })}</td>
                    <td className="py-2 text-right tabular-nums" data-testid="sa-rates-nec-final-due">{zar(r.finalAmountDue)}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-1.5 pr-3">51.1</td>
                    <td className="py-1.5 pr-3">{t('sa_rates.nf.less_prev', { defaultValue: 'Less amount due at the previous assessment' })}</td>
                    <td className="py-1.5 text-right tabular-nums">{zar(-input.previousAmountDue)}</td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-1.5 pr-3">51.5</td>
                    <td className="py-1.5 pr-3">{t('sa_rates.nf.tax', { defaultValue: 'Tax' })}</td>
                    <td className="py-1.5 text-right tabular-nums">{zar(r.tax)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3">
                      {r.paymentInclTax >= 0
                        ? t('sa_rates.nf.client_pays', { defaultValue: 'Final payment by the Client, incl tax' })
                        : t('sa_rates.nf.contractor_pays', { defaultValue: 'Final payment by the Contractor, incl tax' })}
                    </td>
                    <td className="py-2 text-right tabular-nums" data-testid="sa-rates-nec-final-payment">{zar(Math.abs(r.paymentInclTax))}</td>
                  </tr>
                </tbody>
              </table>

              {r.share && r.share.increments.length > 0 && (
                <table className="mt-4 w-full max-w-2xl text-sm" data-testid="sa-rates-nec-final-share">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                      <th className="py-2 pr-2">{t('sa_rates.nf.range', { defaultValue: 'Range of PWDD ÷ Prices' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.nf.increment', { defaultValue: 'Increment' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.nf.share_pct', { defaultValue: 'Share' })}</th>
                      <th className="py-2 text-right">{t('sa_rates.nf.amount', { defaultValue: 'Amount' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.share.increments.map((s) => (
                      <tr key={s.from} className="border-b border-border/60">
                        <td className="py-1.5 pr-2 tabular-nums">
                          {s.from.toFixed(2)} % to {s.to.toFixed(2)} %
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{zar(s.increment)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{(s.share * 100).toFixed(1)} %</td>
                        <td className="py-1.5 text-right tabular-nums">{zar(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="mt-4 text-sm text-content-secondary" data-testid="sa-rates-nec-final-dates">
                {r.dates.assessmentDue && (
                  <p>
                    {t('sa_rates.nf.due_by', {
                      defaultValue: 'Project Manager assesses by {{d}} (cl 53.1, {{w}}).',
                      d: ddmmyyyy(r.dates.assessmentDue),
                      w: r.dates.dueFrom === 'termination' ? '13 weeks after the termination certificate' : '4 weeks after the Defects Certificate',
                    })}
                  </p>
                )}
                {r.dates.paymentDue && (
                  <p>
                    {t('sa_rates.nf.pay_by', { defaultValue: 'Final payment by {{d}}.', d: ddmmyyyy(r.dates.paymentDue) })}{' '}
                    {t('sa_rates.nf.conclusive', {
                      defaultValue: 'Conclusive unless a Party acts by {{d}}: {{route}}.',
                      d: ddmmyyyy(r.dates.conclusiveUnlessReferredBy),
                      route: DISPUTE_ROUTE[d.dispute],
                    })}
                  </p>
                )}
                {r.notes.map((n) => (
                  <p key={n} className="text-content-tertiary">
                    {n}
                  </p>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() =>
                    triggerDownload(
                      new Blob([necFinalCsv(r, input, d.title || 'Final assessment')], { type: 'text/csv' }),
                      `nec4_final_assessment_${(d.title || 'draft').replace(/[^\w-]+/g, '_')}.csv`,
                    )
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('sa_rates.nf.export', { defaultValue: 'Download CSV' })}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
