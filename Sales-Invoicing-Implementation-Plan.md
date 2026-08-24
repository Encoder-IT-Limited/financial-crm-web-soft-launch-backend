# Sales & Invoicing Implementation Plan

## Overview

Migration of the Billing module from Zustand to React Query and expansion of the Sales/CRM suite to include Customers, Proposals, Credit/Debit Notes, and Retainers.

## Current State (baseline — pre-migration snapshot)

| Spec item | Status |
| :--- | :--- |
| Invoices (list/create/edit/detail) | Built, full — TanStack table, filters, bulk actions, PDF preview, status-gated actions, payment history, audit timeline |
| Recurring Invoices | Built, full — but a tab inside `/dashboard/invoices`, not its own nav item; manual "Generate now" only, no scheduler |
| Payments | Built, full — RecordPaymentDialog, partial/full payment logic |
| Customers | Data model + CRUD exist; page is ComingSoon stub |
| Estimates | Missing entirely — no route, no type, not even a stub |
| Proposals | ComingSoon stub, no type |
| Credit/Debit Notes | ComingSoon stub at `/dashboard/credit-notes` (single combined route), no type; docs only spec a credit_notes table |
| Retainers | ComingSoon stub, no type |
| Reports | ComingSoon stub |

Everything real was built on `useInvoicesStore` (Zustand, localStorage-persisted) — the tenant portal never went through the Zustand→React Query migration the admin portal did. This table is kept as the original baseline; see **Progress Snapshot** below for what's actually landed since.

## Progress Snapshot (updated)

**Phase A is complete**, verified against the actual working tree (not just this doc):

- ✅ `modules/crm/` exists in full: `types.ts`, `schemas.ts`, `mock/seed.ts`, `api/customers.service.ts`.
- ✅ `invoices.service.ts` owns its data in-memory directly (no more Zustand delegation); has `InvoiceSource`, `getNextNumber()`, `getOrgProfile()`.
- ✅ `recurring.service.ts` exists and fully replicates the old store's logic.
- ✅ All Zustand call sites migrated: `recurring-templates-panel.tsx`, `recurring-template-dialog.tsx`, `invoice-preview-dialog.tsx`, `add-customer-dialog.tsx`, `record-payment-dialog.tsx`, `dashboard/invoices/page.tsx`, and — as of this check — `dashboard/invoices/new/page.tsx` and `dashboard/invoices/[invoiceId]/page.tsx` too. Repo-wide grep for `invoices-store`/`recurring-store`/`useInvoicesStore`/`useRecurringStore` returns zero hits.
- ✅ `store/invoices-store.ts` and `recurring/store/recurring-store.ts` are **deleted** (confirmed via `git status`).
- ✅ Sales Dashboard KPI wiring done: new `components/sales-dashboard.tsx` (StatTiles, 6-month invoicing trend, status breakdown, recent invoices/payments), wired into `(tenant)/dashboard/page.tsx` — this was listed as "not started" in an earlier revision of this doc but is in fact built.
- ✅ Verified clean: `tsc --noEmit` has zero errors; `eslint` on the tenant tree has zero errors (two pre-existing warnings unrelated to this migration — a TanStack Table `react-hooks/incompatible-library` notice on the invoices list, not a regression).
- ✅ **Phase B (Customers/CRM) is done**: `Customer` extended with `customerCode`/`creditLimit`/`openingBalance`/`status`; `/dashboard/customers` list (`FilterableTable`, search + status filter, live Outstanding column) and `/dashboard/customers/[customerId]` detail page (StatTiles + Overview/Invoices/Payments/Proposals/Credit Notes tabs) are both live; full CRUD (`customersApi.create/update/remove`) wired through React Query. Quick-create (`AddCustomerDialog`, used from invoice/recurring flows) is untouched — the service fills the new fields' defaults.
- ✅ **Phase C (Proposals) is done**: `Proposal` type + `proposalDisplayStatus()` (same overdue-style derivation as invoices) added to `modules/billing/types.ts`; `proposalsApi` (`list/get/getNextNumber/create/update/send/reject/convertToInvoice`); `/dashboard/proposals` list, `/dashboard/proposals/new` (create + edit), `/dashboard/proposals/[proposalId]` detail with Send/Reject/Convert actions. Convert-to-Invoice creates a draft `Invoice` with `source: "estimate"` and links back via `convertedInvoiceId`. Shared `InvoiceSummaryCard` extracted and used by the new Proposal form. Customers' Proposals tab (Phase B's placeholder) now shows real data.
- ✅ **Phase D (Credit & Debit Notes) is done**: one `Adjustment` type (`kind: "credit" | "debit"`) rather than two near-identical types; `adjustmentsApi` (`list/get/getNextNumber/create/void` — notes are issued immediately on create, no draft stage); `/dashboard/credit-notes` combined page with a Credit/Debit `Tabs` switch over `FilterableTable`; issuing via `AdjustmentFormDialog`, viewing/voiding via `AdjustmentDetailsDialog`. `adjustmentsForInvoice()`/`adjustedInvoiceBalance()` derive an invoice's post-adjustment balance without mutating the invoice; the Invoice detail page's Balance Due tile and a new Adjustments card now reflect it.
- ✅ **Phase E (Retainers) is done**: `Retainer` type with a `usage: RetainerUsage[]` log and `retainerUsedAmount()`/`retainerPercentUsed()` helpers; `retainersApi` (`list/get/create/update/recordUsage/setStatus`). `/dashboard/retainers` list (`FilterableTable`) with a details modal (not a full page — proportionate to the entity, same call as Adjustments) showing usage history and Record Usage / Pause / Resume / Close actions. Recording usage is blocked client-side from exceeding the remaining balance and auto-closes the retainer at zero. No auto-invoice-generation anywhere in the flow.
- ✅ **Phase F (Reports) is done**: `/dashboard/reports` (`ReportsPage`) now has three tabs — Sales Report (12-month invoiced-vs-collected table + StatTiles), Invoice Report (`FilterableTable` over all invoices with a status filter), Customer Statement (per-customer running-balance ledger merging invoices/payments/issued adjustments). All three export to CSV via the existing `downloadCsv` helper. `/reports/vat`, `/reports/corp-tax`, `/reports/scheduled` untouched.
- ✅ **Phase G (Component Refinement) is done**: Invoices' own create/edit form swapped onto the shared `InvoiceSummaryCard` (the last outstanding item); everything else in Phase G — `FilterableTable` standardization on every new list, per-entity status badges — had already landed incidentally while building Phases B–F.

**All of Phases A–G are done.** Every item in this plan has landed and is verified clean (`tsc`/`eslint`).

**Phase H (Retainer Enhancements) is done** — see its own section below; `tsc --noEmit` and `eslint` both clean across the whole project (only pre-existing, unrelated warnings/errors remain — the TanStack Table `react-hooks/incompatible-library` notices, and missing `date-fns`/`recharts`/`react-day-picker`/`@tiptap/*` packages for other, unrelated in-progress modules). Not yet exercised in a running browser, per the standing tsc/lint-only verification rule. **Process note**: this doc was updated in the same pass as every file touched under Phase H — sub-items, the Files table's Status column, and mid-build discoveries (the removed `RecordUsage` path, the `can()` wildcard fix) are all reflected below, the same discipline Phases B–G's "not originally listed as its own row" entries show.

**Phase I (Delivery / Fulfillment) is mostly built** — see its own section below. I-A (types/mock service), I-B (manual fulfillment UI), I-D (POS auto-trigger, written but unreachable until POS exists), and I-E (negative-stock alerting) are done; I-C (delivery note PDF) and I-F (real Inventory swap) are not. Verified: `tsc --noEmit` and `eslint` both clean on every touched file.

## Key Decisions

