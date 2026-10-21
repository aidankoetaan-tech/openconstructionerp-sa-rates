// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';

import { Button, Card, Input } from '@/shared/ui';
import { triggerDownload } from '@/shared/lib/api';
import { formatCurrency } from '@/shared/lib/money';
import { getNumberLocale } from '@/stores/usePreferencesStore';

import {
  CPAP_LAST_KEY,
  CPAP_WORK_GROUPS,
  DEFAULT_NON_ADJUSTABLE_FACTOR,
  STATS_SA_SOURCE,
  calculateCertificate,
  exportIndicesCsv,
  importIndices,
  type CpapLast,
  type CpapLine,
  type IndexTable,
} from './data/cpap';

const STORE_KEY = 'sa_rates.cpap_indices';

function loadTable(): IndexTable {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as IndexTable) : {};
  } catch {
    return {};
  }
}

function saveTable(t: IndexTable): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: the table lives for this page view only */
  }
}

function zar(v: number): string {
  return formatCurrency(v, 'ZAR', getNumberLocale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

interface Row extends CpapLine {
  id: number;
}

export default function CpapCalculator() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(2);

  const [table, setTable] = useState<IndexTable>(loadTable);
  const [paste, setPaste] = useState('');
  const [importNote, setImportNote] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [baseMonth, setBaseMonth] = useState('');
  const [certDate, setCertDate] = useState('');
  const [prevMonth, setPrevMonth] = useState('');
  const [pcDate, setPcDate] = useState('');
  const [k, setK] = useState(String(DEFAULT_NON_ADJUSTABLE_FACTOR));
  const [rows, setRows] = useState<Row[]>([{ id: 1, workGroup: '110', value: 0 }]);

  const held = useMemo(() => {
    let n = 0;
    let latest = '';
    for (const series of Object.values(table)) {
      for (const m of Object.keys(series)) {
        n += 1;
        if (m > latest) latest = m;
      }
    }
    return { n, groups: Object.keys(table).length, latest };
  }, [table]);

  const ready = Boolean(baseMonth && certDate && rows.some((r) => r.value !== 0));
  const result = useMemo(
    () =>
      ready
        ? calculateCertificate(
            {
              baseMonth,
              certificateDate: certDate,
              previousIndexMonth: prevMonth || undefined,
              practicalCompletionDate: pcDate || undefined,
              k: Number(k),
              lines: rows.filter((r) => r.value !== 0).map(({ workGroup, value }) => ({ workGroup, value })),
            },
            table,
          )
        : null,
    [ready, baseMonth, certDate, prevMonth, pcDate, k, rows, table],
  );

  const complete = Boolean(result && result.errors.length === 0 && result.missing.length === 0 && result.lines.length > 0);
  useEffect(() => {
    if (!complete || !result) return;
    const last: CpapLast = {
      amount: result.totalAdjustment,
      certificateDate: certDate,
      indexMonths: result.lines[0]!.xeMonths,
    };
    try {
      window.localStorage.setItem(CPAP_LAST_KEY, JSON.stringify(last));
    } catch {
      /* storage blocked: the certificate tab cannot pick this up */
    }
  }, [complete, result, certDate]);

  function runImport(text: string, origin: string) {
    const r = importIndices(text, table);
    if (r.values > 0) {
      setTable(r.table);
      saveTable(r.table);
    }
    setImportNote({
      ok: r.values > 0,
      lines: [
        t('sa_rates.cpap.imported', {
          defaultValue: '{{n}} index values read from {{origin}}.',
          n: r.values,
          origin,
        }),
        ...r.problems.slice(0, 20),
      ],
    });
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    runImport(await file.text(), file.name);
    if (fileRef.current) fileRef.current.value = '';
  }

  function exportCsv() {
    triggerDownload(new Blob([exportIndicesCsv(table)], { type: 'text/csv' }), 'cpap_indices.csv');
  }

  function exportResult() {
    if (!result || result.lines.length === 0) return;
    const head = 'work_group,name,work_value_excl_vat,xo,xe,xe_months,adjustment';
    const body = result.lines.map(
      (l) =>
        `${l.workGroup},"${l.name}",${l.value.toFixed(2)},${l.xo},${l.xe.toFixed(4)},${l.xeMonths.join(' ')},${l.adjustment.toFixed(2)}`,
    );
    const tail = `TOTAL,,${result.totalValue.toFixed(2)},,,,${result.totalAdjustment.toFixed(2)}`;
    triggerDownload(
      new Blob([[head, ...body, tail, '', `"${STATS_SA_SOURCE}"`].join('\n') + '\n'], { type: 'text/csv' }),
      `cpap_${certDate || 'certificate'}.csv`,
    );
  }

  const setRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6" data-testid="sa-rates-cpap">
      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.cpap.indices', { defaultValue: '1. Work group indices' })}
        </h2>
        <p className="mt-1 text-sm text-content-tertiary">
          {t('sa_rates.cpap.indices_help', {
            defaultValue:
              'Paste or upload Table 1 of the Stats SA release P0151.1 (CPAP work group indices): work groups down, months across, or one "work group, month, value" per line. Decimal commas and the "r" revision mark are read as printed. Base month and valuation month must come from the same index base.',
          })}
        </p>
        <textarea
          className="mt-3 h-28 w-full rounded-md border border-border bg-surface-primary p-2 font-mono text-xs"
          aria-label={t('sa_rates.cpap.paste', { defaultValue: 'Paste indices' })}
          placeholder={'work_group;Jul 2026;Aug 2026\n110 Concrete (excluding formwork);117,5;115,9'}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => runImport(paste, t('sa_rates.cpap.pasted', { defaultValue: 'pasted text' }))} disabled={!paste.trim()}>
            {t('sa_rates.cpap.import', { defaultValue: 'Import pasted indices' })}
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
            {t('sa_rates.cpap.upload', { defaultValue: 'Upload CSV' })}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={exportCsv} disabled={held.n === 0}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            {t('sa_rates.cpap.export', { defaultValue: 'Download held indices' })}
          </Button>
          <span className="text-sm text-content-secondary" data-testid="sa-rates-cpap-held">
            {t('sa_rates.cpap.held', {
              defaultValue: '{{n}} values held for {{g}} work groups, latest {{latest}}',
              n: held.n,
              g: held.groups,
              latest: held.latest || '–',
            })}
          </span>
        </div>
        {importNote && (
          <ul
            className={`mt-3 list-disc space-y-0.5 pl-5 text-sm ${importNote.ok ? 'text-content-secondary' : 'text-red-600 dark:text-red-400'}`}
          >
            {importNote.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <h2 className="text-base font-semibold text-content-primary">
          {t('sa_rates.cpap.certificate', { defaultValue: '2. Payment certificate' })}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label={t('sa_rates.cpap.base_month', { defaultValue: 'Base month (tenders closed)' })}
            type="month"
            value={baseMonth}
            onChange={(e) => setBaseMonth(e.target.value)}
          />
          <Input
            label={t('sa_rates.cpap.cert_date', { defaultValue: 'Certificate date' })}
            type="date"
            value={certDate}
            onChange={(e) => setCertDate(e.target.value)}
          />
          <Input
            label={t('sa_rates.cpap.prev_month', { defaultValue: 'Index month on last certificate' })}
            type="month"
            value={prevMonth}
            onChange={(e) => setPrevMonth(e.target.value)}
          />
          <Input
            label={t('sa_rates.cpap.pc_date', { defaultValue: 'Practical completion (if reached)' })}
            type="date"
            value={pcDate}
            onChange={(e) => setPcDate(e.target.value)}
          />
          <Input
            label={t('sa_rates.cpap.k', { defaultValue: 'Adjustable proportion' })}
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={k}
            onChange={(e) => setK(e.target.value)}
          />
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
              <th className="py-2 pr-3">{t('sa_rates.cpap.col_group', { defaultValue: 'Work group' })}</th>
              <th className="py-2 pr-3 text-right">
                {t('sa_rates.cpap.col_value', { defaultValue: 'Work value this period, excl VAT' })}
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="py-1.5 pr-3">
                  <select
                    className="w-full rounded-md border border-border bg-surface-primary px-2 py-1.5"
                    aria-label={t('sa_rates.cpap.col_group', { defaultValue: 'Work group' })}
                    value={r.workGroup}
                    onChange={(e) => setRow(r.id, { workGroup: e.target.value })}
                  >
                    {CPAP_WORK_GROUPS.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.code} {g.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-3">
                  <Input
                    className="text-right tabular-nums"
                    aria-label={t('sa_rates.cpap.col_value', { defaultValue: 'Work value this period, excl VAT' })}
                    type="number"
                    step="0.01"
                    value={r.value === 0 ? '' : String(r.value)}
                    onChange={(e) => setRow(r.id, { value: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    className="text-content-tertiary hover:text-red-600"
                    aria-label={t('sa_rates.cpap.remove', { defaultValue: 'Remove line' })}
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const id = nextId.current;
            nextId.current += 1;
            setRows((rs) => [...rs, { id, workGroup: '116', value: 0 }]);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {t('sa_rates.cpap.add', { defaultValue: 'Add work group' })}
        </Button>
      </Card>

      {result && (
        <Card padding="md" data-testid="sa-rates-cpap-result">
          <h2 className="text-base font-semibold text-content-primary">
            {t('sa_rates.cpap.adjustment', { defaultValue: '3. Contract price adjustment' })}
          </h2>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400" role="alert">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result.missing.length > 0 && (
            <div className="mt-2 text-sm text-amber-700 dark:text-amber-400" role="alert">
              {t('sa_rates.cpap.missing', { defaultValue: 'Import these index values first:' })}{' '}
              {result.missing.map((m) => `${m.workGroup} ${m.month}`).join(', ')}
            </div>
          )}
          {result.lines.length > 0 && (
            <>
              <p className="mt-1 text-sm text-content-tertiary">
                {t('sa_rates.cpap.formula', {
                  defaultValue: 'A = {{k}} × V × (Xe / Xo − 1), Xo at {{base}}, Xe at {{month}}.',
                  k,
                  base: baseMonth,
                  month: result.lines[0]!.xeMonths.join(' + '),
                })}
              </p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-content-tertiary">
                    <th className="py-2 pr-3">{t('sa_rates.cpap.col_group', { defaultValue: 'Work group' })}</th>
                    <th className="py-2 pr-3 text-right">V</th>
                    <th className="py-2 pr-3 text-right">Xo</th>
                    <th className="py-2 pr-3 text-right">Xe</th>
                    <th className="py-2 text-right">A</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((l) => (
                    <tr key={l.workGroup + l.value} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">
                        {l.workGroup} {l.name}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{zar(l.value)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{l.xo.toFixed(1)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{l.xe.toFixed(2)}</td>
                      <td className="py-1.5 text-right tabular-nums">{zar(l.adjustment)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3">{t('sa_rates.cpap.total', { defaultValue: 'Total' })}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{zar(result.totalValue)}</td>
                    <td />
                    <td />
                    <td className="py-2 text-right tabular-nums" data-testid="sa-rates-cpap-total">
                      {zar(result.totalAdjustment)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-content-tertiary">
                  {complete && (
                    <span className="block font-medium text-content-secondary" data-testid="sa-rates-cpap-handoff">
                      {t('sa_rates.cpap.handoff', { defaultValue: 'Held for the payment certificate tab (25.3.4).' })}
                    </span>
                  )}
                  {STATS_SA_SOURCE}{' '}
                  {t('sa_rates.cpap.caveat', {
                    defaultValue:
                      'Interim certificates up to practical completion only. Check the adjustable proportion and index-month rule against the CPAP manual named in the contract.',
                  })}
                </p>
                <Button variant="secondary" onClick={exportResult}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('sa_rates.cpap.export_result', { defaultValue: 'Download CSV' })}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
