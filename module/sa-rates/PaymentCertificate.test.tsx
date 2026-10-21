// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import PaymentCertificate from './PaymentCertificate';

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

describe('PaymentCertificate', () => {
  it('builds the clause 25.3 certificate from the valuation and the recovery statement', () => {
    render(<PaymentCertificate />);
    type(/^Contract sum/, '10000000');
    type(/Date for issue/, '2026-09-25');
    type(/Gross previously certified/, '3000000');
    type(/Work executed/, '4000000');
    type(/Materials on site/, '200000');
    type(/Cost fluctuations to date/, '50000');

    fireEvent.change(screen.getByLabelText('Recovery item type'), { target: { value: 'penalty' } });
    fireEvent.click(screen.getByText('Add to recovery statement'));
    fireEvent.change(screen.getByLabelText('Recovery item type'), { target: { value: 'compensatory_interest' } });
    fireEvent.click(screen.getByText('Add to recovery statement'));
    const amounts = screen.getAllByLabelText('Amount');
    fireEvent.change(amounts[0]!, { target: { value: '-20000' } });
    fireEvent.change(amounts[1]!, { target: { value: '1500' } });

    // 4 040 000 gross − 3 000 000 − 20 000 = 1 020 000; + VAT 153 000; + interest 1 500
    expect(screen.getByTestId('sa-rates-certificate-net').textContent).toMatch(/1[\s,.\u00a0]?174[\s,.\u00a0]?500[.,]00/);
    expect(screen.getByTestId('sa-rates-certificate-due')).toHaveTextContent('Employer pays by 09/10/2026');
  });

  it('shows the cl 11.4.1 withholding field only when no guarantee was given', () => {
    render(<PaymentCertificate />);
    expect(screen.queryByLabelText(/Amount withheld to date/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Security/), { target: { value: 'none' } });
    expect(screen.getByLabelText(/Amount withheld to date/)).toBeInTheDocument();
  });
});
