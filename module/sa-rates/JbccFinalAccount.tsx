// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Plus, Trash2 } from 'lucide-react';

import { Badge, Button, Card, Input } from '@/shared/ui';
import { triggerDownload } from '@/shared/lib/api';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';

import { RECOVERY_PRESETS, type RecoveryTreatment, type SecurityMode } from './data/certificate';
import {
  INSTRUCTION_BASES,
  jbccFinalAccount,
  jbccFinalCsv,
  type InstructionBasis,
  type JbccFinalInput,
  type PaymentKind,
  type Response,
} from './data/jbccFinal';

const STORE_KEY = 'sa_rates.jbcc_final_draft';

type Row = Record<string, string> & { id: string };
type ColType = 'text' | 'number' | 'date' | 'select';
interface Col {
  key: string;
  label: string;
  type: ColType;
  options?: { value: string; label: string }[];
  width?: string;
}

type ListKey = 'instructions' | 'provisionalWork' | 'payments' | 'claims' | 'pcAllowances' | 'provisionalSums' | 'preliminaries' | 'rectifications' | 'recovery';

interface Draft {
  title: string;
  contractSum: string;
  security: SecurityMode;
  vatRegistered: boolean;
  vatPct: string;
  previous: string;
  cpa: string;
  practicalCompletion: string;
  finalCompletion: string;
  finalAccountIssued: string;
  response: Response;
  responseDate: string;
  fpcIssued: string;
  holidayFrom: string;
  holidayTo: string;
  extraHolidays: string;
  lists: Record<ListKey, Row[]>;
}

const EMPTY: Draft = {
  title: '',
  contractSum: '',
  security: 'fixed',
  vatRegistered: true,
  vatPct: '15',
  previous: '',
  cpa: '',
  practicalCompletion: '',
  finalCompletion: '',
  finalAccountIssued: '',
  response: 'none',
  responseDate: '',
  fpcIssued: '',
  holidayFrom: '',
  holidayTo: '',
  extraHolidays: '',
  lists: {
    instructions: [],
    provisionalWork: [],
    payments: [],
    claims: [],
    pcAllowances: [],
    provisionalSums: [],
    preliminaries: [],
    rectifications: [],
    recovery: [],
  },
};

function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      return { ...EMPTY, ...d, lists: { ...EMPTY.lists, ...(d.lists ?? {}) } };
    }
  } catch {
    /* no stored draft */
  }
  return EMPTY;
}

const num = (s: string | undefined): number => (!s || s.trim() === '' ? 0 : Number(s) || 0);

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function ddmmyyyy(iso?: string): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const TREATMENTS: { value: RecoveryTreatment; label: string }[] = [
  { value: 'taxable', label: 'Before VAT (25.3.7)' },
  { value: 'interest', label: 'Interest (25.3.9)' },
  { value: 'non_taxable', label: 'Non-taxable (25.3.10)' },
];

const COLS: Record<ListKey, Col[]> = {
  instructions: [
    { key: 'ref', label: 'Ref', type: 'text', width: 'w-24' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'basis', label: 'Basis', type: 'select', options: INSTRUCTION_BASES.map((b) => ({ value: b.key, label: `${b.clause} ${b.label}` })), width: 'w-64' },
    { key: 'amount', label: 'Amount', type: 'number', width: 'w-40' },
  ],
  provisionalWork: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'provisional', label: 'Provisional value', type: 'number', width: 'w-40' },
    { key: 'executed', label: 'As executed', type: 'number', width: 'w-40' },
  ],
  payments: [
    { key: 'kind', label: 'Item', type: 'select', options: [
      { value: 'authority', label: '26.4.1 Charges by authorities' },
      { value: 'testing', label: '26.4.2 Opening up and testing' },
      { value: 'insurance', label: '26.4.3 Insurances' },
    ], width: 'w-64' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'paid', label: 'Amount paid', type: 'number', width: 'w-40' },
  ],
  claims: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'basis', label: 'Clause', type: 'text', width: 'w-24' },
    { key: 'aware', label: 'Aware', type: 'date', width: 'w-36' },
    { key: 'notice', label: 'Notice', type: 'date', width: 'w-36' },
    { key: 'submitted', label: 'Claim', type: 'date', width: 'w-36' },
    { key: 'assessed', label: 'Assessed (blank: not yet)', type: 'number', width: 'w-40' },
  ],
  pcAllowances: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'inSum', label: 'In contract sum', type: 'number', width: 'w-36' },
    { key: 'actual', label: 'Actual value', type: 'number', width: 'w-36' },
    { key: 'profitAttendance', label: 'Profit and attendance', type: 'number', width: 'w-36' },
  ],
  provisionalSums: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'inSum', label: 'In contract sum', type: 'number', width: 'w-36' },
    { key: 'actual', label: 'Actual value', type: 'number', width: 'w-36' },
    { key: 'profitAttendance', label: 'Profit and attendance', type: 'number', width: 'w-36' },
  ],
  preliminaries: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'amount', label: 'Adjustment (+/−)', type: 'number', width: 'w-40' },
  ],
  rectifications: [
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'amount', label: 'Adjustment (+/−)', type: 'number', width: 'w-40' },
  ],
  recovery: [
    { key: 'preset', label: 'Item (27.1)', type: 'select', options: RECOVERY_PRESETS.map((p) => ({ value: p.key, label: `${p.description} (${p.clause})` })), width: 'w-72' },
    { key: 'amount', label: '+ to contractor / − to employer', type: 'number', width: 'w-44' },
    { key: 'treatment', label: 'Treatment', type: 'select', options: TREATMENTS, width: 'w-52' },
  ],
};

