# Sales & Invoicing — API & Frontend Issues, by Module

Tenant's real currency is **BDT**. Every "hardcoded AED" item below is a live,
user-visible bug for this tenant, not a theoretical one.

---

## Invoices

### API — not working / missing

- **Currency not returned.** Endpoint: `GET /invoices` (also `GET /invoices/:id`). The
  response has no `currency` field at all. Frontend hardcodes `"AED"` for every invoice
  regardless of the tenant's real currency. *Fix: add `currency` to the response.*
- **No pagination.** Endpoint: `GET /invoices`. Ignores `?page=&pageSize=` and
  `?limit=&offset=` query params — always returns the full list (44 records currently),
  no `meta` envelope. *Fix: return a real `{ items, total, page, pageSize }` shape.*
- **No product data to link to.** Endpoint: `GET /products` (or equivalent) —
  **doesn't exist**. Inventory is still local mock data, nothing real to query. This
  blocks the frontend fix below regardless of what Invoices itself does.

### API — could be better

- **`getNextNumber()`'s preview can go stale before save.** Endpoint: `POST /invoices`
  itself is fine — live-tested (created `INV-000047` while sending no number field at
  all, confirming the real number is assigned server-side, correctly, regardless of
  client input). The only real issue is `getNextNumber()`'s client-side
  `` `INV-${list.length + 1}` `` — used purely to *display* a number in the create form
  before saving. If another invoice is created in between, the previewed number won't
  match what's actually assigned on save. Cosmetic, not a data-integrity bug.

### Frontend — not working / missing

- **No way to add a product line — every line is free text.** `LineDraft` (the type
  behind the line-items editor) has no `productId`, `warehouseId`, or mode field at
  all: `{ id, description, quantity, unitPrice, taxRate }`. Confirmed as a real
  regression — the reference UI branch (`dev-nafis-v0.1`) has a working
  `product-picker.tsx` + its own demo catalog; both are gone from this branch. The
  backend is half-ready for this already — `POST /invoices` accepts a `productId` per
  line, and `GET /invoices` returns it back — the UI just never sets it.
- **No pagination controls on the Invoices list.** Hand-rolled `useReactTable` table
  (kept custom for bulk row-select + CSV export) has no `getPaginationRowModel()`, no
  pagination state, nothing — renders every invoice in one unbounded table.

### Frontend — could be better

- **Screen split into small components was lost.** What used to be 4 files
  (`invoices-list.tsx`/`invoices-table.tsx`/`invoices-toolbar.tsx`/`invoices-mobile-list.tsx`)
  is now one `invoices-page.tsx`; what used to be 2 files
  (`new-invoice-form.tsx`/`new-invoice-actions.tsx`) is now one `new-invoice-page.tsx`;
  what used to be 6 files (detail page + details/history/payment-history/adjustments
  cards + columns) is now one `invoice-detail-page.tsx`. Nothing is functionally lost,
  but the small-components discipline this project held earlier is gone — worth a
  cleanup pass.

---

## Proposals

Shares `line-items-editor.tsx` with Invoices, so the same product/service line gap
applies here identically — see Invoices above.

### API — could be better

- **`getNextNumber()`'s preview can go stale before save.** Endpoint: `POST /proposals`
  assigns the real number server-side (same pattern as Invoices, verified there). Same
  stale-preview caveat applies to the client-side `` `PRO-${list.length + 1}` ``.

### Needs verification

- **Convert-to-Invoice correctness.** Endpoint: `POST /proposals/:id/convert`. Calls a
  real endpoint but wasn't traced through to confirm the resulting invoice matches
  spec.

---

## Credit & Debit Notes

### API — not working / missing

- **Currency not returned.** Endpoints: `GET /credit-notes`, `GET /debit-notes`. Same
  issue as Invoices — no `currency` field in either response. Frontend hardcodes
  `"AED"` in both mappers.

### API — could be better

- **`getNextNumber()`'s preview can go stale before save.** Endpoints:
  `POST /credit-notes`, `POST /debit-notes`. Both assign the real number server-side —
  live-tested on credit notes (`CN-000011` assigned correctly). Same stale-preview
  caveat as Invoices, separately for the `CN-`/`DN-` sequences.

### Frontend — not working / missing

- **`linkedReturn` can never be set to `true`.** Endpoint: `POST /credit-notes`. The
  API already accepts and returns this field (confirmed real `linkedReturn`/
  `refundAmount` fields on actual records), and the frontend does send it on create —
  but always as the hardcoded literal `false`. There's no "this credit note is for a
  physical return" checkbox anywhere in the UI, so the option both client and server
  are wired for can never actually be used. *Also needs a decision on what should
  happen on the Inventory side when it's `true` — that part isn't built anywhere yet,
  separate from this UI gap.*