1. **State management**: Migrate billing to React Query + in-memory mock services, matching the admin pattern (`tenants.service.ts` / `payments.service.ts`). Zustand's localStorage persistence has already caused a stale-field bug once.
2. **CRM split**: Split `Customer` into a new `modules/crm/` now, before Estimates/Credit Notes/Retainers add more coupling to billing.
3. **Estimates vs Proposals**: Same concept under two names; merged into the existing "Proposals" nav item using the richer Estimate status set (`draft/sent/accepted/rejected/expired`).
4. **Folder/route naming**: Keep existing `modules/billing/` folder and `/dashboard/*` routes — renaming to `modules/sales/` + `/sales/*` is pure churn with no functional benefit.
5. **Credit/Debit Notes routing**: Keep the existing single combined route/nav item (`/dashboard/credit-notes`) with an internal tab switch, rather than splitting into two nav items.
6. **Retainer Refund reuses Adjustments, not a new concept** (Phase H): a retainer refund is issued as an `Adjustment(kind: "credit")` against the retainer's funding invoice, then run through the existing `convertToInvoice()` — same "every dollar has a document" pattern already built for standalone credit notes, rather than a parallel refund mechanism.
7. **Retainer top-ups reuse the Recurring Invoices engine, not a new scheduler** (Phase H2): `RecurringTemplate` gains an optional `kind`/`retainerId` rather than building a second templates-and-cadence system; `advanceDate()` and the manual "Generate now" trigger are shared as-is, and stay manual — no scheduler, matching the existing Recurring Invoices UX exactly.
8. **Expired is derived, never stored** (Phase H3): `retainerDisplayStatus()` follows the exact `invoiceDisplayStatus()`/`proposalDisplayStatus()` pattern — `RetainerStatus` itself gains no `"expired"` value.
9. **Forfeit/Refund gating uses the existing `can()` primitive, not new RBAC**: one new permission string (`retainer.approve`) checked the same way every other `can(me, ...)` call already works in this codebase — deliberately not scoped as "build a permission system."