const NEW_ROW: Record<ListKey, Record<string, string>> = {
  instructions: { ref: '', description: '', basis: 'similar', amount: '' },
  provisionalWork: { description: '', provisional: '', executed: '' },
  payments: { kind: 'authority', description: '', paid: '' },
  claims: { description: '', basis: '', aware: '', notice: '', submitted: '', assessed: '' },
  pcAllowances: { description: '', inSum: '', actual: '', profitAttendance: '' },
  provisionalSums: { description: '', inSum: '', actual: '', profitAttendance: '' },
  preliminaries: { description: '', amount: '' },
  rectifications: { description: '', amount: '' },
  recovery: { preset: 'penalty', amount: '', treatment: 'taxable' },
};

export default function JbccFinalAccount() {
  const { t } = useTranslation();
  const initial = useRef(loadDraft()).current;
  const seq = useRef(1);
  const [d, setD] = useState<Draft>(initial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(d));
    } catch {
      /* storage blocked: the draft lives for this page view only */
    }
  }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setList = (k: ListKey, rows: Row[]) => setD((x) => ({ ...x, lists: { ...x.lists, [k]: rows } }));

  const input: JbccFinalInput = useMemo(() => {
    const L = d.lists;
    return {
      contractSum: num(d.contractSum),
      security: d.security,
      instructions: L.instructions.map((r) => ({ ref: r.ref ?? '', description: r.description ?? '', basis: (r.basis as InstructionBasis) || 'similar', amount: num(r.amount) })),
      provisionalWork: L.provisionalWork.map((r) => ({ description: r.description ?? '', provisional: num(r.provisional), executed: num(r.executed) })),
      payments: L.payments.map((r) => ({ description: r.description ?? '', kind: (r.kind as PaymentKind) || 'authority', paid: num(r.paid) })),
      claims: L.claims.map((r) => ({
        description: r.description ?? '',
        basis: r.basis ?? '',
        aware: r.aware || undefined,
        notice: r.notice || undefined,
        submitted: r.submitted || undefined,
        assessed: r.assessed && r.assessed.trim() !== '' ? num(r.assessed) : null,
      })),
      pcAllowances: L.pcAllowances.map((r) => ({ description: r.description ?? '', inSum: num(r.inSum), actual: num(r.actual), profitAttendance: num(r.profitAttendance) })),
      provisionalSums: L.provisionalSums.map((r) => ({ description: r.description ?? '', inSum: num(r.inSum), actual: num(r.actual), profitAttendance: num(r.profitAttendance) })),
      preliminaries: L.preliminaries.map((r) => ({ description: r.description ?? '', amount: num(r.amount) })),
      costFluctuations: num(d.cpa),
      rectifications: L.rectifications.map((r) => ({ description: r.description ?? '', amount: num(r.amount) })),
      recovery: L.recovery.map((r) => {
        const p = RECOVERY_PRESETS.find((x) => x.key === r.preset) ?? RECOVERY_PRESETS[0]!;
        return { description: p.description, clause: p.clause, amount: num(r.amount), treatment: (r.treatment as RecoveryTreatment) || p.treatment };
      }),
      previouslyCertified: num(d.previous),
      vatRegistered: d.vatRegistered,
      vatRate: num(d.vatPct) / 100,
      practicalCompletion: d.practicalCompletion || undefined,
      finalCompletion: d.finalCompletion || undefined,
      finalAccountIssued: d.finalAccountIssued || undefined,
      response: d.response,
      responseDate: d.responseDate || undefined,
      finalPaymentCertificateIssued: d.fpcIssued || undefined,
      calendar: {
        annualHolidays: d.holidayFrom && d.holidayTo ? [{ from: d.holidayFrom, to: d.holidayTo }] : [],
        extraHolidays: d.extraHolidays
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      },
    };
  }, [d]);

  const r = useMemo(() => (num(d.contractSum) > 0 ? jbccFinalAccount(input) : null), [input, d.contractSum]);
  const select = 'w-full rounded-md border border-border bg-surface-primary px-2 py-2 text-sm';

  const date = (k: keyof Draft, label: string, hint?: string) => (
    <Input label={label} hint={hint} type="date" value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} />
  );
  const money = (k: keyof Draft, label: string, hint?: string) => (
    <Input label={label} hint={hint} type="number" step="0.01" className="text-right tabular-nums" value={d[k] as string} onChange={(e) => set(k, e.target.value as never)} />
  );

  const list = (k: ListKey, title: string, help?: string) => {
    const rows = d.lists[k];
    const cols = COLS[k];
    return (
      <div className="mt-5" data-testid={`sa-rates-jbcc-list-${k}`}>
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
        {help && <p className="text-xs text-content-tertiary">{help}</p>}
        {rows.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-content-tertiary">
                  {cols.map((c) => (
                    <th key={c.key} className={`py-1 pr-2 ${c.width ?? ''}`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {cols.map((c) => (
                      <td key={c.key} className="py-1 pr-2">
                        {c.type === 'select' ? (
                          <select
                            className={select}
                            aria-label={`${title}: ${c.label}`}
                            value={row[c.key]}
                            onChange={(e) => setList(k, rows.map((x) => (x.id === row.id ? { ...x, [c.key]: e.target.value } : x)))}
                          >
                            {c.options!.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            aria-label={`${title}: ${c.label}`}
                            type={c.type}
                            step={c.type === 'number' ? '0.01' : undefined}
                            className={c.type === 'number' ? 'text-right tabular-nums' : undefined}
                            value={row[c.key] ?? ''}
                            onChange={(e) => setList(k, rows.map((x) => (x.id === row.id ? { ...x, [c.key]: e.target.value } : x)))}
                          />
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="text-content-tertiary hover:text-red-600"
                        aria-label={t('sa_rates.jf.remove', { defaultValue: 'Remove' })}
                        onClick={() => setList(k, rows.filter((x) => x.id !== row.id))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => {
            const id = `${k}-${Date.now().toString(36)}-${seq.current++}`;
            setList(k, [...rows, { id, ...NEW_ROW[k] } as Row]);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {t('sa_rates.jf.add', { defaultValue: 'Add' })} {title.toLowerCase().replace(/^[\d.–-]+\s*/, '')}
        </Button>
      </div>
    );
  };

  const statusBadge = (s: string) => {
    const map: Record<string, ['success' | 'error' | 'warning' | 'neutral', string]> = {
      assessed: ['success', 'Assessed'],
      forfeited: ['error', 'Forfeited (26.5)'],
      deemed_refused: ['error', 'Deemed refused (26.8)'],
      awaiting_assessment: ['warning', 'Awaiting assessment'],
      incomplete: ['neutral', 'Dates missing'],
    };
    const [v, l] = map[s] ?? ['neutral', s];
    return <Badge variant={v}>{l}</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="sa-rates-jbcc-final">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">{t('sa_rates.jf.contract', { defaultValue: '1. Contract and dates' })}</h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.jf.help', {
            defaultValue:
              'JBCC Principal Building Agreement, Edition 6.2 (June 2024). Final account under clause 26 and final payment certificate under clause 25. Amounts excl VAT. Working days exclude weekends, South African public holidays and the annual holiday entered here.',
          })}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label={t('sa_rates.jf.title', { defaultValue: 'Contract title' })} value={d.title} onChange={(e) => set('title', e.target.value)} />
          {money('contractSum', t('sa_rates.jf.contract_sum', { defaultValue: 'Contract sum excl VAT' }))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">{t('sa_rates.jf.security', { defaultValue: 'Security (cl 11.1)' })}</span>
            <select className={select} value={d.security} onChange={(e) => set('security', e.target.value as SecurityMode)}>
              <option value="fixed">{t('sa_rates.jf.sec_fixed', { defaultValue: 'Fixed + payment reduction (11.1.2)' })}</option>
              <option value="variable">{t('sa_rates.jf.sec_variable', { defaultValue: 'Variable (11.1.1)' })}</option>
              <option value="none">{t('sa_rates.jf.sec_none', { defaultValue: 'None: withholding (11.4.1)' })}</option>
            </select>
          </label>
          {money('previous', t('sa_rates.jf.previous', { defaultValue: 'Gross previously certified (25.3.6)' }))}
          {date('practicalCompletion', t('sa_rates.jf.pc', { defaultValue: 'Practical completion' }))}
          {date('finalCompletion', t('sa_rates.jf.fc', { defaultValue: 'Certificate of final completion' }))}
          {date('finalAccountIssued', t('sa_rates.jf.fa_issued', { defaultValue: 'Final account issued' }))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">{t('sa_rates.jf.response', { defaultValue: "Contractor's response (26.11)" })}</span>
            <select className={select} value={d.response} onChange={(e) => set('response', e.target.value as Response)}>
              <option value="none">{t('sa_rates.jf.resp_none', { defaultValue: 'None yet' })}</option>
              <option value="accepted">{t('sa_rates.jf.resp_accepted', { defaultValue: 'Accepted' })}</option>
              <option value="not_accepted">{t('sa_rates.jf.resp_not', { defaultValue: 'Notice of non-acceptance' })}</option>
            </select>
          </label>
          {d.response !== 'none' && date('responseDate', t('sa_rates.jf.resp_date', { defaultValue: 'Date of response' }))}
          {date('fpcIssued', t('sa_rates.jf.fpc', { defaultValue: 'Final payment certificate issued' }), t('sa_rates.jf.fpc_hint', { defaultValue: 'Blank uses the due date' }))}
          {date('holidayFrom', t('sa_rates.jf.hol_from', { defaultValue: 'Annual holiday from [CD]' }))}
          {date('holidayTo', t('sa_rates.jf.hol_to', { defaultValue: 'Annual holiday to [CD]' }))}
          <Input
            label={t('sa_rates.jf.extra', { defaultValue: 'Other proclaimed holidays' })}
            hint={t('sa_rates.jf.extra_hint', { defaultValue: 'YYYY-MM-DD, comma separated' })}
            value={d.extraHolidays}
            onChange={(e) => set('extraHolidays', e.target.value)}
          />
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={d.vatRegistered} onChange={(e) => set('vatRegistered', e.target.checked)} />
            {t('sa_rates.jf.vat_reg', { defaultValue: 'Contractor is VAT registered' })}
          </label>
          <Input label={t('sa_rates.jf.vat', { defaultValue: 'VAT rate %' })} type="number" value={d.vatPct} disabled={!d.vatRegistered} onChange={(e) => set('vatPct', e.target.value)} />
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">{t('sa_rates.jf.adjust', { defaultValue: '2. Adjustments to the contract value (cl 26)' })}</h2>
        {list('instructions', '26.2 Contract instructions', 'Enter 26.2.3 work at cost; the 10 % mark-up is added. Enter omissions as positive amounts.')}
        {list('provisionalWork', '26.3 Provisional work')}
        {list('payments', '26.4 Payments by the contractor', 'Amount paid on instruction with the principal agent’s approval; 10 % is added.')}
        {list('claims', '26.5–26.8 Expense and loss claims', 'Including delay under 23.2 and 23.3. Only claims assessed under 26.7 are added; notice and claim periods are checked in working days.')}
        {list('pcAllowances', '26.9.1 Prime cost amounts and budgetary allowances', 'Profit and attendance are prorated on the actual value (26.9.3).')}
        {list('provisionalSums', '26.9.2 Provisional sums')}
        {list('preliminaries', '26.9.4 Preliminaries', 'Adjust by the method selected in the Contract Data.')}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money('cpa', t('sa_rates.jf.cpa', { defaultValue: '26.9.5 Cost fluctuations to final' }), t('sa_rates.jf.cpa_hint', { defaultValue: 'If the Contract Data applies CPA' }))}
        </div>
        {list('rectifications', '26.9.6 Rectifications')}
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">{t('sa_rates.jf.recovery', { defaultValue: '3. Recovery statement (cl 27)' })}</h2>
        {list('recovery', '27.1 Recovery items')}
      </Card>

      {r && (
        <Card padding="md" data-testid="sa-rates-jbcc-final-result">
          <h2 className="text-base font-semibold text-content-primary">
            {d.title || t('sa_rates.jf.result', { defaultValue: 'Final account' })}: JBCC PBA 6.2
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
                  <tr className="border-b border-border font-medium">
                    <td className="w-24 py-1.5 pr-3" />
                    <td className="py-1.5 pr-3">{t('sa_rates.jf.cs', { defaultValue: 'Contract sum' })}</td>
                    <td className="py-1.5 text-right tabular-nums">{zar(input.contractSum)}</td>
                  </tr>
                  {r.groups.map((g) => (
                    <tr key={g.clause} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">{g.clause}</td>
                      <td className="py-1.5 pr-3">{g.title}</td>
                      <td className="py-1.5 text-right tabular-nums">{zar(g.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3">
                      {t('sa_rates.jf.fcv', { defaultValue: 'Final contract value' })}{' '}
                      <span className="font-normal text-content-tertiary">
                        ({r.variance >= 0 ? '+' : ''}
                        {(r.variance * 100).toFixed(2)} %)
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums" data-testid="sa-rates-jbcc-final-value">
                      {zar(r.finalContractValue)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {r.claims.length > 0 && (
                <table className="mt-4 w-full text-sm" data-testid="sa-rates-jbcc-claims">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                      <th className="py-2 pr-2">{t('sa_rates.jf.claim', { defaultValue: 'Claim' })}</th>
                      <th className="py-2 pr-2">{t('sa_rates.jf.status', { defaultValue: 'Status' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.jf.notice_wd', { defaultValue: 'Notice (WD)' })}</th>
                      <th className="py-2 pr-2 text-right">{t('sa_rates.jf.claim_wd', { defaultValue: 'Claim (WD)' })}</th>
                      <th className="py-2">{t('sa_rates.jf.flags', { defaultValue: 'Notes' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.claims.map((c, i) => (
                      <tr key={i} className="border-b border-border/60 align-top">
                        <td className="py-1.5 pr-2">{c.row.description || '–'}</td>
                        <td className="py-1.5 pr-2">{statusBadge(c.status)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{c.noticeWorkingDays ?? '–'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{c.claimWorkingDays ?? '–'}</td>
                        <td className="py-1.5 text-xs text-content-tertiary">{c.flags.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {r.certificate && (
                <>
                  <h3 className="mt-5 text-sm font-semibold text-content-primary">
                    {t('sa_rates.jf.fpc_title', { defaultValue: 'Final payment certificate (25.9: 100 %, no security retained)' })}
                  </h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {r.certificate.lines.map((l) => (
                        <tr key={l.ref + l.label} className={`border-b border-border/60 ${l.subtotal ? 'font-semibold' : ''}`}>
                          <td className="w-24 py-1.5 pr-3">{l.ref}</td>
                          <td className="py-1.5 pr-3">{l.label}</td>
                          <td className="py-1.5 text-right tabular-nums">{zar(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="mt-4 space-y-0.5 text-sm text-content-secondary" data-testid="sa-rates-jbcc-dates">
                {r.dates.finalAccountDue && <p>Final account due by {ddmmyyyy(r.dates.finalAccountDue)} (26.10, 60 working days after practical completion).</p>}
                {r.dates.acceptanceDue && <p>Contractor to accept or give notice by {ddmmyyyy(r.dates.acceptanceDue)} (26.11, 30 working days).</p>}
                {r.dates.disagreementFrom && <p>Disagreement may be declared from {ddmmyyyy(r.dates.disagreementFrom)} (26.12).</p>}
                {r.dates.finalPaymentCertificateDue && <p>Final payment certificate due by {ddmmyyyy(r.dates.finalPaymentCertificateDue)} (26.13, 25.15).</p>}
                {r.certificate?.employerPaysBy && r.certificate.dueTo !== 'employer' && <p>Employer pays by {ddmmyyyy(r.certificate.employerPaysBy)} (25.10).</p>}
                {r.notes.concat(r.certificate?.notes ?? []).map((n) => (
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
                      new Blob([jbccFinalCsv(r, input, d.title || 'Final account')], { type: 'text/csv' }),
                      `jbcc_final_account_${(d.title || 'draft').replace(/[^\w-]+/g, '_')}.csv`,
                    )
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('sa_rates.jf.export', { defaultValue: 'Download CSV' })}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
