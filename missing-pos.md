# POS — API & Frontend Issues, by Module

## Register / Sales

### API — not working / missing

- **`GET /inventory/stock?warehouseId=` ignores the filter.** Endpoint:
  `GET /inventory/stock`. Returns stock rows for every warehouse regardless
  of the query param — same issue as `GET /invoices` ignoring pagination
  params (see `missing-sales-invoice.md`).
- **Payment `currency` is `null`.** Endpoint: `GET /invoices/:id` (POS-created
  invoices). `payments[].currency` comes back `null` rather than a currency
  code — a different shape of the same currency gap documented for
  invoices/credit notes/retainers elsewhere.
- **`GET /pos/sales` ignores every filter param.** Live-tested `?terminalId=`,
  `?customerId=`, and `?startDate=`/`?endDate=` — all return the identical
  full 62-record list regardless of what's passed, or whether anything is
  passed at all. No terminal, customer, or date/time filtering exists at the
  API level today; either these params need to be implemented, or new
  endpoint(s)/params added, to support filtering sales by terminal, by
  day/hour, and by customer.

### API — could be better

- **No way to record change given/tendered.** Endpoint: `POST /pos/sales`.
  The backend requires `payments[].amount` to sum to the exact amount due —
  `toApiCreateSale()` in `mappers.ts` silently clamps a cash overpayment down
  to match before sending. There's no field anywhere in the payload to record
  what cash was actually handed over vs. change given back (e.g. a
  `payments[].tenderedAmount` alongside the existing `amount`).

### Frontend — not working / missing

- **Currency hardcoded to AED.** `types.ts:3`. Documented in-code as a
  deliberate demo simplification, but this tenant's real currency is `BDT`
  (confirmed live in `missing-sales-invoice.md`).
- **No way to set a manager PIN anywhere in the app.** Endpoint:
  `POST /pos/sales/:id/refund` (and the same gate for discount overrides)
  requires a `managerPin` the backend bcrypt-verifies. No settings page,
  team/user field, or API call anywhere creates or changes this PIN — the
  gate is unusable by a real tenant unless a PIN already exists server-side
  with no way to discover or change it from the app.
- **Damaged-stock tracking exists on the backend but isn't surfaced.**
  Refunding a line as `DAMAGED` via `POST /pos/sales/:id/refund` correctly
  increments a real `damagedQuantity` field returned by
  `GET /inventory/stock` — verified live. No product list, stock view, or
  POS screen displays it. `sales.service.ts`'s own comment claims "no real
  'quarantine' stock status exists in Inventory yet," which is stale.
- **Sales page shows every terminal's sales interleaved, not grouped by
  terminal.** `sales-list.tsx` renders one flat table of all 62+ sales across
  every terminal, sorted however the table's default order is, with only a
  sale-number search and a status filter (`Select`) — no grouping by
  terminal, and no filter by terminal, day/hour, or customer at all. Since
  the backend doesn't support these filters either (see API gap above), this
  needs both a new/rearranged API and the frontend grouping/filter UI built
  on top of it.

---

## Terminals & Sessions

### API — not working / missing

- **No delete endpoint for terminals.** `DELETE /pos/terminals/:id` doesn't
  exist (confirmed live — 404). Only `PATCH /pos/terminals/:id` (status
  ACTIVE/INACTIVE) is available, matching `terminals.service.ts`'s
  `setStatus()`. If a real delete is added, it needs to preserve history —
  existing sales/sessions reference `terminalId`, so a hard delete would
  orphan or corrupt past transaction records; deactivating (already possible)
  or a soft-delete flag are the safe options, not a real row delete.

### Frontend — not working / missing

- **No filter for active vs. inactive terminals.** `terminals-list.tsx`
  renders every terminal returned by `GET /pos/terminals` in one
  `FilterableTable` with no tab/toggle to view active-only, inactive-only, or
  both — deactivated terminals stay mixed into the same list indefinitely.
- **No filters on the Sessions page at all.** `sessions-list.tsx` renders
  every session ever recorded (`GET /pos/sessions`) in one flat table — no
  filter for open vs. closed, no terminal filter, no date range. As session
  history grows this becomes the only way to find a specific shift, with
  nothing to narrow it down.
- **Session cashier identity is a free-text string, not a real employee
  link.** `ApiPosSession` already has a real `cashierId` field (`mappers.ts:32`)
  — presumably the authenticated user who opened the shift — but
  `mapSession()` never reads it, only `cashierName` (whatever string was
  typed into the "Your name" field on Start Shift, which doesn't have to
  match the actual logged-in user). Sessions/Terminals show "who opened, when
  opened" today, but "who" is an unverified free-text name, not a real
  employee reference. Out of scope until an Employees/HR module exists to
  link `cashierId` to — noted here so it's picked up when that module is
  built, not silently left as a free-text field permanently.
- **"New Terminal" and "Start Shift" forms don't reset between opens.**
  `dashboard/pos/components/open-session-dialog.tsx` and the create-mode
  instance of `terminal-form-dialog.tsx` are both mounted permanently and
  only clear their fields via `reset()`, called from inside `onOpenChange` —
  but both dialogs are opened by an external button setting a boolean state,
  not by the dialog's own trigger, so `onOpenChange` (and therefore `reset()`)
  never fires. The previous attempt's access code, cashier name, and opening
  cash stay in the form the next time either dialog opens. Verified the
  backend itself is correct (`PATCH /pos/terminals/:id` access-code changes
  and repeated `POST /pos/sessions` open/close cycles both work correctly
  live) — this is frontend-only. Full detail and fix direction in
  `docs/bugs-report.md`.

---

## Cross-module

### Needs verification

- **Fulfillment/delivery overlap.** Endpoint: `POST /pos/sales` auto-creates
  and auto-fulfills a real invoice server-side (`source: "POS"`, verified
  live) — `mapSale()`'s `row.invoiceId` → `fulfillmentId` mapping. Whether
  this fulfillment is generated by the same backend code path as
  `POST /invoices/:id/fulfill` (used elsewhere in Sales & Invoicing for
  manual fulfillment) or a separate parallel implementation is unconfirmed —
  worth checking so the two don't drift into inconsistent behavior.
