// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import JbccFinalAccount from './JbccFinalAccount';

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

describe('JbccFinalAccount', () => {
  it('builds the final contract value, the final payment certificate and the cl 26 dates', () => {
    render(<JbccFinalAccount />);
    type(/Contract sum excl VAT/, '10000000');
    type(/Gross previously certified/, '10200000');
    type(/Practical completion/, '2026-06-01');
    type(/Final account issued/, '2026-08-20');
    type(/Certificate of final completion/, '2026-09-15');

    fireEvent.click(screen.getByText('Add contract instructions'));
    fireEvent.change(screen.getByLabelText('26.2 Contract instructions: Basis'), { target: { value: 'cost' } });
    type('26.2 Contract instructions: Amount', '40000');

    fireEvent.click(screen.getByText('Add rectifications'));
    type('26.9.6 Rectifications: Adjustment (+/−)', '-12000');

    fireEvent.click(screen.getByText('Add expense and loss claims'));
    type('26.5–26.8 Expense and loss claims: Aware', '2026-03-02');
    type('26.5–26.8 Expense and loss claims: Notice', '2026-04-15');
    type('26.5–26.8 Expense and loss claims: Assessed (blank: not yet)', '50000');

    // 10 000 000 + 44 000 − 12 000; the late-noticed claim is forfeited
    expect(screen.getByTestId('sa-rates-jbcc-final-value').textContent).toMatch(/10\D?032\D?000[.,]00/);
    expect(screen.getByTestId('sa-rates-jbcc-claims')).toHaveTextContent('Forfeited (26.5)');
    const dates = screen.getByTestId('sa-rates-jbcc-dates');
    expect(dates).toHaveTextContent('Final account due by 26/08/2026');
    expect(dates).toHaveTextContent('Contractor to accept or give notice by 02/10/2026');
    expect(dates).toHaveTextContent('Final payment certificate due by 09/10/2026');
    // 10 032 000 − 10 200 000 = −168 000: the contractor pays
    expect(dates).toHaveTextContent(/21 calendar days/);
  });

  it('shows the disagreement date after a notice of non-acceptance', () => {
    render(<JbccFinalAccount />);
    type(/Contract sum excl VAT/, '1000000');
    type(/Final account issued/, '2026-08-20');
    fireEvent.change(screen.getByLabelText(/Contractor's response/), { target: { value: 'not_accepted' } });
    type(/Date of response/, '2026-09-10');
    expect(screen.getByTestId('sa-rates-jbcc-dates')).toHaveTextContent('Disagreement may be declared from 25/09/2026');
  });
});
