// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import Adjudication from './Adjudication';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

function fillRow(i: number, name: string, price: string, grade: string, goals: string, checks = ['yes', 'yes', 'yes', 'yes']) {
  change(screen.getAllByLabelText('Tenderer')[i]!, name);
  change(screen.getAllByLabelText('Price')[i]!, price);
  change(screen.getAllByLabelText('Grade')[i]!, grade);
  change(screen.getAllByLabelText('Goal pts')[i]!, goals);
  change(screen.getAllByLabelText(/Central Supplier Database/)[i]!, checks[0]!);
  change(screen.getAllByLabelText(/Tax compliance/)[i]!, checks[1]!);
  change(screen.getAllByLabelText(/CIDB registration active/)[i]!, checks[2]!);
  change(screen.getAllByLabelText(/Mandatory returnable/)[i]!, checks[3]!);
}

describe('Adjudication', () => {
  it('scores two compliant tenders on 80/20 and sets aside one that fails tax', () => {
    render(<Adjudication />);
    change(screen.getByLabelText(/Estimated Rand value/), '10000000');
    fireEvent.click(screen.getByText('Add tenderer'));
    fireEvent.click(screen.getByText('Add tenderer'));
    fillRow(0, 'A', '9500000', '6', '12');
    fillRow(1, 'B', '9000000', '5', '4');
    fillRow(2, 'D', '8500000', '7', '20', ['yes', 'no', 'yes', 'yes']);

    const result = screen.getByTestId('sa-rates-adjudication-result');
    expect(result).toHaveTextContent('80/20 preference point system');
    expect(result).toHaveTextContent('CIDB requirement 5GB');
    expect(within(result).getByText('87.56')).toBeInTheDocument();
    expect(screen.getByTestId('sa-rates-adjudication-outcome')).toHaveTextContent(
      'Highest points among responsive tenders: A (87.56).',
    );
    expect(result).toHaveTextContent(/Tax compliance status verified \(SARS \/ CSD\): no\./);
  });

  it('keeps a tender with a pending check out of the scoring', () => {
    render(<Adjudication />);
    change(screen.getByLabelText(/Estimated Rand value/), '1000000');
    change(screen.getAllByLabelText('Tenderer')[0]!, 'Solo');
    change(screen.getAllByLabelText('Price')[0]!, '950000');
    change(screen.getAllByLabelText('Grade')[0]!, '2');
    expect(screen.getByTestId('sa-rates-adjudication-outcome')).toHaveTextContent('No responsive tender yet.');
  });
});
