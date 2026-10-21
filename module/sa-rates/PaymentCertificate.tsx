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
  RECOVERY_PRESETS,
  buildCertificate,
  certificateCsv,
  type CertificateInput,
  type RecoveryTreatment,
  type SecurityMode,
  type Stage,
} from './data/certificate';
import { CPAP_LAST_KEY, type CpapLast } from './data/cpap';

function readCpapLast(): CpapLast | null {
  try {
    const raw = window.localStorage.getItem(CPAP_LAST_KEY);
    const v = raw ? (JSON.parse(raw) as CpapLast) : null;
    return v && Number.isFinite(v.amount) ? v : null;
  } catch {
    return null;
  }
}

const STORE_KEY = 'sa_rates.certificate_draft';

interface Form {
  title: string;
  contractSum: string;
  security: SecurityMode;
  stage: Stage;
  issueDate: string;
  workValue: string;
  materialsOnSite: string;
  materialsOffSite: string;
  offSiteCovered: boolean;
  /** Cost fluctuations certified on earlier certificates. */
  costFluctuations: string;
  /** Cost fluctuations for this certificate, usually from the CPAP tab. */
  cpapThis: string;
  withheldToDate: string;
  previouslyCertified: string;
  vatRegistered: boolean;
  vatRate: string;
}

interface RecoveryRow {
  id: number;
  description: string;
  clause: string;
  amount: string;
  treatment: RecoveryTreatment;
  sign: 1 | -1;
}

const EMPTY: Form = {
  title: '',
  contractSum: '',
  security: 'fixed',
  stage: 'interim',
  issueDate: '',
  workValue: '',
  materialsOnSite: '',
  materialsOffSite: '',
  offSiteCovered: false,
  costFluctuations: '',
  cpapThis: '',
  withheldToDate: '',
  previouslyCertified: '',
  vatRegistered: true,
  vatRate: '15',
};

