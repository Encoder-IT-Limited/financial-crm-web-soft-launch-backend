# Reports (Sales & Invoicing) — No Dedicated API, Plus Live API Errors

## 🔴 Critical — `GET /invoices` and `GET /invoices/:id` are currently 500ing

Live-tested twice (confirmed, not a fluke): both endpoints now return HTTP 500
`{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Something went
wrong"}}` — reproduced with and without query params, and with/without the
`x-tenant-subdomain` header. This is a **regression**: earlier in this same
QA pass, `GET /invoices` was live-tested working correctly (55 records,
correct pagination `meta`) for `docs/qa/missing-sales-invoice.md`. Something
changed on the backend since then.

Because `invoiceApi.list()`/`invoiceApi.get()` sit underneath almost
everything in this module, this one backend bug cascades into several
unrelated-looking symptoms:

- **Invoices list page** — would render empty/broken; no invoices ever load.
- **Invoice detail page** — would error for every invoice, even ones that
  exist and were just created.
- **All three Reports tabs** (Sales Report, Invoice Report, Customer
  Statement) — all three call `invoiceApi.list()` per the table below, so all
  three would show empty/broken states right now, not just "no dedicated
  API" as originally documented here.
- **Alerts page** (`alerts.service.ts`) — `alertsApi.list()` runs
  `Promise.all([retainersApi.list(), invoiceApi.listPendingReconciliation(),
  invoiceApi.list()])`; one failing call fails the whole batch, so **no**
  alerts show at all, including retainer-expiry/low-balance alerts that have
  nothing to do with invoices.
- Any flow that fetches an invoice right after creating/updating one — new
  invoice creation, proposal→invoice conversion, recurring-template
  generation, retainer funding — would appear to succeed (the POST/create
  call works) but then fail to show the result.

## 🔴 POS sale detail & receipt also 500

Separate from the above (list endpoint `GET /pos/sales` works fine — only
the single-record routes fail), live-tested on multiple sale IDs including a
refunded one with a linked invoice:

- `GET /pos/sales/:id` — HTTP 500, `INTERNAL_ERROR`. Breaks opening any
  individual sale (refund/void/exchange flows, drill-down from the sales
  list).
- `GET /pos/sales/:id/receipt` — HTTP 500, `INTERNAL_ERROR`. Breaks
  printing/viewing a receipt for any completed sale.

Given the pattern — list endpoints work, but the single-record fetch fails
for both Invoices and POS Sales, two entities that likely share
invoice-joining logic — this and the invoices bug above may be **one root
cause**, not two: worth flagging to the backend team together rather than
chasing separately.

## Everything else — confirmed working, live-tested

Proposals, Recurring templates, Credit/Debit notes, Retainers, Fulfillments,
Customers, Inventory (categories, units, products, warehouses, stock,
movements, batches, transfers), Procurement (suppliers, purchase orders,
goods receipts, purchase invoices), POS (terminals, sessions, sales *list*,
discount rules, barcode lookup), and the public `/plans` endpoint all
returned clean `200`/`success:true` responses.

**Admin-realm endpoints not tested** — no Super Admin credentials available;
confirmed `GET /admin/tenants` correctly 401s with the tenant-realm token
("Super Admin session required"), so these are properly gated, just
untested: `/admin/tenants`, `/admin/plans`, `/admin/payments`,
`/admin/audit`, `/admin/settings`.

---

# Reports Module — No Dedicated API (original finding, still true separately)

`/dashboard/reports` (`reports-page.tsx`) has three tabs — Sales Report,
Invoice Report, Customer Statement — and **none of them call a report API**.
All three fetch the same full lists other pages already use and compute
everything client-side, the same pattern as Inventory's Dashboard/Valuation
(see `docs/qa/unused-apis.md`).

| Tab | What it actually does | API used |
|---|---|---|
| Sales Report | Fetches *every* invoice, buckets into 12 months by hand in JS | `invoiceApi.list()` only |
| Invoice Report | Fetches *every* invoice + every customer, filters by status client-side | `invoiceApi.list()` + `customersApi.list()` |
| Customer Statement | Fetches *every* invoice + *every* adjustment tenant-wide (not scoped to the chosen customer), filters down to one customer, computes a running balance in JS | `invoiceApi.list()` + `customersApi.list()` + `adjustmentsApi.list()` |

## What a real backend would need

1. **`GET /invoices/summary?months=12`** (or similar) — server-side monthly
   invoiced/collected aggregates for the Sales Report, instead of
   downloading every invoice ever created to bucket them in the browser.
2. **`GET /invoices?status=&search=&customerId=`** — already flagged in
   `docs/qa/missing-sales-invoice.md`; fixing it also fixes the Invoice
   Report tab for free, no separate work needed.
3. **`GET /customers/:id/statement`** (or `GET /reports/customer-statement
   ?customerId=`) — a single endpoint returning one customer's invoices,
   payments, and adjustments already merged, sorted, and with running
   balance computed server-side. Today the frontend downloads the *entire
   tenant's* invoices and adjustments just to throw away everyone except the
   one customer selected — this gets worse every time the tenant issues more
   invoices, regardless of which customer is being looked up.
