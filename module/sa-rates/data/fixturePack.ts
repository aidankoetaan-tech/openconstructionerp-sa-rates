// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
// Two build-ups cut from the v3.2 pack (28/09/2026), used by the unit tests.
import type { RatePack } from './ratepack';

export const FIXTURE_PACK: RatePack = {
  "schema": "setout.za.ratepack/1",
  "library_version": "v3.2",
  "priced_on": "2026-09-28",
  "region": "ZA",
  "currency": "ZAR",
  "basis": "City (Johannesburg) average of supplier prices, excl VAT; build-up components exclude profit",
  "publisher": {
    "name": "Setout",
    "url": "https://setout.co.za",
    "contact": "hello@setout.co.za"
  },
  "disclaimer": "Estimating benchmarks from published supplier prices. Verify against project quotations before any tender award or adjudication recommendation.",
  "settings": {
    "profit": 0.125,
    "small_town_uplift": 0.06,
    "rural_uplift": 0.15,
    "vat": 0.15,
    "labour_oncost": 0.3
  },
  "regional_factors": {
    "ZA_CITY": 1.0,
    "ZA_SMALL_TOWN": 1.06,
    "ZA_RURAL": 1.15
  },
  "counts": {
    "resources": 6,
    "materials": 4,
    "buildups": 2
  },
  "resources": [
    {
      "code": "ZA-SET-M-bath",
      "kind": "material",
      "key": "bath",
      "name": "Acrylic bath 1700mm",
      "unit": "no",
      "rate": 1825.48,
      "low": 1573.04,
      "high": 1990.43,
      "suppliers": 3,
      "dated": "09/2026"
    },
    {
      "code": "ZA-SET-M-copper15",
      "kind": "material",
      "key": "copper15",
      "name": "Copper pipe 15mm Class 0 per m",
      "unit": "m",
      "rate": 86.89,
      "low": 70.36,
      "high": 116.96,
      "suppliers": 3,
      "dated": "09/2026"
    },
    {
      "code": "ZA-SET-M-fwtimber",
      "kind": "material",
      "key": "fwtimber",
      "name": "SA Pine 38x114 formwork bearer per m",
      "unit": "m",
      "rate": 44.01,
      "low": 27.5,
      "high": 76.98,
      "suppliers": 3,
      "dated": "28/09/2026"
    },
    {
      "code": "ZA-SET-M-shutterply",
      "kind": "material",
      "key": "shutterply",
      "name": "Shutterply 18mm (per m2 of sheet)",
      "unit": "m2",
      "rate": 123.28,
      "low": 113.92,
      "high": 131.63,
      "suppliers": 3,
      "dated": "09/2026"
    },
    {
      "code": "ZA-SET-L-artisan",
      "kind": "labour",
      "name": "Artisan",
      "unit": "hr",
      "rate": 144.46,
      "low": 144.46,
      "high": 144.46,
      "basis": "BIBC artisan + on-cost",
      "dated": "05/2026",
      "source_url": "https://www.bibc.co.za/registration/wage-schedule"
    },
    {
      "code": "ZA-SET-L-labourer",
      "kind": "labour",
      "name": "Labourer",
      "unit": "hr",
      "rate": 40.53,
      "low": 40.53,
      "high": 40.53,
      "basis": "BIBC general labourer + on-cost",
      "dated": "05/2026",
      "source_url": "https://www.bibc.co.za/registration/wage-schedule"
    }
  ],
  "buildups": [
    {
      "code": "ZA-SET-A-fw_rough",
      "id": "fw_rough",
      "name": "Rough formwork (DoA III)",
      "heading": "Rough formwork (DoA III)  (per m2)",
      "unit": "m2",
      "rate": 203.09,
      "components": [
        {
          "resource": "ZA-SET-M-shutterply",
          "kind": "material",
          "description": "Shutterply 18mm (per m2 of sheet)",
          "quantity": 0.12,
          "unit": "m2",
          "unit_cost": 123.284058
        },
        {
          "resource": "ZA-SET-M-fwtimber",
          "kind": "material",
          "description": "SA Pine 38x114 formwork bearer per m",
          "quantity": 1.5,
          "unit": "m",
          "unit_cost": 44.008696
        },
        {
          "resource": "ZA-SET-L-artisan",
          "kind": "labour",
          "description": "Artisan (hr)",
          "quantity": 0.55,
          "unit": "hr",
          "unit_cost": 144.456
        },
        {
          "resource": "ZA-SET-L-labourer",
          "kind": "labour",
          "description": "Labourer (hr)",
          "quantity": 0.5,
          "unit": "hr",
          "unit_cost": 40.534
        }
      ]
    },
    {
      "code": "ZA-SET-A-bath_no",
      "id": "bath_no",
      "name": "Bath",
      "heading": "Bath  (per no)",
      "unit": "no",
      "rate": 3321.99,
      "components": [
        {
          "resource": "ZA-SET-M-bath",
          "kind": "material",
          "description": "Acrylic bath 1700mm",
          "quantity": 1.0,
          "unit": "no",
          "unit_cost": 1825.478261
        },
        {
          "resource": "ZA-SET-M-copper15",
          "kind": "material",
          "description": "Copper pipe 15mm Class 0 per m",
          "quantity": 3.0,
          "unit": "m",
          "unit_cost": 86.889855
        },
        {
          "resource": "ZA-SET-L-artisan",
          "kind": "labour",
          "description": "Artisan (hr)",
          "quantity": 6.0,
          "unit": "hr",
          "unit_cost": 144.456
        }
      ]
    }
  ]
};
