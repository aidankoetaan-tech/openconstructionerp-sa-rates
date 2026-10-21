# SA Rates & Build-ups (`sa-rates`)

Installs a South African rate library into OpenConstructionERP using the
existing Costs and Assemblies endpoints. There's no new backend code. It works
alongside the backend `oe_sa_pack`, which covers SANS 1200, ASAQS, CIDB,
PPPFA and VAT but has no prices.

## What it installs

| Pack | Becomes | Notes |
|---|---|---|
| Material, labour and plant resources | Cost items, `source=setout`, `region=ZA`, ZAR | Rate = City average excl VAT. The supplier low–high range goes in the description |
| Build-ups | Assemblies tagged `setout-za` | Components exclude profit. `bid_factor` = 1 + profit. `regional_factors` = `ZA_CITY` 1.00, `ZA_SMALL_TOWN`, `ZA_RURAL` |

Codes stay the same from one month to the next (`ZA-SET-M-…`, `ZA-SET-L-…`,
`ZA-SET-P-…`, `ZA-SET-A-…`), so installing a new pack updates prices in place:

- Cost items get a PATCH only when their rate, description or unit has changed.
- Assemblies get component unit costs patched where the price moved.
- An assembly whose recipe no longer matches the pack is reported and left
  alone, because someone may have edited it by hand.

## The pack (`setout.za.ratepack/1`)

The pack is a JSON export of the Setout BOQ master build-up workbook. Before
installing anything, the module checks it:

- the schema and currency are correct;
- every component points to a resource that's in the pack;
- every build-up's components, plus profit, give the published rate to within
  one cent.

If any check fails, nothing is installed.

You can load a pack in two ways:

- **Upload the `.json` file.** This always works.
- **Fetch it from a URL** (default `https://setout.co.za/api/ratepack/latest`,
  with an optional access key sent as `X-Setout-Key`). The browser only allows
  this if the server's CSP `connect-src` includes that host. The stock CSP in
  `backend/app/middleware/security_headers.py` doesn't, so on a default
  install use the upload.

## Files

| File | Purpose |
|---|---|
| `manifest.ts` | Registration. The id, route and the nav labelKey's second segment are all `sa-rates` because the sidebar matches dynamic rows on those. The row sits in `grp_cost_data` and is advanced-only |
| `SaRatesModule.tsx` | Page: load, check, install/update, rate table with the three tiers |
| `api.ts` | HTTP: fetch pack, read what's installed, apply the plan with a concurrency limit of 4 |
| `data/ratepack.ts` | Pure logic: types, validation, payload mapping, install plan, component diff |
| `data/*.test.ts`, `SaRatesModule.test.tsx` | vitest (`npx vitest run src/modules/sa-rates`) |

## Rate movers (v0.5.0)

The second tab compares two rate packs, usually last month's and this month's.
The later pack defaults to the one loaded on the Rates tab.

- Items are matched by code. Each resource and build-up is listed with both
  rates, the change in rand and the change as a percentage.
- New and dropped items are flagged. So is an item whose unit changed, and
  no percentage is given for it, because the two rates measure different things.
- For each build-up that moved, the driver is the component whose quantity ×
  unit cost changed the direct cost most, excl profit. It is labelled as a
  price change, a quantity change, or an added or removed component. If the
  pack's profit setting changed, that is reported at the top, and it becomes
  the driver of any build-up whose components did not move.
- Each kind (materials, labour, plant, build-ups) gets the unweighted average
  change across all its items, the count up, down and unchanged, and the
  median of the items that moved.
- The list can be filtered by kind and by a minimum percentage. It downloads as CSV.

If the packs are uploaded in the wrong order, they are swapped by pricing date
and a note says so.

| File | Purpose |
|---|---|
| `data/movers.ts` | Pack comparison, build-up drivers, summaries, CSV (pure) |
| `RateMovers.tsx` | The rate movers tab |

## CPAP escalation (v0.2.0)

The CPAP tab works out the JBCC contract price adjustment for an interim
payment certificate, work group by work group:

    A = 0.85 × V × (Xe / Xo − 1)

- **V:** the work value certified in the work group for the period, excl VAT.
- **Xo:** the work group index for the base month, which is the month tenders closed.
- **Xe:** the index for the valuation period:
  - the month before the certificate date when the certificate is dated on or before the 15th;
  - otherwise the month of the certificate;
  - when more than one new index month has come out since the last certificate, the average of those months.

The 0.85 constant is a setting on the page, and the 15th-of-the-month cut-off is a
parameter of `calculateCertificate` in `data/cpap.ts`. Both defaults follow the JBCC CPAP Indices Application Manual (Series 2000 code
2118, May 2005), clauses 5.1 and 7.1. Stats SA notes that updated manuals are
available from ASAQS, so check the defaults against the manual your contract names.

