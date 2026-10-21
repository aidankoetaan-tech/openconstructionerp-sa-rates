// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CpapCalculator from './CpapCalculator';

const EXTRACT = [
  'work_group;Mar 2026;Jul 2026;Aug 2026',
  '110 Concrete (excluding formwork);110,0;117,5;115,9',
  '116 Brick and block work;100,0;106,4;106,5',
].join('\n');

function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

describe('CpapCalculator', () => {
  it('imports pasted Table 1 values and prices a certificate across two work groups', () => {
    render(<CpapCalculator />);
    fireEvent.change(screen.getByLabelText('Paste indices'), { target: { value: EXTRACT } });
    fireEvent.click(screen.getByText('Import pasted indices'));
    expect(screen.getByTestId('sa-rates-cpap-held')).toHaveTextContent('6 values held for 2 work groups, latest 2026-08');

    setField(/Base month/, '2026-03');
    setField(/Certificate date/, '2026-09-10');
    fireEvent.change(screen.getAllByLabelText('Work value this period, excl VAT')[0]!, { target: { value: '400000' } });
    fireEvent.click(screen.getByText('Add work group'));
    fireEvent.change(screen.getAllByLabelText('Work value this period, excl VAT')[1]!, { target: { value: '250000' } });

    // 18 236.36 + 13 812.50, grouping depends on the number locale
    expect(screen.getByTestId('sa-rates-cpap-total').textContent).toMatch(/32[\s,.\u00a0]?048[.,]86/);
  });

  it('says which index values are still needed', () => {
    render(<CpapCalculator />);
    setField(/Base month/, '2026-02');
    setField(/Certificate date/, '2026-09-20');
    fireEvent.change(screen.getAllByLabelText('Work value this period, excl VAT')[0]!, { target: { value: '1000' } });
    expect(screen.getByTestId('sa-rates-cpap-result')).toHaveTextContent('110 2026-02, 110 2026-09');
  });
});
