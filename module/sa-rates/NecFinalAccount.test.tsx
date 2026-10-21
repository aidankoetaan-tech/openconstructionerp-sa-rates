// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import NecFinalAccount from './NecFinalAccount';

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this environment */
  }
});

describe('NecFinalAccount', () => {
  it('assesses an Option C final amount with the share and the dates', () => {
    render(<NecFinalAccount />);
    type(/Cost of components/, '900000');
    type(/Fee percentage/, '8');
    type(/Final total of the Prices/, '1000000');
    const shares = screen.getAllByLabelText('share range share');
    fireEvent.change(shares[0]!, { target: { value: '30' } });
    fireEvent.change(shares[1]!, { target: { value: '50' } });
    fireEvent.change(shares[2]!, { target: { value: '100' } });
    fireEvent.click(screen.getByText('Add Disallowed Cost'));
    fireEvent.change(screen.getByLabelText('Add Disallowed Cost: amount'), { target: { value: '20000' } });
    type(/Amount due at the previous assessment/, '900000');
    type(/Defects Certificate issued/, '2026-09-30');
    type(/Final assessment issued/, '2026-10-21');

    // PWDD 950 400; share 24 800; final amount due 975 200; payment 75 200 + VAT 11 280 = 86 480
    expect(screen.getByTestId('sa-rates-nec-final-due').textContent).toMatch(/975\D?200[.,]00/);
    expect(screen.getByTestId('sa-rates-nec-final-payment').textContent).toMatch(/86\D?480[.,]00/);
    expect(screen.getByTestId('sa-rates-nec-final-share')).toHaveTextContent('95.04 % to 100.00 %');
    expect(screen.getByTestId('sa-rates-nec-final-dates')).toHaveTextContent('Project Manager assesses by 28/10/2026');
    expect(screen.getByTestId('sa-rates-nec-final-dates')).toHaveTextContent('Final payment by 11/11/2026');
  });

  it('switches to Option A inputs and hides the share ranges', () => {
    render(<NecFinalAccount />);
    fireEvent.change(screen.getByLabelText(/Main Option/), { target: { value: 'A' } });
    expect(screen.queryByText(/Share ranges/)).toBeNull();
    type(/Final Price for Work Done to Date/, '2000000');
    type(/Amount due at the previous assessment/, '2100000');
    // the Contractor repays 100 000 + VAT 15 000
    expect(screen.getByText('Final payment by the Contractor, incl tax')).toBeInTheDocument();
    expect(screen.getByTestId('sa-rates-nec-final-payment').textContent).toMatch(/115\D?000[.,]00/);
  });
});