function loadDraft(): { form: Form; recovery: RecoveryRow[] } {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as { form: Form; recovery: RecoveryRow[] };
      return { form: { ...EMPTY, ...d.form }, recovery: d.recovery ?? [] };
    }
  } catch {
    /* no stored draft */
  }
  return { form: EMPTY, recovery: [] };
}

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s));

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function ddmmyyyy(iso?: string): string {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function PaymentCertificate() {
  const { t } = useTranslation();
  const initial = useRef(loadDraft()).current;
  const nextId = useRef(initial.recovery.reduce((m, r) => Math.max(m, r.id), 0) + 1);
  const [form, setForm] = useState<Form>(initial.form);
  const [recovery, setRecovery] = useState<RecoveryRow[]>(initial.recovery);
  const [preset, setPreset] = useState(RECOVERY_PRESETS[0]!.key);
  const cpapLast = useMemo(readCpapLast, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const input: CertificateInput = useMemo(
    () => ({
      contractSum: num(form.contractSum),
      security: form.security,
      stage: form.stage,
      workValue: num(form.workValue),
      materialsOnSite: num(form.materialsOnSite),
      materialsOffSite: num(form.materialsOffSite),
      offSiteCovered: form.offSiteCovered,
      costFluctuations: num(form.costFluctuations) + num(form.cpapThis),
      withheldToDate: num(form.withheldToDate),
      previouslyCertified: num(form.previouslyCertified),
      recovery: recovery.map((r) => ({ description: r.description, clause: r.clause, amount: num(r.amount), treatment: r.treatment })),
      vatRegistered: form.vatRegistered,
      vatRate: num(form.vatRate) / 100,
      issueDate: form.issueDate || undefined,
    }),
    [form, recovery],
  );
  const cert = useMemo(() => (num(form.contractSum) > 0 ? buildCertificate(input) : null), [input, form.contractSum]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ form, recovery }));
    } catch {
      /* storage blocked: the draft lives for this page view only */
    }
  }, [form, recovery]);

  function addRecovery() {
    const p = RECOVERY_PRESETS.find((x) => x.key === preset)!;
    const id = nextId.current;
    nextId.current += 1;
    setRecovery((rs) => [
      ...rs,
      { id, description: p.description, clause: p.clause, amount: '', treatment: p.treatment, sign: p.sign },
    ]);
  }

  const setRec = (id: number, patch: Partial<RecoveryRow>) =>
    setRecovery((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const money = (k: keyof Form, label: string, hint?: string) => (
    <Input
      label={label}
      hint={hint}
      type="number"
      step="0.01"
      className="text-right tabular-nums"
      value={form[k] as string}
      onChange={(e) => set(k, e.target.value as never)}
    />
  );

  const select = 'w-full rounded-md border border-border bg-surface-primary px-2 py-2 text-sm';

  return (
    <div className="space-y-6" data-testid="sa-rates-certificate">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.pc.contract', { defaultValue: '1. Contract and certificate' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.pc.help', {
            defaultValue:
              'JBCC Principal Building Agreement, Edition 6.2. Amounts to date, excl VAT. The certificate follows the order of clause 25.3.',
          })}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label={t('sa_rates.pc.title', { defaultValue: 'Certificate title' })}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t('sa_rates.pc.title_ph', { defaultValue: 'Payment certificate no. 7' })}
          />
          {money('contractSum', t('sa_rates.pc.contract_sum', { defaultValue: 'Contract sum' }))}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">
              {t('sa_rates.pc.security', { defaultValue: 'Security (cl 11.1)' })}
            </span>
            <select className={select} value={form.security} onChange={(e) => set('security', e.target.value as SecurityMode)}>
              <option value="fixed">{t('sa_rates.pc.sec_fixed', { defaultValue: 'Fixed 5 % + 5 % reduction (11.1.2)' })}</option>
              <option value="variable">{t('sa_rates.pc.sec_variable', { defaultValue: 'Variable 10 %, no reduction (11.1.1)' })}</option>
              <option value="none">{t('sa_rates.pc.sec_none', { defaultValue: 'No guarantee: withholding (11.4.1)' })}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content-secondary">
              {t('sa_rates.pc.stage', { defaultValue: 'Stage' })}
            </span>
            <select className={select} value={form.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
              <option value="interim">{t('sa_rates.pc.stage_interim', { defaultValue: 'Before practical completion' })}</option>
              <option value="after_practical_completion">
                {t('sa_rates.pc.stage_after_pc', { defaultValue: 'After practical completion' })}
              </option>
              <option value="final">{t('sa_rates.pc.stage_final', { defaultValue: 'Final payment certificate' })}</option>
            </select>
          </label>
          <Input
            label={t('sa_rates.pc.issue_date', { defaultValue: 'Date for issue (cl 25.2)' })}
            type="date"
            value={form.issueDate}
            onChange={(e) => set('issueDate', e.target.value)}
          />
          {money('previouslyCertified', t('sa_rates.pc.previous', { defaultValue: 'Gross previously certified (25.3.6)' }))}
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" checked={form.vatRegistered} onChange={(e) => set('vatRegistered', e.target.checked)} />
            {t('sa_rates.pc.vat_registered', { defaultValue: 'Contractor is VAT registered' })}
          </label>
          <Input
            label={t('sa_rates.pc.vat_rate', { defaultValue: 'VAT rate %' })}
            type="number"
            step="0.01"
            value={form.vatRate}
            disabled={!form.vatRegistered}
            onChange={(e) => set('vatRate', e.target.value)}
          />
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.pc.valuation', { defaultValue: '2. Valuation to date' })}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money('workValue', t('sa_rates.pc.work', { defaultValue: 'Work executed (25.3.1)' }))}
          {money('materialsOnSite', t('sa_rates.pc.mat_on', { defaultValue: 'Materials on site (25.4)' }))}
          {money('materialsOffSite', t('sa_rates.pc.mat_off', { defaultValue: 'Materials off site (25.5)' }))}
          {money(
            'costFluctuations',
            t('sa_rates.pc.cpa_prev', { defaultValue: 'Cost fluctuations previously certified (25.3.4)' }),
          )}
          <div>
            {money(
              'cpapThis',
              t('sa_rates.pc.cpa_this', { defaultValue: 'Cost fluctuations this certificate' }),
              t('sa_rates.pc.cpa_to_date', {
                defaultValue: 'To date {{v}}',
                v: zar(num(form.costFluctuations) + num(form.cpapThis)),
              }),
            )}
            {cpapLast && (
              <button
                type="button"
                className="mt-1 text-xs text-oe-blue hover:underline"
                data-testid="sa-rates-certificate-use-cpap"
                onClick={() => set('cpapThis', cpapLast.amount.toFixed(2))}
              >
                {t('sa_rates.pc.use_cpap', {
                  defaultValue: 'Use the CPAP tab result: {{v}} ({{m}})',
                  v: zar(cpapLast.amount),
                  m: cpapLast.indexMonths.join(' + '),
                })}
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.offSiteCovered}
              onChange={(e) => set('offSiteCovered', e.target.checked)}
            />
            {t('sa_rates.pc.off_covered', {
              defaultValue: 'Off-site materials are covered by a guarantee for advance payment or other accepted security',
            })}
          </label>
          {form.security === 'none' &&
            money(
              'withheldToDate',
              t('sa_rates.pc.withheld', { defaultValue: 'Amount withheld to date (11.4.1)' }),
              t('sa_rates.pc.withheld_hint', { defaultValue: 'Capped at 10 % of the contract sum, 2.5 % after practical completion' }),
            )}
        </div>
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.pc.recovery', { defaultValue: '3. Recovery statement (cl 27.1)' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.pc.recovery_help', {
            defaultValue:
              'Amounts for this certificate. Positive when due to the contractor, negative when due to the employer. Interest goes to 25.3.9; choose the VAT treatment of each other item with your tax adviser.',
          })}
        </p>
        {recovery.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                <th className="py-2 pr-3">{t('sa_rates.pc.col_item', { defaultValue: 'Item' })}</th>
                <th className="py-2 pr-3">{t('sa_rates.pc.col_clause', { defaultValue: 'Clause' })}</th>
                <th className="py-2 pr-3">{t('sa_rates.pc.col_treatment', { defaultValue: 'Treatment' })}</th>
                <th className="py-2 pr-3 text-right">{t('sa_rates.pc.col_amount', { defaultValue: 'Amount' })}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {recovery.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-3">
                    <Input
                      aria-label={t('sa_rates.pc.col_item', { defaultValue: 'Item' })}
                      value={r.description}
                      onChange={(e) => setRec(r.id, { description: e.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-content-tertiary">{r.clause}</td>
                  <td className="py-1.5 pr-3">
                    <select
                      className={select}
                      aria-label={t('sa_rates.pc.col_treatment', { defaultValue: 'Treatment' })}
                      value={r.treatment}
                      onChange={(e) => setRec(r.id, { treatment: e.target.value as RecoveryTreatment })}
                    >
                      <option value="taxable">{t('sa_rates.pc.tr_taxable', { defaultValue: 'Before VAT (25.3.7)' })}</option>
                      <option value="interest">{t('sa_rates.pc.tr_interest', { defaultValue: 'Interest (25.3.9)' })}</option>
                      <option value="non_taxable">{t('sa_rates.pc.tr_other', { defaultValue: 'Non-taxable (25.3.10)' })}</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-3">
                    <Input
                      className="text-right tabular-nums"
                      aria-label={t('sa_rates.pc.col_amount', { defaultValue: 'Amount' })}
                      type="text"
                      inputMode="decimal"
                      value={r.amount}
                      placeholder={r.sign < 0 ? '-20000' : '1500'}
                      onChange={(e) => setRec(r.id, { amount: e.target.value })}
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      className="text-content-tertiary hover:text-red-600"
                      aria-label={t('sa_rates.pc.remove', { defaultValue: 'Remove item' })}
                      onClick={() => setRecovery((rs) => rs.filter((x) => x.id !== r.id))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            className={`${select} max-w-sm`}
            aria-label={t('sa_rates.pc.preset', { defaultValue: 'Recovery item type' })}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {RECOVERY_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.description} ({p.clause})
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={addRecovery}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {t('sa_rates.pc.add_recovery', { defaultValue: 'Add to recovery statement' })}
          </Button>
        </div>
      </Card>

      {cert && (
        <Card padding="md" data-testid="sa-rates-certificate-result">
          <h2 className="text-base font-semibold text-content-primary">
            {form.title || t('sa_rates.pc.certificate', { defaultValue: '4. Payment certificate' })}
          </h2>
          {cert.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
              {cert.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {cert.lines.length > 0 && (
            <>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {cert.lines.map((l) => (
                    <tr
                      key={l.ref + l.label}
                      className={`border-b border-border/60 ${l.subtotal ? 'font-semibold' : ''}`}
                    >
                      <td className="w-20 py-1.5 pr-3 text-content-tertiary">{l.ref}</td>
                      <td className="py-1.5 pr-3">{l.label}</td>
                      <td
                        className="py-1.5 text-right tabular-nums"
                        data-testid={l.ref === '25.3.11' ? 'sa-rates-certificate-net' : undefined}
                      >
                        {zar(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm" data-testid="sa-rates-certificate-due">
                {cert.dueTo === 'employer'
                  ? t('sa_rates.pc.due_employer', {
                      defaultValue: 'Due to the employer. The contractor pays within 21 calendar days of the date for issue (cl 25.11).',
                    })
                  : t('sa_rates.pc.due_dates', {
                      defaultValue: 'Employer pays by {{pay}} (cl 25.10); contractor pays subcontractors by {{sub}} (cl 25.13).',
                      pay: ddmmyyyy(cert.employerPaysBy),
                      sub: ddmmyyyy(cert.subcontractorsPaidBy),
                    })}
              </p>
              {cert.notes.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-content-tertiary">
                  {cert.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() =>
                    triggerDownload(
                      new Blob([certificateCsv(cert, form.title || 'Payment certificate')], { type: 'text/csv' }),
                      `payment_certificate_${form.issueDate || 'draft'}.csv`,
                    )
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('sa_rates.pc.export', { defaultValue: 'Download CSV' })}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
