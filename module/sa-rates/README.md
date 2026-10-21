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

## CPAP escalation (v0.2.0)

A second tab works out the JBCC contract price adjustment for an interim
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

The rates are estimating benchmarks taken from published supplier prices.
Check them against project quotations before any tender award.