The following decisions (#10–#14) resolve everything section B/C/E/D left unanswered in
`docs/source/client-qa-retainers.md`. None were re-confirmed by the client — each is inferred from a
philosophy the client *did* state elsewhere in their answers, recorded here so the reasoning
survives even if the specific answer later changes:

10. **Overdraw stays a permanent hard cap — no manual-approval override, ever** (resolves E's overdraw sub-question). The client only ever gated *removing* value (Forfeit/Refund need approval); nothing in their answers suggests *creating* value (an overdraw exception) should ever be allowed, approved or not. A draw or split can never exceed what's currently in the retainer.
11. **Every draw generates a real Invoice — no invoice-less log entries going forward** (resolves B's first sub-question). Matches the "every dollar has a document" principle behind A's answer and the existing credit/debit-note-to-invoice pattern. `RetainerUsageDialog`'s free-text-only path is retired for new draws; all usage goes through `drawForInvoice()`.
12. **Draws are always auto-paid when the retainer covers them — no confirm-first step** (resolves B's second sub-question). A's own wording — "mark as paid if funding can cover all" — reads as a direct instruction, not an invitation to add a review gate.
13. **Split/partial draws are allowed, using the existing `"partially-paid"` invoice status — no new mechanism** (resolves B's third sub-question). "Pay from Retainer" is offered even when the balance won't fully cover the invoice; it pays what it can as a partial payment (`method: "retainer"`), the rest stays owed exactly like any other partially-paid invoice today.
14. **Unused balance rolls over, both per-cycle and at contract end — never resets/forfeits by default** (resolves C's rollover sub-question, extending D/E's contract-end answer to the recurring case). The client's own default for leftover balance at contract end is Transfer/Roll-over, not Forfeit — Forfeit is the *exception* requiring approval. Applying that same preserve-by-default posture to each recurring cycle is the consistent read, not a new policy.

## Phase-by-Phase Implementation

### Phase A: Foundation & Migration
- **CRM Split**: Move `Customer` type and CRUD logic to new `modules/crm/`; repoint all billing imports.
- **State Migration**: Rework `invoices.service.ts` to own its in-memory data directly (admin service pattern) instead of delegating to Zustand; same for recurring templates. Delete both stores when no call sites remain.
- **Schema Updates**:
  - Add `source: "manual" | "estimate" | "recurring" | "pos"` to `Invoice` (default `"manual"`, `"recurring"` when generated from a template, `"estimate"` on conversion).
  - Add optional `productId`/`warehouseId` to `InvoiceLine` — unused today, forward-compat for the future Inventory module.
- **Dashboard**: Replace hardcoded KPIs on the Sales Dashboard home page with real data derived from services (KPI cards, trend chart, invoice-status chart, quick actions, recent invoices/payments). ✅ Done.

### Phase B: Customers (CRM) — ✅ Done
- **Types**: Extended `Customer` with `customerCode`, `creditLimit`, `openingBalance`, `status` — existing invoice references (`customerId: string`) untouched, no breakage.
- **List View**: `/dashboard/customers` on `FilterableTable` — search (name/code/email), status filter, Outstanding (live, derived from invoices) and Credit Limit columns, row click → detail page, inline Edit/Delete.
- **Detail View**: `/dashboard/customers/[customerId]` with tabs: Overview (contact info + opening balance), Invoices (`SimpleTable`, linked to invoice detail), Payments (flattened across the customer's invoices), Proposals (`SimpleTable`, wired once Phase C landed), Credit Notes (still a "coming soon" panel until Phase D). Header carries Edit/Delete actions and a StatTiles row (Total Invoiced / Outstanding / Collected / Credit Limit).
- **Quick-create unaffected**: `AddCustomerDialog`'s schema is untouched — the service fills `customerCode`/`creditLimit`/`openingBalance`/`status` defaults on create, so the invoice-creation "+ New customer" flow doesn't need the new fields.
- Verified: `tsc --noEmit` and `eslint` both clean.

### Phase C: Proposals (merged with Estimates) — ✅ Done
- **Types**: `Proposal` (number, customerId, date, expiryDate, lines reusing the `InvoiceLine` shape, totals, `status: draft|sent|accepted|rejected`) added to `modules/billing/types.ts`, alongside `proposalDisplayStatus()` — same overdue-style derivation pattern as invoices (`sent` + past `expiryDate` → `expired`, never stored).
- **CRUD**: `/dashboard/proposals` (`FilterableTable`, search + status filter, pipeline-value StatTiles), `/dashboard/proposals/new` (create + `?edit=<id>` for drafts, reuses `LineItemsEditor`), `/dashboard/proposals/[proposalId]` (detail — Send/Reject/Convert actions gated by status, history timeline).
- **Conversion**: "Convert to Invoice" (`proposalsApi.convertToInvoice`) creates a draft Invoice with `source: "estimate"` via `invoiceApi.create`, prefilled from the proposal's lines and discount, marks the proposal `accepted` with `convertedInvoiceId` linking to it, and navigates to the new invoice. A converted proposal can't be converted again (checked via `convertedInvoiceId`).
- **Shared component**: `InvoiceSummaryCard` extracted (subtotal/discount/VAT/total + editable discount field) — used by the new Proposal form now; Invoices' own create form still has its inline equivalent (not refactored onto the shared component yet — tracked under Phase G, non-blocking).
- **Customer detail integration**: the Customers detail page's Proposals tab (built in Phase B as a placeholder) now shows the customer's real proposals via `SimpleTable`.
- Verified: `tsc --noEmit` and `eslint` both clean.

### Phase D: Credit & Debit Notes — ✅ Done
- **Types**: Implemented as one `Adjustment` type with a `kind: "credit" | "debit"` discriminator rather than two separate `CreditNote`/`DebitNote` types — matches docs §33.16 (only `credit_notes` is specced; debit notes mirror the same shape with the balance effect inverted) and avoids duplicating amount/reason/status/invoiceId across two near-identical types. `status: "issued" | "void"` — no draft stage; a note records something that already happened (a refund, a correction), not a document to be sent and awaited, so `adjustmentsApi.create` issues it immediately.
- **UI**: `/dashboard/credit-notes` kept as the combined route (`AdjustmentsPage`) with an internal Credit/Debit `Tabs` switch, each tab a `FilterableTable`. Creating uses a lightweight `AdjustmentFormDialog` (customer, optional linked invoice scoped to that customer, amount, reason) rather than a full page — proportionate to a 4-field record, unlike Invoices/Proposals' multi-line documents. Viewing uses `AdjustmentDetailsDialog` (built on the shared `EntityDetailsDialog` shell) with a "Void this note" action.
- **Integration**: `adjustmentsForInvoice()` / `adjustedInvoiceBalance()` (in `modules/billing/types.ts`) derive an invoice's balance after its linked, non-voided notes — never stored on the invoice itself, so voiding a note instantly stops affecting it. The Invoice detail page's "Balance Due" tile now shows this adjusted figure (with an "after adjustments" sub-label when notes exist) and gained an "Adjustments" card listing each linked note with its effect (credit shown as `−`, debit as `+`).
- **Post-launch addition (not in the original spec)**: a standalone note — one issued with no linked invoice — never showed up anywhere as a document. Added `adjustmentsApi.convertToInvoice()` (mirrors `proposalsApi.convertToInvoice`): generates a draft Invoice for the note's amount and retroactively links the note to it — positive-value (`source: "debit-note"`) for a Debit Note, since it increases what's owed and needs something payable behind it; **negative-value (`source: "credit-note"`) for a Credit Note**, per explicit client direction, so the amount owed *back* to the customer is reflected as a real invoice/ledger entry rather than an unlinked record. Both are new `InvoiceSource` values. Surfaced in `AdjustmentDetailsDialog` as a "Convert to Invoice" action, shown for any standalone, issued note regardless of kind, with kind-specific explainer copy.

### Phase E: Retainers — ✅ Done
- **Types**: `Retainer` (customerId, contractAmount, billingPeriod, remainingBalance, status, `usage: RetainerUsage[]`) in `modules/billing/types.ts`, plus `retainerUsedAmount()`/`retainerPercentUsed()` helpers.
- **CRUD**: `/dashboard/retainers` list (`FilterableTable`, status filter, contracted/remaining StatTiles). Create/Edit share one `RetainerFormDialog` (contract amount locked once created — editing a live contract's principal would silently invalidate its usage history). View is a details modal (`RetainerDetailsDialog`, built on `EntityDetailsDialog`) rather than a full page — proportionate to the entity's size, same reasoning as Adjustments.
- **Balance tracking (original scope)**: `RetainerUsageDialog` records a free-text usage entry and decrements `remainingBalance` (blocked client-side if the amount would exceed it); the retainer auto-closes when the balance hits zero. Pause/Resume and manual Close are separate actions. Kept as-is for consumption you're tracking but not billing as its own invoice.
- **Post-launch addition (not in the original spec) — retainers connected to real invoices**: raised by the client — a retainer with no invoice behind it wasn't a real accounting transaction. Two additions, both reusing the "every dollar has a document" pattern from the credit/debit-note conversion:
  - **Funding**: `retainersApi.create` now also generates and immediately pays an Invoice for the full contract amount (`source: "retainer"`), stored on the retainer as `fundingInvoiceId`. Surfaced as a "Funding Invoice" link in `RetainerDetailsDialog`.
  - **Drawing**: `retainersApi.drawForInvoice()` is the invoice-linked counterpart to manual usage — when creating a new Invoice for a customer with an active, sufficiently-funded retainer, `dashboard/invoices/new/page.tsx` offers a **"Pay from Retainer"** checkbox (only in combination with "Create & Send" — pre-paying a draft doesn't make sense). On save it deducts the balance, logs a usage entry referencing the invoice, and records an invoice payment with a new `PaymentMethod` value, `"retainer"` — deliberately **excluded** from `RecordPaymentDialog`'s manual method list, since picking it there wouldn't actually touch a retainer's balance.
  - Client-facing questions this build deliberately leaves open (asked, not assumed): recurring/periodic retainer top-ups, rollover-vs-reset of unused balance, contract expiry policy (forfeit/refund/rollover), and refunds. None of those are built — this addition only connects the *existing* one-time, no-expiry retainer model to real invoices.
- Verified: `tsc --noEmit` and `eslint` both clean.

### Phase F: Reports — ✅ Done
- **Implementation**: Built inside the existing `/dashboard/reports` ("All Reports") page (`ReportsPage`) as three tabs:
  - **Sales Report** — StatTiles (Total Invoiced / Collected / Outstanding) + a 12-month Invoiced-vs-Collected table, CSV export.
  - **Invoice Report** — every invoice on `FilterableTable` with a status filter, CSV export (mirrors the columns already used on the Invoices list).
  - **Customer Statement** — pick a customer, see a running-balance ledger (opening balance + every non-cancelled invoice, payment, and issued credit/debit note sorted by date), CSV export.
- Not touching `/reports/vat`, `/reports/corp-tax`, `/reports/scheduled` — separate tax-specific pages outside this spec, untouched.
- Verified: `tsc --noEmit` and `eslint` both clean. One bug caught by lint and fixed: the Customer Statement's running-balance column was first written with a `let` reassigned inside `.map()` during render — flagged by the `react-hooks/immutability` rule; rewritten as a `.reduce()` that builds the balance functionally instead.

### Phase G: Component Refinement — ✅ Done
- **Standardization**: Every new list (Customers, Proposals, Credit/Debit Notes, Retainers) uses `FilterableTable`/`TableToolbar`/`TablePagination` from the start. The Invoices list itself stays on its existing hand-rolled table — it has bulk row-selection, CSV export, and sortable columns `FilterableTable` doesn't support, so swapping it would be a downgrade, not a refinement; left as-is deliberately, not an oversight.
- **Shared UI**: `InvoiceSummaryCard` (subtotal/discount/VAT/total, exported `SummaryRow` for extra rows) extracted and used by both create/edit forms — Proposals from the start, and Invoices' own form (`dashboard/invoices/new/page.tsx`) swapped over from its inline duplicate, passing Paid/Balance-due as `extraRows` (Proposals has none, since it has no payment concept).
- **Badges**: `ProposalStatusBadge`, `AdjustmentStatusBadge`, `CustomerStatusBadge`, `RetainerStatusBadge` — all match the existing `InvoiceStatusBadge`/admin `StatusBadge` convention (a `STATUS_CONFIG` map of label + `Badge` tone).
- `fmtMoney` already covers CurrencyFormatter — no new component needed, as originally noted.

### Phase H: Retainer Enhancements (client Q&A round 2) — ✅ Done

Follow-up to Phase E, driven by `docs/source/client-qa-retainers.md`. The client confirmed retainers
can be one-time **or** recurring, that contracts have an end date with Transfer/Roll-over as
self-serve dispositions (Forfeit/Refund needing approval), and that all retainer activity
should surface in the Customer Statement. The remaining open sub-questions (section B in
full, per-cycle rollover-vs-reset, manual-vs-auto top-up generation, overdraw policy, and who
approves Forfeit/Refund) were resolved by inference from the client's own stated philosophy —
recorded as Key Decisions #6–14. **These are working defaults, not re-confirmed by the
client** — worth a quick sanity check with them, but built and shipped in the meantime.

- **H1 — Split/partial draws** — ✅ Done (Key Decision #8). `retainersApi.drawForInvoice()` now draws `Math.min(invoice.total, remainingBalance)` instead of requiring full coverage; `invoiceApi.recordPayment` already turns a partial draw into `"partially-paid"` the normal way. `dashboard/invoices/new/page.tsx`'s "Pay from Retainer" checkbox is offered whenever the retainer has *any* remaining balance, with copy that distinguishes full vs. partial coverage. No `RecordPaymentDialog` changes were needed — a retainer partial payment is just another `Payment` row.
- **H2 — Recurring top-ups** — ✅ Done (Key Decisions #7/#14). `Retainer.billingModel: "one-time" | "recurring"` added. `RecurringTemplate` gained `kind?: "invoice" | "retainer-topup"` and `retainerId?`; `recurring.service.ts`'s `generate()` special-cases a retainer template — creates a Paid invoice (`source: "retainer-topup"`, `method: "bank-transfer"` since it's money *arriving*, not a draw) and calls the new `retainersApi.topUp()`, which **adds** to the balance, never resets it. New `RetainerTopUpSetupDialog` (creates the template) and a "Recurring top-up" panel + "Generate Top-Up Now" button in `RetainerDetailsDialog`, reusing `recurringApi.generate()` as-is.
- **H3 — Contract expiry & disposition** — ✅ Done (Key Decisions #6/#9/#11). `Retainer.expiryDate` added; `retainerDisplayStatus()` derives `"expired"` the same never-stored way `invoiceDisplayStatus()`/`proposalDisplayStatus()` do. **Transfer** (`RetainerTransferDialog`) and **Roll Over** (`RetainerRolloverDialog`, no new funding invoice — the money's already documented on the original contract, linked via `rolledOverFromRetainerId`) are self-serve. **Forfeit** and **Refund** (`RetainerRefundDialog`, reuses `adjustmentsApi.create()` + `convertToInvoice()` as a *standalone* credit note — `convertToInvoice` only acts on notes with no linked `invoiceId`, so the funding invoice is referenced in the reason text instead) are gated behind `can(me, "retainer.approve")`. Overdraw stays a permanent hard cap everywhere (Key Decision #6) — `drawForInvoice`/`transfer`/`rollOver` all cap at what's actually available.
- **H4 — Expiry & low-balance alerts** — ✅ Done (Key Decision #12), scoped as its own mini-module rather than a one-line addition: new `(tenant)/modules/alerts/` (`types.ts`, `api/alerts.service.ts`, `components/alerts-list.tsx`) computes alerts live from retainer data on every read — no stored alerts table, nothing to keep in sync with a background job that doesn't exist. Thresholds (14 days, 20% remaining) live in one exported `RETAINER_ALERT_THRESHOLDS` constant, ready to wire to a real Settings field once tenant Settings exists. `/dashboard/alerts` replaced its `ComingSoon` stub.
- **H5 — Reporting completeness** — ✅ Verified, no changes needed. Every H1–H3 action routes through real Invoices/Payments/Adjustments, so the Customer Statement picks them up automatically. Checked: no page currently renders `InvoiceSource` as a label anywhere (including the invoice detail page), so `"retainer-topup"` needed no new label mapping; `PAYMENT_METHOD_LABELS` already covered every method used.
- **Customer detail parity** — ✅ Done. Added a **Retainers** tab to `customer-detail.tsx` (`SimpleTable`, click-through to `RetainerDetailsDialog`/`RetainerFormDialog`, same pattern as the Invoices/Proposals tabs).
- **Retired, not carried forward**: `retainersApi.recordUsage()`, `RecordUsageInput`, `recordUsageSchema`, and `RetainerUsageDialog` (the free-text, invoice-less usage log) were deleted outright rather than left dead — Key Decision #11 explicitly retires this path in favor of every draw going through `drawForInvoice()`. The underlying `usage: RetainerUsage[]` history array stays; only the manual-entry mechanism is gone.
- **Build-time fix, not originally scoped**: `can()` (`lib/permissions/index.ts`) didn't honor the dev mock identity's `permissions: ["*"]` — every `can()` check silently returned `false` outside the `admin` realm regardless of the wildcard, which would have made `retainer.approve` unreachable in dev. Added a wildcard check; one line, no new permission concepts.

### Phase I: Delivery / Fulfillment — ✅ I-A/I-B/I-D/I-E done; I-C/I-F not built

The one join point between this module and Inventory that the client directly specified
but that doesn't exist anywhere in the codebase yet: **inventory should deduct at the
moment goods actually leave the warehouse — automatically for POS, manually (or via a
delivery note) for B2B invoices — not at the moment an invoice is created or sent.** See
`docs/requirements/Client-Requirements-Phase1.md` §5.1 and
`docs/source/client-qa-inventory-pos-tenant.md` Q12 for the exact client wording.

**Key Decisions (I1–I5):**

1. **Fulfillment is its own entity, not a status flag on Invoice.** An invoice can be
   partially fulfilled (5 units ordered, 3 shipped today, 2 next week) — that needs a
   real record of *what* shipped *when*, not a boolean. Extends the "every dollar needs
   a document" precedent from Adjustments/Retainers to "every stock movement needs a
   document."
2. **Lives inside this module's own route folder** (`dashboard/invoices/fulfillments/`
   for types, sibling to `recurring/`) — triggered from and owned by an Invoice, per Key
   Decision #4's file-organization rule (every related file inside its corresponding
   route folder, no separate module for a feature this coupled to Invoices). The mock
   service and zod schema, however, follow the existing convention of living flat in the
   shared `api/fulfillments.service.ts` and `schemas.ts` respectively — every other
   sub-domain (Recurring, Retainers) does the same rather than nesting its own `api/`/
   `schemas.ts` inside its type subfolder; discovered mid-build, not in the original I2
   wording, which assumed a fully nested `fulfillments/api/`+`fulfillments/schemas.ts`.
3. **Built against the same isolated demo catalog as the Product Picker, not real
   Inventory.** `product-lookup-seed.ts`'s `stockByWarehouse` already exists exactly
   for this kind of forward-compat demo — reusing it here keeps this phase consistent
   with the standing "don't touch Inventory" boundary. `stockAt()`/`productLookupApi`
   already expose everything needed; this phase adds a `deduct()`-style mutation to
   that same service.
4. **POS auto-trigger is written but unreachable until POS exists.** The
   `autoFulfillPos()` code path gets built now so the "automatic for POS" half of the
   requirement isn't silently dropped, but has no caller until POS (Phase 3 of the
   overall project, not this module) lands — dead code by design until then.
5. **Negative stock is allowed, flagged, never blocking** — a fulfillment that would
   take a warehouse below 0 still posts, and the resulting line gets
   `status: "pending-reconciliation"` instead of being rejected, matching the
   client-confirmed rule (`Backend-Build-Guide.md` §8).

**Data model:**

```ts
// dashboard/invoices/fulfillments/types.ts

type FulfillmentTrigger = "pos-auto" | "manual" | "delivery-note";
type FulfillmentLineStatus = "fulfilled" | "pending-reconciliation"; // latter = went negative

type FulfillmentLine = {
  invoiceLineId: string;         // ties back to InvoiceLine.id
  productId: string;
  warehouseId: string;
  quantityFulfilled: number;     // may be less than the invoice line's ordered quantity
  status: FulfillmentLineStatus;
};

type Fulfillment = {
  id: string;
  number?: string;                // set only when trigger is "delivery-note"; else internal-only
  invoiceId: string;
  trigger: FulfillmentTrigger;
  fulfilledAt: string;
  fulfilledBy: string;
  lines: FulfillmentLine[];
  notes?: string;
};
```

`InvoiceLine` already carries `productId?`/`warehouseId?` (added for the Product
Picker) — a line with neither is free-text and can never be fulfilled, the expected
default until a tenant starts linking products. An invoice's fulfillment state
(`"not-applicable" | "unfulfilled" | "partially-fulfilled" | "fulfilled"`) is derived,
never stored — same pattern as `invoiceDisplayStatus()`.

**Sub-phases:**

- **I-A — Types & mock service** — ✅ Done. `fulfillments/types.ts` (`Fulfillment`,
  `FulfillmentLine`, `fulfillableLines()`, `fulfilledQuantity()`,
  `invoiceFulfillmentStatus()`); `fulfillmentFormSchema`/`fulfillmentLineInputSchema`
  added to the shared `schemas.ts`; `api/fulfillments.service.ts`
  (`list(invoiceId?)`, `getNextNumber()`, `create(input)`, `autoFulfillPos()`);
  `productLookupApi.deduct()` added to `api/product-lookup.service.ts`, mutating
  `stockByWarehouse` in place and reporting whether it went negative.
- **I-B — Manual fulfillment UI (the actual B2B requirement)** — ✅ Done. `canFulfill`
  added to the invoice detail page alongside `canSend`/`canPay`/`canCancel` — true
  whenever the invoice isn't draft/cancelled and has remaining product-linked quantity,
  independent of payment status. New `fulfillment-dialog.tsx` ("Mark Fulfilled" — one
  editable quantity per product-linked line, defaulting to the full remaining amount,
  capped from exceeding it) and `invoice-fulfillment-card.tsx` (shipment history,
  pending-reconciliation badges), both only rendered when applicable. Seeded a new
  demo invoice, **INV-0037** (`mock/seed.ts`), with two product-linked lines so the
  feature has something to act on without waiting for a tenant to link products via
  the Product Picker first.
  **Follow-up, same phase**: the per-invoice action alone made it hard to see fleet-wide
  progress ("what's remaining to deliver, across everything"), so it got its own list —
  new `fulfillments-list.tsx` (every invoice with at least one product-linked line;
  columns for customer, `fulfilled / ordered` units, last shipment date, and a status
  badge; search + status filter via `FilterableTable`, same convention as
  Retainers/Proposals) at `/dashboard/fulfillment`, reusing `FulfillmentDialog` directly
  from a row click rather than duplicating the fulfillment logic. New
  `fulfillment-status-badge.tsx` (unfulfilled/partially-fulfilled/fulfilled, amber/green
  tones). Added to the sidebar under **Sales → Delivery / Fulfillment**
  (`nav-items.ts`, `Truck` icon).
- **I-C — Delivery note document** — Not built. The dialog has a "Generate a numbered
  delivery note" checkbox that sets `trigger: "delivery-note"` and gets it a real
  `DN-####` number, but there's no dedicated print/PDF view yet — reusing
  `invoice-pdf.tsx`'s rendering approach for that is still open, additive on top of I-B.
- **I-D — POS auto-fulfillment** — ✅ Written, unreachable until POS exists.
  `fulfillmentsApi.autoFulfillPos(invoiceId, lines)` calls the same `create()` path with
  `trigger: "pos-auto"`; no caller exists until the POS module creates invoices
  (Key Decision I4).
- **I-E — Negative-stock handling** — ✅ Done. `deduct()` never blocks going below 0;
  `create()` flags that line `pending-reconciliation` instead of `fulfilled`. Surfaced
  through the existing Alerts module: `modules/alerts/types.ts` gained a
  `fulfillment-pending-reconciliation` `AlertType` and optional `relatedInvoiceId`;
  `alerts.service.ts` scans every fulfillment's lines for the flag and links back to
  the invoice; `alerts-list.tsx`'s "View retainers" link is now conditional on which
  kind of alert it is. **Reconciliation workflow itself (who clears the flag, how) is
  still not specified by the client** — the flag/alert exist, the resolution flow
  doesn't.
- **I-F — Real Inventory swap (post-backend)** — Not built (needs a real backend).
  Once a real Inventory API exists (`Backend-Build-Guide.md` §8), swap
  `productLookupApi`'s `deduct()`/`stockAt()` for `POST /inventory/stock-movements` —
  same swap already planned for the Product Picker itself, done together since they
  share one service file.

**Open questions carried over**: negative-stock reconciliation UX (I-E); whether a
delivery note needs its own PDF branding pass or reuses the invoice template (I-C
assumes reuse); serial-number tracking at fulfillment time (out of scope, quantity-only
per `Backend-Build-Guide.md` §9 open question 4).

## Files to Create/Change

Paths relative to `src/app/`. Existing billing module lives at `(tenant)/modules/billing/`.

| File | Action | Status | Purpose |
| :--- | :--- | :--- | :--- |
| `(tenant)/modules/crm/types.ts` | Create | ✅ Done | Customer & CRM types |
| `(tenant)/modules/crm/api/customers.service.ts` | Create | ✅ Done | Customer mock service (in-memory seed + Promises) |
| `(tenant)/modules/crm/mock/seed.ts` | Create | ✅ Done | Customer seed data |
| `(tenant)/modules/crm/schemas.ts` | Create | ✅ Done | Customer form validation (not originally listed) |
| `(tenant)/modules/billing/types.ts` | Update | ✅ Done | Imports Customer from crm; `InvoiceSource` + `source` on Invoice added |
| `(tenant)/modules/billing/api/invoices.service.ts` | Update | ✅ Done | Owns in-memory data directly; `getNextNumber()`/`getOrgProfile()` added |
| `(tenant)/modules/billing/api/recurring.service.ts` | Create | ✅ Done | Recurring template service (replaces `recurring/store/recurring-store.ts`) |
| `(tenant)/modules/billing/api/proposals.service.ts` | Create | ✅ Done | `list/get/getNextNumber/create/update/send/reject/convertToInvoice` |
| `(tenant)/modules/billing/api/adjustments.service.ts` | Create | ✅ Done | `list/get/getNextNumber/create/void` — one service for both credit and debit notes (`kind` discriminator) |
| `(tenant)/modules/billing/mock/seed-proposals.ts` | Create | ✅ Done | 4 seeded proposals covering sent/accepted/rejected/expired |
| `(tenant)/modules/billing/store/invoices-store.ts` | Delete | ✅ Done | Deleted, confirmed no remaining imports |
| `(tenant)/modules/billing/recurring/store/recurring-store.ts` | Delete | ✅ Done | Deleted, confirmed no remaining imports |
| `(tenant)/modules/billing/components/add-customer-dialog.tsx` | Update | ✅ Done | Repointed at `modules/crm` |
| `(tenant)/modules/billing/components/record-payment-dialog.tsx` | — | ✅ Already fine | Already used `invoiceApi`, no Customer coupling — no change needed |
| `(tenant)/modules/billing/components/invoice-summary-card.tsx` | Create | ✅ Done | Shared subtotal/discount/tax/total block; consumed by both Proposals' and Invoices' new/edit forms (Phase G) |
| `(tenant)/modules/billing/components/proposals-list.tsx` | Create | ✅ Done | Proposals list content component (not originally listed as its own row) |
| `(tenant)/modules/billing/components/proposal-status-badge.tsx` | Create | ✅ Done | Proposal status badge (draft/sent/accepted/rejected/expired) |
| `(tenant)/modules/billing/components/adjustment-status-badge.tsx` | Create | ✅ Done | Issued/Void badge — renamed from the originally planned `credit-note-status-badge.tsx` since one badge covers both note kinds |
| `(tenant)/modules/billing/components/adjustments-page.tsx` | Create | ✅ Done | Combined Credit/Debit Notes page content — `Tabs` switch, `FilterableTable` per kind (not originally listed as its own row) |
| `(tenant)/modules/billing/components/adjustment-form-dialog.tsx` | Create | ✅ Done | Create/issue dialog — customer, optional linked invoice, amount, reason (not originally listed as its own row) |
| `(tenant)/modules/billing/components/adjustment-details-dialog.tsx` | Create | ✅ Done | View + Void, built on `EntityDetailsDialog` (not originally listed as its own row) |
| `(tenant)/modules/billing/mock/seed-adjustments.ts` | Create | ✅ Done | 3 seeded notes (2 credit, 1 debit) linked to existing seeded invoices (not originally listed as its own row) |
| `(tenant)/modules/billing/components/retainer-status-badge.tsx` | Create | ✅ Done | Active/Paused/Closed badge |
| `(tenant)/modules/billing/api/retainers.service.ts` | Create | ✅ Done | `list/get/create/update/recordUsage/setStatus` |
| `(tenant)/modules/billing/mock/seed-retainers.ts` | Create | ✅ Done | 3 seeded retainers (active/closed/paused) with usage history (not originally listed as its own row) |
| `(tenant)/modules/billing/components/retainers-list.tsx` | Create | ✅ Done | Retainers list content component (not originally listed as its own row) |
| `(tenant)/modules/billing/components/retainer-form-dialog.tsx` | Create | ✅ Done | Shared create/edit form (not originally listed as its own row) |
| `(tenant)/modules/billing/components/retainer-details-dialog.tsx` | Create | ✅ Done | View + usage history + Pause/Resume/Close, built on `EntityDetailsDialog` (not originally listed as its own row) |
| `(tenant)/modules/billing/components/retainer-usage-dialog.tsx` | Create | ✅ Done | Record usage against remaining balance (not originally listed as its own row) |
| `(tenant)/modules/billing/components/reports-page.tsx` | Create | ✅ Done | Sales Report / Invoice Report / Customer Statement tabs (not originally listed as its own row) |
| `(tenant)/dashboard/page.tsx` | Update | ✅ Done | Wires `<SalesDashboard />` — KPI cards, trend chart, invoice-status chart, recent invoices/payments (quick actions still just "New Invoice" in the header, not a separate quick-actions block — fine for now, not specced as blocking) |
| `(tenant)/modules/billing/components/sales-dashboard.tsx` | Create | ✅ Done | Sales Dashboard content component (not originally listed as its own row) |
| `(tenant)/dashboard/customers/page.tsx` | Replace stub | ✅ Done | Real customer list (`FilterableTable`), search + status filter, Outstanding/Credit Limit columns |
| `(tenant)/dashboard/customers/[customerId]/page.tsx` | Create | ✅ Done | Customer detail — Overview/Invoices/Payments/Proposals tabs live; Credit Notes tab still a "coming soon" panel until Phase D |
| `(tenant)/modules/crm/components/customers-list.tsx` | Create | ✅ Done | List page content component (not originally listed as its own row) |
| `(tenant)/modules/crm/components/customer-detail.tsx` | Create | ✅ Done | Detail page content component, tabs |
| `(tenant)/modules/crm/components/customer-edit-dialog.tsx` | Create | ✅ Done | Full-field edit form (customerCode, credit limit, opening balance, status) |
| `(tenant)/modules/crm/components/customer-status-badge.tsx` | Create | ✅ Done | Active/Inactive badge |
| `(tenant)/modules/crm/types.ts` | Update | ✅ Done | Extended `Customer` with `customerCode`, `creditLimit`, `openingBalance`, `status` per docs §33.7 |
| `(tenant)/modules/crm/schemas.ts` | Update | ✅ Done | Added `customerEditSchema`/`CustomerEditValues` for the full field set (quick-create `customerSchema` unchanged) |
| `(tenant)/modules/crm/api/customers.service.ts` | Update | ✅ Done | Added `update`/`remove`; `create` now auto-assigns `customerCode` and financial defaults |
| `(tenant)/dashboard/proposals/page.tsx` | Replace stub | ✅ Done | Proposal list (`FilterableTable`, pipeline-value StatTiles) |
| `(tenant)/dashboard/proposals/new/page.tsx` | Create | ✅ Done | Create + `?edit=<id>` for drafts (not originally listed as its own row — mirrors `invoices/new`) |
| `(tenant)/dashboard/proposals/[proposalId]/page.tsx` | Create | ✅ Done | Proposal detail — Send/Reject/Convert-to-Invoice actions, history timeline |
| `(tenant)/dashboard/credit-notes/page.tsx` | Replace stub | ✅ Done | Combined Credit & Debit Notes page with internal tab switch (kept existing route name) |
| `(tenant)/dashboard/retainers/page.tsx` | Replace stub | ✅ Done | Retainers list + balance tracking |
| `(tenant)/dashboard/reports/page.tsx` | Update | ✅ Done | Sales Report / Invoice Report / Customer Statement tabs |
| `(tenant)/dashboard/invoices/page.tsx` | Update | ✅ Done | Zustand removed; consumes `invoiceApi` + `customersApi` via React Query; kept on its hand-rolled table deliberately (bulk selection/CSV export/sortable columns `FilterableTable` doesn't support) |
| `(tenant)/dashboard/invoices/[invoiceId]/page.tsx` | Update | ✅ Done | Zustand removed, on `invoiceApi`/`customersApi` via React Query; now also shows linked Adjustments and the adjusted Balance Due (added in Phase D) |
| `(tenant)/dashboard/invoices/new/page.tsx` | Update | ✅ Done | Zustand removed, on `invoiceApi`/`customersApi` via React Query; summary block swapped onto shared `InvoiceSummaryCard` (Phase G) |
| `(tenant)/modules/billing/types.ts` | Update | ✅ Done | `Retainer.billingModel`/`expiryDate`/`dispositionReason`/`transferredToRetainerId`/`rolledOverFromRetainerId`/`rolledOverToRetainerId`/`refundAdjustmentId`; `retainerDisplayStatus()`; `InvoiceSource: "retainer-topup"`; removed `RecordUsageInput` |
| `(tenant)/modules/billing/recurring/types.ts` | Update | ✅ Done | `RecurringTemplate.kind` (`"invoice" \| "retainer-topup"`) and `retainerId` |
| `(tenant)/modules/billing/api/recurring.service.ts` | Update | ✅ Done | `generate()` special-cases `kind: "retainer-topup"` — Paid invoice + `retainersApi.topUp()` instead of a normal draft/sent invoice |
| `(tenant)/modules/billing/api/retainers.service.ts` | Update | ✅ Done | Added `topUp()`, `transfer()`, `rollOver()`, `forfeit()`, `requestRefund()`; `drawForInvoice()` now supports partial coverage; removed `recordUsage()` |
| `(tenant)/modules/billing/schemas.ts` | Update | ✅ Done | Added `retainerTopUpSetupSchema`, `retainerRolloverSchema`, `retainerTransferSchema`, `retainerRefundSchema`; extended `retainerFormSchema` with `billingModel`/`expiryDate`; removed `recordUsageSchema` |
| `(tenant)/modules/billing/mock/seed-retainers.ts` | Update | ✅ Done | Added `billingModel`/`expiryDate` per seeded retainer (one recurring, one expiring within the alert window for a live H4 example) |
| `(tenant)/modules/billing/components/retainer-details-dialog.tsx` | Update | ✅ Done | Expiry/disposition info, recurring top-up panel, Transfer/Roll Over/Forfeit/Refund actions (`can(me, "retainer.approve")`-gated); "Record Usage" button removed |
| `(tenant)/modules/billing/components/retainer-form-dialog.tsx` | Update | ✅ Done | Added Contract type (`billingModel`) and Contract end date (`expiryDate`) fields |
| `(tenant)/modules/billing/components/retainers-list.tsx` | Update | ✅ Done | Status column/filter now use `retainerDisplayStatus()` (includes "Expired") instead of raw stored status |
| `(tenant)/modules/billing/components/retainer-status-badge.tsx` | Update | ✅ Done | Takes `RetainerDisplayStatus`, adds an "Expired" (red) tone |
| `(tenant)/modules/billing/components/retainer-transfer-dialog.tsx` | Create | ✅ Done | Destination-retainer picker + confirm for Transfer |
| `(tenant)/modules/billing/components/retainer-rollover-dialog.tsx` | Create | ✅ Done | New expiry date input + confirm for Roll Over |
| `(tenant)/modules/billing/components/retainer-refund-dialog.tsx` | Create | ✅ Done | Reason input + confirm for Refund; approval-gated by its caller |
| `(tenant)/modules/billing/components/retainer-topup-setup-dialog.tsx` | Create | ✅ Done | Creates the `kind: "retainer-topup"` `RecurringTemplate` for a recurring retainer |
| `(tenant)/modules/billing/components/retainer-usage-dialog.tsx` | Delete | ✅ Done | Retired free-text usage-log dialog (Key Decision #11); confirmed no remaining references before deleting |
| `(tenant)/modules/crm/components/customer-detail.tsx` | Update | ✅ Done | Added a Retainers tab (`SimpleTable`, click-through to `RetainerDetailsDialog`/`RetainerFormDialog`) alongside Overview/Invoices/Payments/Proposals/Credit Notes |
| `(tenant)/modules/alerts/types.ts` | Create | ✅ Done | `Alert`, `AlertType`, `AlertSeverity`, `RETAINER_ALERT_THRESHOLDS` |
| `(tenant)/modules/alerts/api/alerts.service.ts` | Create | ✅ Done | `alertsApi.list()` — computed live from retainer data, no stored table |
| `(tenant)/modules/alerts/components/alerts-list.tsx` | Create | ✅ Done | Alerts page content component |
| `(tenant)/dashboard/alerts/page.tsx` | Replace stub | ✅ Done | Was `ComingSoon`; now renders `<AlertsList />` |
| `(tenant)/dashboard/invoices/new/page.tsx` | Update | ✅ Done | "Pay from Retainer" offered on partial coverage too — pays what's available as a `"partially-paid"` partial payment; copy distinguishes full vs. partial |
| `(tenant)/modules/billing/components/record-payment-dialog.tsx` | — | ✅ Already fine | No change needed — a retainer partial payment is just another `Payment` row, same as today |
| `src/lib/permissions/index.ts` | Update | ✅ Done (unscoped fix) | `can()` now honors `permissions: ["*"]` (dev mock identity) — without it, `retainer.approve` would never resolve `true` outside the `admin` realm |
| `(tenant)/dashboard/invoices/fulfillments/types.ts` | Create | ✅ Done | `Fulfillment`/`FulfillmentLine` types, `fulfillableLines()`, `fulfilledQuantity()`, `invoiceFulfillmentStatus()` (Phase I-A) |
| `(tenant)/dashboard/invoices/api/fulfillments.service.ts` | Create | ✅ Done | `list/getNextNumber/create/autoFulfillPos` (Phase I-A) |
| `(tenant)/dashboard/invoices/api/product-lookup.service.ts` | Update | ✅ Done | Added `deduct()` — mutates `stockByWarehouse`, reports `wentNegative` (Phase I-A) |
| `(tenant)/dashboard/invoices/schemas.ts` | Update | ✅ Done | Added `fulfillmentFormSchema`/`fulfillmentLineInputSchema` (Phase I-A) |
| `(tenant)/dashboard/invoices/mock/seed.ts` | Update | ✅ Done | Added `productLine()` helper and a new seeded invoice (INV-0037) with product-linked lines so Fulfillment has something to act on (Phase I-B) |
| `(tenant)/dashboard/invoices/components/fulfillment-dialog.tsx` | Create | ✅ Done | "Mark Fulfilled" dialog — per-line quantity capped at remaining, optional delivery-note toggle (Phase I-B) |
| `(tenant)/dashboard/invoices/components/invoice-fulfillment-card.tsx` | Create | ✅ Done | Shipment history card, pending-reconciliation badges (Phase I-B) |
| `(tenant)/dashboard/invoices/components/invoice-detail.tsx` | Update | ✅ Done | `canFulfill` condition, "Mark Fulfilled" action button, fulfillment card slot, dialog wiring (Phase I-B) |
| `(tenant)/modules/alerts/types.ts` | Update | ✅ Done | Added `fulfillment-pending-reconciliation` `AlertType`, optional `relatedInvoiceId`, made `relatedRetainerId` optional (Phase I-E) |
| `(tenant)/modules/alerts/api/alerts.service.ts` | Update | ✅ Done | Scans every fulfillment's lines for `pending-reconciliation` and emits an alert per line (Phase I-E) |
| `(tenant)/modules/alerts/components/alerts-list.tsx` | Update | ✅ Done | Link target now depends on alert type — invoice link for fulfillment alerts, retainers link otherwise (Phase I-E) |
| `(tenant)/dashboard/invoices/components/fulfillment-status-badge.tsx` | Create | ✅ Done | Unfulfilled/Partially Fulfilled/Fulfilled badge (not in the original I-B wording, added with the list view) |
| `(tenant)/dashboard/invoices/components/fulfillments-list.tsx` | Create | ✅ Done | Fleet-wide fulfillment progress list — every product-linked invoice, `FilterableTable`, reuses `FulfillmentDialog` on row click (not in the original I-B wording, added after the per-invoice-only action proved hard to get an overview from) |
| `(tenant)/dashboard/fulfillment/page.tsx` | Create | ✅ Done | Route for the above |
| `(tenant)/components/nav-items.ts` | Update | ✅ Done | Added "Delivery / Fulfillment" under the Sales section, `Truck` icon |
| `(tenant)/dashboard/invoices/fulfillments/types.ts` | Update | ✅ Done | Added `totalOrderedQuantity()`/`totalFulfilledQuantity()` for the list's progress column |

## Migration Steps

1. ✅ **Infrastructure**: Establish `modules/crm/` and confirm the mock-service pattern (in-memory seed + Promises with simulated latency, consumed via React Query).
2. ✅ **Data Move**: Migrate `Customer` type/data/logic to `modules/crm`; repoint billing imports (AddCustomerDialog, invoice forms, seed data).
3. ✅ **State Swap**: `invoices.service.ts` owns its data; all `useInvoicesStore`/`useRecurringStore` call sites replaced with React Query hooks — including `invoices/new/page.tsx` and `invoices/[invoiceId]/page.tsx`, the last two remaining.
4. ✅ **Type Update**: Applied new fields (`source`, `productId`/`warehouseId`) to types and seed data; default `source: "manual"`.
5. ✅ **Delete Stores**: `store/invoices-store.ts` and `recurring/store/recurring-store.ts` removed. Repo-wide grep confirms no remaining imports; `tsc --noEmit` and `eslint` both pass clean.

**Phase A checkpoint passed** — `tsc`/lint verified clean as of this review (same checkpoint discipline the admin-portal migration used). Phases B–G, built after this checkpoint, are covered by the Progress Snapshot above.

## Component Order

1. ~~Mock services & types~~ (done) → 2. ~~Finish migrating `invoices/new` + `invoices/[invoiceId]` off Zustand, delete both stores~~ (done) → 3. ~~Dashboard KPIs~~ (done) → 4. ~~CRM list/detail (Phase B)~~ (done) → 5. ~~Proposals, incl. `InvoiceSummaryCard` & `ProposalStatusBadge`~~ (done) → 6. ~~Credit/Debit Notes~~ (done) → 7. ~~Retainers~~ (done) → 8. ~~Reports~~ (done).

**All component-order steps are done**, including Phase G's `InvoiceSummaryCard` swap.

## Module Flows

- **Sales Flow**: `Proposal` → `Accepted` → `Convert to Invoice` (source: "estimate") → `Record Payment` → `Paid`.
- **Customer Flow**: `Create Customer` → `Link to Proposal/Invoice` → `Track Balance`.
- **Adjustment Flow**: `Issue Credit/Debit Note` → `Link to Invoice` → "Adjustments" entry appears on invoice detail → invoice displayed balance updates.
- **Recurring Flow**: `Create Template` → `Generate Now` (manual trigger) → Invoice created with `source: "recurring"`.
- **Retainer Flow (current, Phase E)**: `Create Retainer` → `Track Remaining Balance`.
- **Retainer Flow (planned, Phase H)**: `Create Retainer` (funding Invoice, Paid) → `Draw` (invoice-linked, always auto-paid — fully if the balance covers it, partially via `"partially-paid"` if it doesn't) → *(recurring only)* `Generate Top-Up` (manual trigger → Paid invoice, `source: "retainer-topup"`, balance topped up) → *(at expiry)* `Transfer` / `Roll Over` (self-serve) **or** `Forfeit` / `Refund` (permission-gated, Refund → negative invoice via the Adjustments pattern) → visible throughout in the Customer Statement.
- **Fulfillment Flow (Phase I)**: Invoice sent (product-linked lines, stock untouched) → `Mark Fulfilled` (B2B, manual, any time after send, independent of payment) or automatic at sale-post (POS, not wired yet) → stock deducted per line → invoice's derived fulfillment status moves `unfulfilled` → `partially-fulfilled` → `fulfilled` as shipments accumulate → a line that goes negative is flagged `pending-reconciliation` and surfaces on the Alerts page instead of blocking.

## Testing Checklist

- [x] Customer CRUD persists in-memory and reflects everywhere a customer list is consumed: invoice create/edit, recurring template dialog, add-customer-dialog, invoice preview, and the Customers list/detail pages.
- [x] Invoice pages function correctly without Zustand; RecordPaymentDialog partial/full logic intact post-migration.
- [x] Recurring "Generate now" creates an invoice with `source: "recurring"` (verified in `recurring.service.ts`'s `generate()`).
- [x] Proposal → Invoice conversion populates all lines and sets `source: "estimate"`; proposal marked accepted with `convertedInvoiceId`; navigates to new invoice (verified in `proposals.service.ts`'s `convertToInvoice()`).
- [x] Credit/Debit notes correctly decrement/increment linked invoice balances and appear in its Adjustments section (verified in `adjustedInvoiceBalance()`/`adjustmentsForInvoice()` and the Invoice detail page's Adjustments card + Balance Due tile).
- [ ] Dashboard KPIs/charts reflect seeded data and update after create/edit/delete actions — implemented, not yet exercised in a running browser (AGENTS.md §7: verify via `tsc`/lint, not the dev server, for routine work).
- [x] Retainer draws can't exceed the remaining balance — `drawForInvoice()` caps at `Math.min(invoice.total, remainingBalance)`, no override path (Key Decision #10); retainer auto-closes at zero remaining; Pause/Resume/Close all update status correctly (verified in `retainers.service.ts`).
- [x] Reports reflect the same live data as the rest of the module — Sales/Invoice Report and Customer Statement all read from `invoiceApi`/`adjustmentsApi`/`customersApi`, no separate/stale report-only dataset; CSV export works on all three tabs.
- [ ] All new pages are responsive (down to 360px) and support Dark Mode — built with the same responsive/dark-mode utility classes as the rest of the tenant portal; not yet visually spot-checked.
- [ ] Desktop (lg:) matches prototype markup where a page exists in it — Customers/Proposals/Retainers/Reports have no prototype reference page, so this applies to Invoices/Recurring only, already true pre-migration.
- [x] `tsc` and lint pass with no errors (verified after every phase, most recently after Phase F).
- [x] **Phase H** — Recurring top-ups generate a Paid invoice (`source: "retainer-topup"`) and correctly increment `remainingBalance` (verified in `recurring.service.ts`'s `generate()` and `retainers.service.ts`'s `topUp()`).
- [x] **Phase H** — Transfer moves the full `remainingBalance` and zeroes the source retainer; Roll Over creates a new retainer seeded with the leftover balance and links back via `rolledOverFromRetainerId`/`rolledOverToRetainerId` (verified in `retainers.service.ts`'s `transfer()`/`rollOver()`).
- [x] **Phase H** — Forfeit/Refund are unreachable without `can(me, "retainer.approve")` — both action buttons and their dialogs only render when `canApprove` is true in `retainer-details-dialog.tsx`; Refund produces a real negative-value invoice via `adjustmentsApi.convertToInvoice()`, not just a status flip.
- [x] **Phase H** — `retainerDisplayStatus()` returns `"expired"` once `expiryDate` has passed, without mutating stored `status` (same never-stored pattern as invoices/proposals).
- [x] **Phase H** — Retainer funding/top-up/refund activity appears correctly in the Customer Statement — every one of them is a real Invoice/Payment/Adjustment, so no separate wiring was needed (H5).
- [ ] **Phase H** — Not yet exercised in a running browser (AGENTS.md §7: verify via `tsc`/lint for routine work) — logic verified by reading every code path, not by clicking through the UI. Worth a manual pass before shipping, same caveat as the Dashboard KPIs item above.
- [x] **Phase I** — `canFulfill` only true for non-draft, non-cancelled invoices with remaining product-linked quantity, independent of payment status (verified in `invoice-detail.tsx`).
- [x] **Phase I** — Quantity entered in `FulfillmentDialog` is capped at the line's remaining amount (ordered minus already fulfilled across prior fulfillments); submitting over the cap is rejected client-side before the mutation fires (verified in `fulfillment-dialog.tsx`'s pre-submit check).
- [x] **Phase I** — A fulfillment that takes a warehouse below zero doesn't reject — `productLookupApi.deduct()` still applies the deduction and reports `wentNegative`; the affected line is stored as `pending-reconciliation` and a matching alert appears via `alertsApi.list()` (verified in `fulfillments.service.ts`/`alerts.service.ts`).
- [x] **Phase I** — `autoFulfillPos()` exists and is callable (unit-level — no UI calls it yet, since POS doesn't exist).
- [ ] **Phase I** — Not yet exercised in a running browser, same standing caveat as Phase H above.

## Explicitly Out of Scope

- **Vendors, Inquiries, Leads** — not in this spec; still ComingSoon. Separate future task.
- **Action-level permissions** (`invoice.create` etc., spec §23) — no full role/action permission *system* (admin-configurable RBAC UI) exists yet, and sub-role RBAC is an unanswered open question (Project-Structure.md §7). Phase H's Forfeit/Refund gating uses the existing `can(me, permission)` primitive with one new permission string (`retainer.approve`) — not a new engine, just one more check of the same caliber already used elsewhere; still no UI to assign/configure who holds it.
- **POS integration & real Inventory stock movement** — `InvoiceLine.productId`/`warehouseId` are now genuinely used by both the Product Picker and Phase I's Fulfillment, but both still deduct against the isolated demo catalog (`product-lookup-seed.ts`), not real Inventory — Inventory itself hasn't been touched, and POS doesn't exist yet (Phase I-D/I-F).
- **Delivery note PDF/print view** (Phase I-C) — the dialog can tag a fulfillment as a numbered delivery note, but there's no dedicated document rendering for it yet.
- **Fulfillment reconciliation workflow** (Phase I-E) — the `pending-reconciliation` flag and its Alerts entry exist; who clears it and how is not specified by the client.
- **Scheduler/auto-send for Recurring Invoices, including retainer top-ups** — stays manual-trigger ("Generate now"), consistent with the rest of the Recurring Invoices UX; flagged as an open question in existing code/docs.
- **Overdraw with manual approval** — decided against (Key Decision #10); the hard cap stays permanent, not a togglable exception.
- **Full Alerts module beyond retainer triggers** — `(tenant)/modules/alerts/` built, but scoped strictly to the two retainer triggers (Phase H4); not a general-purpose alerting system for the rest of the app. Extend `alertsApi.list()` if/when other trigger sources are needed.
- **Alert thresholds wired to a real Settings UI** — `RETAINER_ALERT_THRESHOLDS` is one exported constant, not yet configurable through the tenant Settings page (still a `ComingSoon` stub). Revisit once that page exists.
- **Re-confirming Key Decisions #10–14 with the client** — not a code task, but flagged: these are working defaults inferred from the client's other answers, not re-confirmed line items. Phase H shipped on them; worth a quick sanity check with the client regardless.

## Appendix: Module-by-module flow (plain language)

A walkthrough of how each screen actually behaves in real use, written for a non-technical
reader. Uses one running example — **"Bloom Café Group"** ordering equipment from the tenant.

**Structural note**: a client-facing nav list for this module named 12 items. The built system
has 11 working screens — Estimates and Proposals are one screen (Key Decision, same concept
under two names), Credit Notes and Debit Notes are one screen (Key Decision, one `Adjustment`
type with a `kind` discriminator), and Delivery/Fulfillment (Phase I above) got its own nav item
(**Sales → Delivery / Fulfillment**, `/dashboard/fulfillment`) once the client asked to see
what's remaining/in-progress across every shippable invoice in one place, rather than having to
open each invoice individually — the *action* of fulfilling still happens from the invoice
detail page (or from this list, which reuses the same dialog), only the "what's outstanding
across everything" view needed its own screen. If literal 1:1 nav items are required later
for the remaining gap, that's a new scoping decision, not an oversight here.

### 📊 Dashboard
The homepage. Shows total invoiced this month, outstanding (unpaid), collected, an invoicing
trend chart, a status breakdown, and a feed of recent invoices/payments. Read-only — nothing
happens here, it just summarizes everything below it.

### 👥 Customers
The address book, with money attached. Each customer has contact info, a credit limit, an
opening balance, and a status (Active/Inactive). Added once, reused everywhere. Their profile
page shows every invoice, payment, proposal, and retainer tied to them in one place. Deleting
a customer is permanent (confirmation required).

### 📄 Estimates / 📑 Proposals (one screen)
You draft a Proposal ("10 espresso machines, AED 45,000") → **Send** it → they respond.
Accepted → **Convert to Invoice** turns it into a real Invoice pre-filled with the same lines,
nothing retyped. No response before the expiry date → automatically shows **Expired** (derived,
not a manual step). Can also be **Rejected**. A converted proposal is locked — can't convert
twice, so there's never a duplicate invoice from the same estimate.

### 🧾 Invoices
The core document. **Save Draft** (private, fully editable) or **Create & Send** (locks the
line items, customer gets it, status → Sent). Payments recorded against it — full → **Paid**,
partial → **Partially Paid**. Due date passes with balance owed → automatically **Overdue**.
Can be cancelled if nothing's been paid yet. Every invoice has a QR code and downloadable PDF.
Credit/Debit notes and retainer draws also apply against the balance — what you see as "owed"
always reflects all of that combined, not just cash payments.

### 🔁 Recurring Invoices
For customers billed the same amount on a schedule. Set up once (customer, amount, frequency,
start date). **Nothing fires automatically** — each cycle, someone clicks **Generate Now**,
which creates a new draft invoice for review before it's sent; deliberate, so nothing bills
without a human looking at it first. Templates can be Paused (skip cycles) or Deleted (past
invoices already generated are untouched).

### 💳 Payments
Not a separate list — payments live inside invoices. Recording one captures amount, date,
method (bank transfer, card, cash, cheque, mobile, or "Retainer"), and an optional reference.
The invoice's paid/balance figures update immediately.

### ↩ Credit Notes / ➕ Debit Notes (one screen)
One screen, tab switch between the two — a Credit Note reduces what a customer owes, a Debit
Note increases it. Example: Bloom Café returns a faulty machine → a Credit Note for AED 3,000
linked to the original invoice → that invoice's balance drops by 3,000 automatically. Issued
immediately, no draft stage — it's a record of something that already happened, not a document
awaiting a response. Can be **Voided** if issued by mistake (balance reverts instantly). A
standalone note (no linked invoice) can be **Converted to an Invoice** so it shows up as a real
document instead of floating unlinked.

### 📋 Retainers
A prepaid wallet a customer keeps with the tenant.
- **Funding**: customer pays AED 60,000 upfront → a funding invoice is generated and marked
  Paid immediately → the retainer balance starts at AED 60,000.
- **One-time vs. Recurring**: a single lump sum that drains down, or a recurring one that tops
  itself back up every billing period (again, only on manual **Generate**, never automatic).
- **Drawing it down**: ticking "Pay from Retainer" on a new invoice — full coverage marks it
  Paid instantly; partial coverage pays what it can and the rest stays owed normally, like any
  partial payment.
- **Hard cap**: a retainer can never be over-drawn — it only ever takes what's actually there.
- **Contract end**: every retainer has an end date. **Transfer** (move the leftover balance to
  another of the customer's retainers) and **Roll Over** (start a fresh contract seeded with
  the leftover) are self-serve. **Forfeit** (balance is simply lost) and **Refund** (money goes
  back as a real negative invoice) require an approval permission — not every staff member can
  do those two.
- **Alerts**: a retainer expiring within 14 days or with under 20% balance left shows up on the
  Alerts page automatically, so nothing quietly runs out unnoticed.

### 🚚 Delivery / Fulfillment
The join point with Inventory (Phase I), now its own nav item under Sales. The list shows every
invoice with at least one product-linked line — customer, `fulfilled / ordered` units, last
shipment date, and a status badge (Unfulfilled/Partially Fulfilled/Fulfilled), filterable by
status. Goods leaving the warehouse — not invoice creation or payment — is what actually deducts
stock. Click a row (or the **Mark Fulfilled** button on the invoice detail page itself, same
dialog either way) and pick how many of each line actually shipped — defaults to everything
remaining, editable down for a partial shipment — with an option to check "Generate a numbered
delivery note" for a `DN-####` reference. Fulfilling is available the moment an invoice is sent
(drafts never reserve stock) and is independent of whether it's been paid. For POS sales the
equivalent trigger fires automatically the instant the sale posts — written and ready, but
there's no POS module yet to call it. If a fulfillment would take a warehouse below zero, it
still goes through (never blocked) but shows up on the Alerts page flagged for reconciliation
instead of silently succeeding.

### 📈 Reports
Three tabs, all reading the same live data as everything above (no separate reporting dataset
that could drift out of sync): **Sales Report** (12-month invoiced-vs-collected trend),
**Invoice Report** (every invoice, filterable by status), and **Customer Statement** (one
customer's full running-balance ledger — every invoice, payment, and note in date order; this
is where retainer activity surfaces too, since it's all just invoices/payments underneath). All
three export to CSV.

## Definition of Done

- All entities in spec implemented with full CRUD; every action button (create, edit, delete, status change, convert, record payment/usage) performs a real state change against the mock services and updates the UI.
- UI matches prototype (desktop lg:) and follows Basic-Setup.md conventions (responsive down to 360px, dark mode in the same diff).
- No Zustand stores remaining in the billing module.
- Kebab-case filenames throughout; exported component names PascalCase.
- Pages/layouts are Server Components; interactivity isolated in small `"use client"` components.
- Scope stays inside this spec — no adjacent modules touched.
