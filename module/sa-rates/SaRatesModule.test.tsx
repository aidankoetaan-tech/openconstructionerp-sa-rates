// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SaRatesModule from './SaRatesModule';
import { FIXTURE_PACK } from './data/fixturePack';

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}));
vi.mock('@/shared/lib/api', () => api);

function renderModule() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <SaRatesModule />
    </QueryClientProvider>,
  );
}

function packFile(body: unknown): File {
  const f = new File([JSON.stringify(body)], 'pack.json', { type: 'application/json' });
  // jsdom's File has no text(); the module reads the pack through it.
  Object.defineProperty(f, 'text', { value: () => Promise.resolve(JSON.stringify(body)) });
  return f;
}

async function upload(body: unknown) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [packFile(body)] } });
}

beforeEach(() => {
  api.apiGet.mockReset();
  api.apiPost.mockReset();
  api.apiPatch.mockReset();
});

describe('SaRatesModule', () => {
  it('lists the build-up rates with small-town and rural uplifts once a pack is uploaded', async () => {
    renderModule();
    await upload(FIXTURE_PACK);
    const table = await screen.findByTestId('sa-rates-table');
    const row = within(table).getByText('Rough formwork (DoA III)').closest('tr')!;
    // 203.09 City, ×1.06 small town, ×1.15 rural; grouping varies by locale.
    expect(row.textContent).toMatch(/203[.,]09/);
    expect(row.textContent).toMatch(/215[.,]28/);
    expect(row.textContent).toMatch(/233[.,]55/);
    expect(screen.getByText('v3.2')).toBeInTheDocument();
  });

  it('refuses a pack whose components do not reproduce its rates', async () => {
    renderModule();
    const bad = JSON.parse(JSON.stringify(FIXTURE_PACK));
    bad.buildups[0].rate = 999;
    await upload(bad);
    expect(await screen.findByRole('alert')).toHaveTextContent(/components give 203\.09, pack says 999\.00/);
    expect(screen.queryByTestId('sa-rates-table')).toBeNull();
  });

  it('plans a fresh install, then creates cost items and assemblies through the existing endpoints', async () => {
    api.apiGet.mockImplementation((url: string) =>
      Promise.resolve(url.startsWith('/v1/costs/') ? { items: [], has_more: false } : { items: [], total: 0 }),
    );
    api.apiPost.mockImplementation((url: string, body: unknown) =>
      Promise.resolve(url === '/v1/costs/bulk/' ? (body as unknown[]) : { id: 'new' }),
    );
    renderModule();
    await upload(FIXTURE_PACK);
    fireEvent.click(await screen.findByText('Compare with installed'));
    const plan = await screen.findByTestId('sa-rates-plan');
    expect(plan).toHaveTextContent(`Cost items: ${FIXTURE_PACK.resources.length} new, 0 with a new price, 0 unchanged`);
    expect(plan).toHaveTextContent(`Assemblies: ${FIXTURE_PACK.buildups.length} new, 0 to re-price`);

    fireEvent.click(screen.getByText('Install / update'));
    await waitFor(() => expect(screen.getByTestId('sa-rates-result')).toBeInTheDocument());

    const bulk = api.apiPost.mock.calls.find(([u]) => u === '/v1/costs/bulk/');
    expect(bulk![1]).toHaveLength(FIXTURE_PACK.resources.length);
    const imports = api.apiPost.mock.calls.filter(([u]) => u === '/v1/assemblies/import/');
    expect(imports).toHaveLength(FIXTURE_PACK.buildups.length);
    expect(imports[0]![1].assembly).toMatchObject({ currency: 'ZAR', bid_factor: 1.125 });
    expect(api.apiGet).toHaveBeenCalledWith(expect.stringContaining('source=setout'));
    expect(api.apiGet).toHaveBeenCalledWith(expect.stringContaining('tag=setout-za'));
  });
});