---

## Recurring Templates

### API — not working / missing

- **Currency not returned.** Endpoint: `GET /recurring-templates`. Same issue as
  Invoices — no `currency` field in the response; `mapTemplate()` hardcodes `"AED"`.

### Frontend — not working / missing

- **`autoSend` can never be turned on.** Endpoints: `GET /recurring-templates` (returns
  a real `autoSend` field per template) and `POST /recurring-templates` (create).
  `mapTemplate()` never reads the field the GET response already has, and the create
  call always sends `autoSend: false`. No toggle exists anywhere in the UI to change
  this.
- **No pagination.** Endpoint: `GET /recurring-templates`. The panel renders every
  template returned in a plain `<table>` + `.map()`, no pagination at all. Lower
  severity than Invoices (naturally a much smaller list), but the same gap.

### Needs verification

- **Generation correctness.** Endpoint: `POST /recurring-templates/:id/generate`. Real
  and callable, but whether the resulting invoice (amount, source, retainer-topup
  variant) is actually correct wasn't exercised — would require a write call.

---

## Retainers

### API — not working / missing

- **Refund doesn't validate the requested amount against the remaining balance.**
  Endpoint: `POST /retainers/:id/refund`. Live-tested: created a retainer with
  `contractAmount: 50`, requested a refund of `9999` — the backend didn't reject it, it
  silently refunded the actual remaining balance (`50`) instead and closed the
  retainer, with no error or warning that the requested amount didn't match what was
  processed. A caller (or a UI bug) requesting more than the balance gets no signal
  that anything was capped.
- **New retainers default to the wrong currency.** Endpoint: `POST /retainers`.
  Live-tested on this tenant (real currency `BDT`): a freshly created retainer came
  back with `"currency":"AED"`. This is a backend default, not a frontend hardcode —
  `mapRetainer()` correctly reads whatever `currency` the response contains, so every
  retainer this tenant creates is silently mislabeled AED at the source.

### API — could be better

- **Failed actions lose the real error reason.** Endpoints:
  `POST /retainers/:id/draw`, `POST /retainers/:id/transfer`,
  `POST /retainers/:id/refund`. All three are called from `drawForInvoice()`,
  `transfer()`, `requestRefund()` respectively, which catch the backend's `ApiError`
  (it carries a real `message`) and collapse it to a bare `false` — the specific reason
  (insufficient balance, retainer not active, permission denied, etc.) never reaches
  the user; they just see a generic failure. *Fix: stop discarding `err.message`,
  surface it in the failure toast.*

### Needs verification

- **Forfeit/Refund permission enforcement.** Endpoints: `POST /retainers/:id/forfeit`,
  `POST /retainers/:id/refund`. Frontend gates these behind
  `can(me, "retainer.approve")` — unconfirmed whether the backend independently
  enforces this too, or only relies on the frontend check.

Document numbering (`retainerNumber`, assigned server-side by `POST /retainers`) is
correct — confirmed live (`RET-000020`).

---

## Reports

### Needs verification

- **CSV export mechanism.** No specific endpoint identified — unconfirmed whether
  "Export CSV" hits a real backend endpoint or is generated client-side from data
  already fetched via the Invoices/Customers/Adjustments endpoints above.

---

## Cross-module

- **Inventory has no real Products API at all.** Endpoint: `GET /products` (or
  equivalent) — **doesn't exist anywhere**. Blocks the product-line fix for both
  Invoices and Proposals no matter what those modules do on their own. Tracked
  separately in `docs/missing-inventory.md`.
- **POS is not ready to integrate with real products.** Endpoint:
  `POST /invoices/:id/fulfill` (called via `invoiceApi.fulfill()`) exists and looks
  ready — accepts `warehouseId`, `lines`, `trigger` — but it's fed by `Invoice.lines`,
  which can't carry a `productId` today (see Invoices above). POS currently runs
  against its own separate local demo catalog instead (`dashboard/pos/`), not connected
  to this module or `fulfill()` at all.
- **Delivery note document.** Endpoint: `POST /invoices/:id/fulfill` accepts a
  `generateDeliveryNote` flag and the response includes a `deliveryNoteNumber`, but
  whether a real printable document exists on the other end (vs. just the number being
  stored) is unconfirmed.