Indices are the Stats SA release P0151.1, Table 1 (CPAP work group indices),
which are free to use with Stats SA acknowledged. You can paste the table or upload it
as CSV, in either of two layouts:

- work groups down and months across;
- one `work group, month, value` per line.

Decimal commas and the `r` revision mark are read as printed. The August 2026
release is on base Dec 2023 = 100, and Xo and Xe must come from the same base.
Indices are kept in the browser and can be downloaded as CSV.

Not covered:

- certificates after practical completion (manual cl 8.0);
- provisional adjustments (cl 9.0).

The calculator refuses a certificate dated after practical completion rather than estimating it.

| File | Purpose |
|---|---|
| `data/cpap.ts` | Formula, index-month rule, averaging, index import/export (pure) |
| `CpapCalculator.tsx` | The CPAP tab |

## Payment certificate (v0.3.0)

The payment certificate tab produces an interim payment certificate under the JBCC Principal
Building Agreement, Edition 6.2. Its lines follow the order of cl 25.3:

1. Work executed and materials to date. Off-site materials count only when
   they are covered by a guarantee (cl 25.5).
2. Security adjustment, which depends on how the contractor chose to give security:
   - **Fixed guarantee** (cl 11.1.2): 5 % of the value up to the contract sum
     is held back until practical completion, 2.5 % after it, and none in the
     final certificate (cl 25.12). Value above the contract sum, and cost
     fluctuations, are certified in full.
   - **Variable guarantee** (cl 11.1.1): no deduction.
   - **No guarantee** (cl 11.4.1): the employer may withhold up to 10 % of the
     contract sum, 2.5 % after practical completion. The clause sets only the
     ceiling, so the amount withheld to date is entered and capped.
3. Cost fluctuations to date: the amount previously certified plus the amount
   for this certificate. Once the CPAP tab has a complete result (no missing
   indices, no errors), it holds that result in the browser and the
   certificate tab offers a button to use it. Then gross certified, less
   previously certified.
4. Recovery statement amounts (cl 27.1), then tax, then interest, then other
   non-taxable amounts. Each recovery item is placed before or after VAT by the
   user, because the VAT treatment of a penalty or of damages is a tax
   question, not a contract one.
5. Net amount due, which can be negative (cl 25.2).

The payment date is 14 calendar days after the date for issue (cl 25.10).
Subcontractors are due 7 days after that (cl 25.13). On a negative
certificate the contractor pays within 21 days (cl 25.11).

Not covered:

- the final account itself (cl 26);
- NEC and GCC certificates.

| File | Purpose |
|---|---|
| `data/certificate.ts` | Certificate arithmetic, security modes, recovery treatment, dates (pure) |
| `PaymentCertificate.tsx` | The certificate tab |

## Tender adjudication (v0.4.0)

The tender adjudication tab scores a public construction tender under the Preferential
Procurement Regulations, 2022.

- **System.** 80/20 when the estimated Rand value at invitation, including VAT,
  is R50 million or less (reg 4); 90/10 above it (reg 5).
- **Price points.** Ps = W × (1 − (Pt − Pmin) / Pmin), with W = 80 or 90 and
  Pmin the lowest price among responsive tenders only. A tender priced at more
  than double Pmin gets negative price points. The regulations set no floor,
  so the tab flags this instead of clipping it.
- **Specific goal points.** Entered as verified and capped at 20 or 10.
- **Ties** (reg 8). Equal totals go to the tender with more specific goal points.
  A tie on both is reported for the drawing of lots.
- **CIDB grade.** The lowest grade whose tender value limit covers the estimate,
  using the limits in force from 7 October 2019 (Gazette 42561). Where the tender
  data sets a different minimum, enter it and that minimum is used instead.
- **Responsiveness.** A tender is scored only when four checks are answered
  "yes": CSD registration, tax compliance, an active CIDB registration and the
  mandatory returnables. Its class of work and grade must also be adequate. A
  check left pending keeps the tender out, the same as a "no".
- **Price flags.** Prices more than a set percentage (default 15 %) above or
  below the estimate are flagged for a pricing review. The flag does not
  change the score.

The tab does the arithmetic and records the checks. Deciding whether a tender
is responsive, and the award itself, stay with the bid evaluation and
adjudication committees. Functionality scoring and income-generating tenders
(the Pmax formula) are not covered. The evaluation downloads as CSV.

| File | Purpose |
|---|---|
| `data/adjudication.ts` | PPPFA and CIDB arithmetic, responsiveness, ranking, CSV (pure) |
| `Adjudication.tsx` | The adjudication tab |

The rates are estimating benchmarks taken from published supplier prices.
Check them against project quotations before any tender award.
