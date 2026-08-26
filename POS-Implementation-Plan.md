# POS Module — Implementation Plan (Demo)

## Overview

A web-based Point of Sale register, built as a demo/R&D pass on the `dev-nafis-pos-demo-0.1`
branch — the client's own docs are thin on this module (`docs/requirements/Client-Requirements-Phase1.md`
§4 covers policy decisions like offline rules and refund gating, but not screen-level UX), so this
plan works from general POS domain knowledge and fits it to what's already built (Invoices'
numbering, Fulfillment's stock-deduction path, CRM's customer lookup) rather than from a client
spec. Flag anything here that turns out to conflict with a future client answer.

## Progress

**Live soft-launch (2026-08).** Static POS UI under `dashboard/pos/` is wired to the real backend
(`/pos/*`), not mock services. Local API smoke (`scripts/qa-pos-live.py`) covers
shift → sale → invoice/fulfill → refund → void → close. Visual design is unchanged from the demo
build; production offline/hardware/auth-hierarchy remain out of scope (see roadmap below).

**Renamed after an early round of use exposed real confusion**: the config entity was originally
called `PosRegister`, and the checkout screen's shift actions were labeled "Open Register"/"Close
Register" — one word doing two jobs (the entity *and* the verb), which was the actual source of
confusion, not the underlying design. Renamed the entity to **`PosTerminal`** (matching the
client's own SRS schema, `pos_terminals` — not an invented name) and the session actions to
**Start Shift** / **End Shift**. See Key Decision #2.

**Cashier login added, same pass**: starting a shift used to stamp a hardcoded name
(`DEMO_CASHIER_NAME`) with no real check. `OpenSessionDialog` now asks for a name plus the
terminal's own `accessCode` (set per-terminal in `TerminalFormDialog`), validated **server-side**
against a bcrypt `accessCodeHash` before a session opens. This is deliberately a **different code
from the manager-approval PIN** used for discounts/refunds — one authorizes "I can work this
terminal," the other authorizes "this specific risky action is approved." See Key Decision #7.

Two smaller simplifications made while building, not in the original wording below:

- **Terminal selection doubles as the shift-start step** — `OpenSessionDialog` includes the
  terminal picker itself (defaulting to whatever's remembered locally), rather than a separate
  "assign this device" screen. Simpler for a demo with no real multi-device testing.
- **Refund payment method isn't tracked** — close-session expected cash assumes refunds were
  paid back in cash (BE records refund payments as `CASH` negative), which slightly understates
  expected cash if a refund was actually issued to a card. Still flagged for a later pass.

## Scope for this demo

**In scope**: a working web register — start a shift, ring up a sale against real product/stock
data, take payment (incl. split), print/preview a receipt, end a shift with cash reconciliation,
and refund/return a past sale.

**Deliberately out of scope for this pass** (see the "why web, not Windows" discussion — these
need real architectural work, not a checkbox; full technical scope for each is written up in
`docs/backend/Backend-Build-Guide.md` §7.4/§7.5, summarized in "Backend & Production Roadmap"
below):
- Offline mode and sync-conflict handling — needs a service-worker/local-storage layer this repo
  doesn't have yet.
- Real hardware integration (barcode scanner beyond "text input", receipt printer, cash drawer,
  card reader) — the web build simulates these (a receipt preview instead of a real print job,
  etc.).
- Native Android/iOS apps.
- Damaged-return "quarantine" stock status — Inventory has no such status today, and adding one
  means touching the Inventory module, which needs a separate go-ahead before this plan touches
  it. Modeled as a flag/note on the refund record for now, not a real stock-side bucket.
- Device "enrollment" — a Terminal is a simple admin-created config record (name, code, linked
  warehouse, access code, status), not a hardware provisioning flow. See below.

## Data model

All net-new, living in the `dashboard/pos/` route folder (matching the pattern already used for
Delivery/Fulfillment — its own route, own nav item, reaches across to Invoices/Inventory/CRM for
what it reuses rather than duplicating them).

```ts
// A terminal is just admin config — not a "device" in any enrollment sense.
// accessCode gates who can start a shift on it — separate from the manager-
// approval PIN used elsewhere for discounts/refunds.
type PosTerminalStatus = "active" | "inactive";
type PosTerminal = {
  id: string;
  name: string;          // "Front Counter", "Back Counter"
  code: string;           // short code, shown on receipts
  warehouseId: string;    // every sale through this terminal deducts from here — client-confirmed
  accessCode: string;
  status: PosTerminalStatus;
};

// One open→close shift on a terminal. openedBy comes from the cashier-login
// step in OpenSessionDialog (name + the terminal's access code), not a
// hardcoded identity.
type PosSessionStatus = "open" | "closed";
type PosSession = {
  id: string;
  terminalId: string;
  openedBy: string;
  openedAt: string;
  openingCash: number;
  closedAt?: string;
  closingCashCounted?: number;   // what the cashier actually counted
  expectedCash?: number;         // opening + cash sales − cash refunds, computed at close
  variance?: number;             // counted − expected
  status: PosSessionStatus;
};

// Cart is client-only state (not persisted) while shopping — becomes a PosSale on checkout.
type CartLine = {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRate: number;
  discountAmount?: number;
};

type PosPaymentMethod = "cash" | "card" | "mobile-payment";
type PosPayment = { method: PosPaymentMethod; amount: number };

type PosSaleStatus = "completed" | "partially-refunded" | "refunded";
type PosSale = {
  id: string;
  number: string;              // POS-000001 — own sequence, separate from INV- (client-confirmed)
  sessionId: string;
  terminalId: string;
  warehouseId: string;         // denormalized from the terminal at sale time — refunds restock without a lookup
  customerId?: string;         // optional, reuses CRM
  lines: CartLine[];
  payments: PosPayment[];      // split tender = multiple entries
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: PosSaleStatus;
  fulfillmentId?: string;      // set once autoFulfillPos() runs — stock already deducted
  createdBy: string;           // = the session's openedBy, not a separate "who rang this up"
  createdAt: string;
};

type RefundLineCondition = "sellable" | "damaged";
type PosRefund = {
  id: string;
  saleId: string;
  lines: { productId: string; quantity: number; condition: RefundLineCondition }[];
  amount: number;
  reason: string;
  approvedBy: string;   // manager-PIN gate, per client-confirmed rule
  createdAt: string;
};
```

## What it reuses vs. what's new

| Piece | Source |
| :--- | :--- |
| Product/stock lookup | Same demo catalog as the Product Picker/Fulfillment (`product-lookup-seed.ts`) — one consistent stock number across Invoices/Fulfillment/POS in this demo |
| Stock deduction on sale | `fulfillmentsApi.autoFulfillPos()` — written in Phase I-D, unused until now. This is its first real caller |
| Customer lookup/quick-create | `customersApi` from CRM, same as Invoices |
| Numbering pattern | Same `nextSequence()` helper as Invoices, own `POS-####` counter |
| Split payments shape | Mirrors `Invoice.payments: Payment[]` — same idea, applied at checkout time instead of after the fact |
| Manager-PIN gate | New, demo-only — a lightweight PIN prompt, not real auth (no cashier/manager account hierarchy exists yet in the mock identity layer). Flagged as a shortcut, not a security model |
| Terminal/session/sale/refund entities | All new |

## Pages (routes) — nothing crammed into one screen

New sidebar section, **POS** (own top-level section, not nested under Sales — it's Phase 3 scope
per `Project-Structure.md` §5, and has its own daily workflow distinct from invoicing):

| Route | Purpose |
| :--- | :--- |
| `/dashboard/pos` | The Register — the actual checkout screen, where a shift's sales happen |
| `/dashboard/pos/sales` | Sales history — every POS sale, searchable/filterable, entry point for refunds |
| `/dashboard/pos/sales/[saleId]` | One sale's detail (receipt view) + Refund/Return action |
| `/dashboard/pos/sessions` | Session history — every shift, cash reconciliation, variance |
| `/dashboard/pos/terminals` | Terminal management (admin) — create/edit terminals, warehouse + access code |

## Component breakdown — the Register screen (`/dashboard/pos`)

This is the biggest screen, so it's the one most worth breaking down deliberately rather than one
large client component:

- `register-screen.tsx` — orchestrator only: holds cart state, current session, wires the pieces
  below together. No business logic of its own beyond composing them.
- `session-required-gate.tsx` — if the chosen terminal has no open shift, shows a "Start Shift"
  prompt instead of the checkout UI. Nothing below it renders until a session exists.
- `open-session-dialog.tsx` — the cashier-login step: pick a terminal (if more than one), enter
  your name and the terminal's access code, enter opening cash, confirm.
- `close-session-dialog.tsx` — enter counted cash, shows expected-vs-counted and the variance
  before confirming close.
- `product-search-panel.tsx` — search box (also where a barcode scanner's fast text input lands)
  + a grid of product tiles for tap-to-add.
- `product-tile.tsx` — one product card (name, price, stock indicator) — a single line item, kept
  tiny and reusable.
- `cart-panel.tsx` — the running cart: list of `cart-line-row.tsx`, subtotal/tax/total summary.
- `cart-line-row.tsx` — one line: quantity stepper, remove button, per-line price.
- `discount-dialog.tsx` — apply a cart- or line-level discount; a manual/override amount routes
  through `manager-pin-dialog.tsx` first (client-confirmed rule).
- `customer-picker-inline.tsx` — optional "attach a customer" control, reuses the existing
  quick-create pattern from Invoices rather than a new one.
- `payment-dialog.tsx` — choose one or more payment methods (split tender), cash tendered → change
  due calculation, confirm → creates the `PosSale`.
- `manager-pin-dialog.tsx` — small reusable gate, used by Discount override and Refund.
- `receipt-dialog.tsx` — post-sale receipt preview (mirrors `invoice-pdf.tsx`'s rendering approach,
  POS-styled), with a "New Sale" action that clears the cart.

## Component breakdown — the other screens

- `sales-list.tsx` (`/dashboard/pos/sales`) — `FilterableTable`, same convention as
  Invoices/Retainers; filters by terminal/session/date/status.
- `sale-detail.tsx` (`/dashboard/pos/sales/[saleId]`) — receipt-style read view + "Refund/Return"
  action (manager-PIN gated).
- `refund-dialog.tsx` — pick which lines/quantities are being returned, mark each **sellable**
  (goes back to stock) or **damaged** (flagged, doesn't restock — see the Inventory-quarantine
  caveat above), enter a reason, confirm.
- `sessions-list.tsx` (`/dashboard/pos/sessions`) — every session, opening/closing cash, variance,
  status.
- `session-details-dialog.tsx` — one session's full picture: every sale that happened during it,
  cash math breakdown.
- `terminals-list.tsx` (`/dashboard/pos/terminals`) — simple list, same shape as Inventory's
  Warehouses list.
- `terminal-form-dialog.tsx` — create/edit a terminal (name, code, linked warehouse, access code,
  status).

## The flow, mapped to screens

```
Admin: Terminals page → create "Front Counter" terminal, link to Main Warehouse, set access
  code (one-time setup)
  ↓
Cashier: /dashboard/pos → no open shift → Start Shift dialog → picks terminal, enters name +
  access code, enters opening cash → shift starts (this is also the login step)
  ↓
Search/scan product (product-search-panel) → tap to add (product-tile) → appears in cart-panel
  ↓
Adjust quantity/remove (cart-line-row) → optional discount (discount-dialog, PIN if override)
  → optional customer (customer-picker-inline)
  ↓
Checkout → payment-dialog → select payment method(s) → confirm
  ↓
PosSale created → autoFulfillPos() deducts stock at the terminal's warehouse (negative-stock-
  pending rule applies here too, same as B2B) → receipt-dialog shown → cart clears
  ↓
(anytime later) Sales history → open a sale → Refund/Return → manager-pin-dialog → refund-dialog
  → sellable lines restock, damaged lines flagged
  ↓
(end of day) End Shift dialog → count cash → variance shown → session closed
```

## Key decisions

1. **Web-only for this demo** — offline/native/hardware are out of scope, per the earlier
   discussion; nothing here blocks adding them later, but nothing here pretends to solve them now.
2. **Terminal (renamed from Register) is config, not a device** — no enrollment flow, no
   `device_identifier` field used yet (that's purely an offline-sync concern per the SRS schema,
   irrelevant while offline is out of scope). Renamed from `PosRegister` after the entity/verb
   collision with "Open Register"/"Close Register" caused real confusion — "Terminal" matches the
   client's own SRS schema (`pos_terminals`) and frees "session"/"shift" to be the verb.
3. **POS reuses Fulfillment's stock-deduction path**, not a parallel inventory mutation —
   `autoFulfillPos()` was written specifically for this and has had no caller until now.
4. **Own top-level sidebar section**, not nested under Sales — distinct daily workflow (sessions,
   terminal-bound), matches its own phase in the project structure.
5. **Manager PIN is a soft-launch gate**, not a full permission model — hashed and server-checked,
   but dedicated ApproveDiscount/ApproveRefund permissions and cashier accounts are still open.
6. **Damaged returns use Inventory quarantine when available** — sellable lines restock via
   `SALES_RETURN`; damaged lines call `quarantineStockCore` (QUARANTINE movement). No longer a
   POS-side-only flag.
7. **Starting a shift is also a cashier login** — name + the terminal's own `accessCode`, checked
   against that terminal's record before a session opens. Deliberately a different code from the
   manager-approval PIN (different purpose: "who's allowed on this terminal" vs. "this action is
   approved"). `PosSession.openedBy` now comes from this real input, and `PosSale.createdBy` is
   set from the session's `openedBy` rather than a hardcoded name.

## Mock service → real endpoint mapping

Every method the frontend calls today, and what it becomes. Full request/response detail,
transaction ordering, and the exact business rules to enforce server-side are in
`docs/backend/Backend-Build-Guide.md` §7 — this table is the index, not a duplicate of it.

| Mock service method | Real endpoint | Notes |
| :--- | :--- | :--- |
| `posTerminalsApi.list/get/create/update/setStatus` | `GET/POST/PATCH /pos/terminals`, `POST /pos/terminals/:id/status` | Admin-only; `accessCode` hashed server-side |
| `posSessionsApi.list/get` | `GET /pos/sessions`, `GET /pos/sessions/:id` | — |
| `posSessionsApi.getOpenForTerminal` | `GET /pos/terminals/:id/open-session` | Server enforces one OPEN session per terminal |
| `posSessionsApi.open` | `POST /pos/sessions` | Validates `accessCode` with bcrypt against `accessCodeHash` |
| `posSessionsApi.close` | `POST /pos/sessions/:id/close` | `expectedCash` computed server-side from real sales/refunds |
| `posSalesApi.list/get/getNextNumber` | `GET /pos/sales[/:id]`, `GET /pos/sales/next-number` | Allocate under `pg_advisory_xact_lock` per tenant |
| `posSalesApi.create` | `POST /pos/sales` | Atomic: number → stock (Fulfillment path) → persist |
| `posSalesApi.refund` | `POST /pos/sales/:id/refund` | Manager PIN enforced server-side (`assertManagerApproval`) |
| `productLookupApi.deduct` (via `fulfillmentsApi.autoFulfillPos`) | Inventory stock movements via auto-fulfill | Shared with Delivery/Fulfillment |

## Backend & Production Roadmap

Everything below is genuinely new work relative to this demo, not a refinement of it — each is
written up in full in `docs/backend/Backend-Build-Guide.md` §7.4/§7.5, summarized here so this
plan doc stays a complete picture of "what POS needs" on its own.

**Offline mode** (client-confirmed policy, `Client-Requirements-Phase1.md` §4.2/§4.3 — the *rules*
are already decided, only the implementation is missing):

- Sales, basic customer lookup/creation, and standard pre-configured discounts work offline;
  refunds and manager-override discounts are online-only.
- A sale proceeds even if live stock can't be verified — never block a completed customer sale
  over connectivity.
- Sync conflicts resolve by timestamp order, accepting every transaction as valid (never rejecting
  a completed sale after the fact) and letting stock go negative temporarily, with an alert
  surfaced to the Inventory Manager to reconcile.
- Failed syncs retry with exponential backoff, escalating to a manual-resolution queue with the
  full payload after repeated failures.
- Needs: a local queue (IndexedDB/service worker for a browser build) storing offline transactions
  keyed by offline-transaction-ID/device-ID/terminal-ID/local-sequence-number (SRS §11.5/§22.4),
  and a `POST /pos/sales/sync` batch endpoint using that ID as an idempotency key.
  BE already accepts `isOfflineSync` + sync-failures admin routes; **FE offline layer still missing**.

**Hardware integration** (nothing built, web-first by design — Windows is explicitly excluded per
the proposal's own POS platform scope):

- Barcode scanners that act as keyboards (most handheld ones do) already work today, zero backend
  change — `product-search-panel.tsx`'s search input is the "scanner input."
- Receipt printers: prefer network/Bluetooth ESC/POS over USB-only, since a browser can reach the
  former directly.
- Cash drawer: usually rides on the printer's kick-out cable rather than its own integration.
- Card reader: a cloud-connected smart terminal (Stripe Terminal-style) — the app only ever handles
  a payment-intent reference, keeping PCI scope off this codebase.
- Exact models are still unconfirmed by the client (open question, carried from
  `Backend-Build-Guide.md` §9) — the network/Bluetooth-vs-USB distinction should be settled before
  committing to a vendor SDK.

**Real auth beyond PIN** (partially done for soft-launch):

- ~~Terminal `accessCode` needs real hashing + server-side verification~~ **Done** (bcrypt hash).
- ~~Manager PIN any-4-digit client shortcut~~ **Done** — hashed PIN on manager/owner/admin users,
  verified server-side; `approvedBy` is the approving user id.
- Still open: dedicated `POS.ApproveDiscount` / `POS.ApproveRefund` permission model and a real
  cashier account hierarchy (vs. session name + terminal access code).

## Open questions to flag (not blocking this plan, but worth raising)

- Exact barcode scanner / receipt printer / cash-drawer hardware models — still unanswered by the
  client (carried over from `Backend-Build-Guide.md` §9).
- Whether terminals ever need a real manager/cashier account hierarchy (vs. today's login user +
  per-terminal access code + manager PIN) before the login step is more than a soft-launch prop.
- POS offline-sync reconciliation UX (who clears a negative-stock flag, how) is the same open item
  already flagged for Inventory/Fulfillment — POS inherits it rather than needing a separate answer.
- Whether POS terminals need real device "enrollment" once offline mode is built — today's
  `accessCode` is a login credential, not a device certificate; the SRS's `device_identifier`
  field is unused for now.
