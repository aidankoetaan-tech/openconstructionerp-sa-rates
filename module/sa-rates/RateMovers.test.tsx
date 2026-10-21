// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import RateMovers from './RateMovers';
import { FIXTURE_PACK } from './data/fixturePack';
import type { RatePack } from './data/ratepack';

function earlier(): RatePack {
  const p: RatePack = JSON.parse(JSON.stringify(FIXTURE_PACK));
  p.library_version = 'v3.1';
  p.priced_on = '2026-09-08';
  p.resources.find((r) => r.code === 'ZA-SET-M-shutterply')!.rate = 110;
  return p;
}

const upload = (label: string, body: unknown, name: string) =>
  fireEvent.change(screen.getByLabelText(label), {
    target: { files: [new File([JSON.stringify(body)], name, { type: 'application/json' })] },
  });

describe('RateMovers', () => {
  it('compares an uploaded earlier pack with the pack loaded on the Rates tab', async () => {
    render(<RateMovers loadedPack={FIXTURE_PACK} />);
    expect(screen.getByTestId('sa-rates-movers-later')).toHaveTextContent('v3.2, priced 28/09/2026 (pack loaded on the Rates tab)');
    expect(screen.queryByTestId('sa-rates-movers-result')).toBeNull();

    upload('Earlier pack', earlier(), 'v31.json');
    await waitFor(() => expect(screen.getByTestId('sa-rates-movers-result')).toBeInTheDocument());
    expect(screen.getByText(/Movement from v3\.1 to v3\.2$/)).toBeInTheDocument();
    // 13.28 / 110 = 12.07 %
    expect(screen.getByText('+12.1 %')).toBeInTheDocument();
    expect(screen.getByTestId('sa-rates-movers-count')).toHaveTextContent('1 items listed');
    expect(screen.getByTestId('sa-rates-movers-summary-material')).toHaveTextContent('average of 4: 1 up, 0 down, 3 unchanged; movers median +12.1 %');
  });

  it('refuses a file that is not a valid pack', async () => {
    render(<RateMovers loadedPack={null} />);
    upload('Earlier pack', { schema: 'something-else' }, 'bad.json');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByTestId('sa-rates-movers-result')).toBeNull();
  });
});
