# Backend Build Guide

## Purpose

Every module in this repo is currently a frontend mock — a `*.service.ts` file
wrapping an in-memory array in `async` functions with a fake delay, called via React
Query exactly like a real API would be. Swapping a mock service's body for a real
`fetch()` is meant to be a one-file change with zero changes in any component that
consumes it.

This doc is the module-by-module contract for that swap: entity shapes (copied from the
actual TypeScript types, not redescribed from memory — paths given so you can diff
against the real thing), the endpoints each mock service implies, and — the part that
actually matters, since it's not visible from types alone — **which business rules only
exist as client-side `zod` checks today and need real server-side enforcement.**

This is **not** a schema doc. `docs/source/inv-pos-hr-tenant-SRS.md` §33 has a proposed
Postgres schema; pair it with this.

**This project is large and still growing** (Phase 2 = Inventory just landed, Phase 3 =
POS/HR/Payroll/Calendar/Social is still ahead — see `docs/architecture/Project-Structure.md`
§5). Treat every shape below as a *starting* contract, not a final spec:

- Prefer additive migrations (nullable columns, new tables) over rigid constraints that
  fight the next phase.
- Where a field is a fixed union today (`InvoiceStatus`, `AdjustmentReason`,
  `TransferStatus`, etc.), consider whether it should be backed by a lookup table
  instead of a hard `CHECK`/`ENUM` — several of these are explicitly expected to gain
  values as the client's Q&A rounds continue (see §9 open questions).
- Every domain below will eventually need pagination, filtering, and bulk-export
  endpoints beyond what's listed — the lists here are what today's UI calls, not a
  ceiling.

Stack, per the signed proposal (`docs/source/MRM_Project_Proposal_v2.pdf` §4): Node.js
(Express) or Laravel, PostgreSQL, SendGrid, Twilio, FCM, Stripe + Telr, server-side PDF
(Puppeteer/PDFKit). Nothing below is prescriptive about framework choice beyond that.

---

## 1. Cross-cutting rules

1. **Multi-tenant on every table, every query.** `tenant_id` filtered server-side from
   the session — never from a client-supplied param.
2. **Fixed predefined RBAC roles** — Owner, Admin, Inventory Manager, Sales/Cashier,
   Accountant, Viewer (no custom role builder in Phase 1). Permissions are
   module/action pairs (`Invoice.Approve`, `Inventory.Adjust`, ...), optionally scoped
   to a branch/warehouse.
3. **No full double-entry accounting yet** — mutating endpoints should emit a
   structured integration event (queue message or `integration_events` row) with
   enough data for a future Accounting module to build a journal entry, not a full
   ledger post.
4. **Every mutation gets audited** — see §3.4's `AuditLogEntry` shape; every
   create/update/delete/suspend/reactivate across every module writes one row.
5. **Single base currency per tenant**, transactions optionally in a foreign currency
   converted at transaction-date rate.
6. **Every money movement needs a document.** No bare balance mutation — always a
   real Invoice/Payment/Adjustment behind it.
7. **Subscription-status gating is not built on the frontend at all** and must be real
   middleware: `Active → Read-Only (expired, no grace period) → Pending Deletion
   (configurable retention, default 30–90 days) → Cancelled`. Every state-changing
   endpoint across every module must reject once a tenant is past `Active`.
8. **Seat enforcement is also not built on the frontend.** Counts: owner/admin/staff/
   POS-cashier logins. Doesn't count: service accounts, read-only auditors. Reject user
   creation past the seat cap with an upgrade-plan error, never silent overage billing.

---

## 2. Identity & Auth

`src/types/identity.ts` — `Me { id, name, email, realm: "admin"|"tenant", permissions:
string[], tenant?: { id, name, subdomain, plan, activeModules } }`.

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `POST /auth/password/request-reset`, `POST /auth/password/reset`
- `POST /tenant/signup` — self-serve, creates the tenant immediately (not
  sales-assisted), returns `Me` + session, same shape as login.
- **Realm resolves server-side from the account** — never a pre-login client choice.

---

## 3. Super Admin / Platform

Source: `src/app/(admin)/modules/*`.

### 3.1 Tenants (`modules/tenants/`)

`Tenant { id, name, legalName, email, phone, address, planId, status, billingCycle,
extraSeatsPurchased, createdAt, renewalDate, pendingDeletionAt?, users: TenantUser[] }`.

`GET /admin/tenants[/:id]`, `POST /admin/tenants/:id/suspend`,
`POST /admin/tenants/:id/reactivate`, `POST /admin/tenants/:id/seats { count }`,
`PATCH /admin/tenants/:id`.

Seat usage / MRR: reuse the exact same seat-pricing formula as §5.1 (public pricing) —
don't let admin and public compute this two different ways.

### 3.2 Plans (`modules/plans/`)

`Plan` (`src/types/plan.ts`): `{ id, name, priceMonthly, priceYearly, baseSeats,
additionalSeatPrice, trialDays, modules: ModuleKey[], popular?, minSeats, maxSeats? }`.

`GET /plans[/:id]`, `POST /plans`, `PATCH /plans/:id`, `DELETE /plans/:id`. This must be
the single live source both `/pricing` and `/signup` read from — today they don't
actually share state (`plansService` is a client-side mock with no cross-tab sync); a
real `GET /plans` fixes that automatically.

`ModuleKey` (`src/lib/permissions/index.ts`) already lists every module across all
three phases (`accounting`, `sales`, `purchasing`, `inventory`, `banking`, `crm`,
`reports`, `ai-assistant`, `pos`, `hr-payroll`, `calendar-booking`, `social-media`) —
plans can gate a module ahead of it existing, so don't tie this table to only what's
built today.

### 3.3 Payments (`modules/payments/types.ts`)

`PaymentTransaction { id, tenantId, tenantName, reference, planName, type:
"subscription_charge"|"additional_seat"|"refund", amount, method: "card"|"bank"|
"paypal", status: "paid"|"failed"|"pending"|"refunded", date }`.

Read-only list today (`GET /admin/payments`) — real gateway integration (charge
creation, webhooks, refunds) doesn't exist on the frontend and is genuinely new work.

### 3.4 Audit Log (`modules/audit/types.ts`)

`AuditLogEntry { id, timestamp, userName, userEmail, tenantId: string|null, tenantName:
string|null, module, entity, entityLabel, action: "create"|"update"|"delete"|"suspend"|
"reactivate"|"login"|"export", oldValues, newValues, ipAddress }`.

`GET /admin/audit`, filterable by tenant/module/action/date/user. This is the sink
every other module's mutations write into (§1 rule 4).

### 3.5 Settings (`modules/settings/types.ts`)

Only General/Legal/Social are built on the frontend; Notifications and Payment-gateway
toggles don't exist yet. `RETENTION_DAYS` and retainer alert thresholds (§6.7) are
currently hardcoded constants that should become real fields on this settings object.

---

## 4. Public site

`GET /plans` (public-readable variant of §3.2), `POST /tenant/signup` (§2),
`POST /contact`.

**Seat-pricing formula** — must match everywhere price is computed
(pricing page, signup summary, admin MRR):

```
extraSeats = max(0, seats - plan.baseSeats)
monthly = plan.priceMonthly + extraSeats * plan.additionalSeatPrice
yearly  = plan.priceYearly + extraSeats * round(plan.additionalSeatPrice * 12 * 0.8)
effectiveSeats = min(plan.maxSeats ?? Infinity, max(plan.minSeats, requestedSeats))
```

---

## 5. Sales & Invoicing

Source: `src/app/(tenant)/dashboard/invoices/`. The most fully client-confirmed module
— every rule below traces back to `docs/plans/Sales-Invoicing-Implementation-Plan.md`'s
Key Decisions or `docs/source/client-qa-retainers.md`.

### 5.1 Customers (`../modules/crm/types.ts`)

`Customer { id, customerCode, name, email, phone, address, trn, currency, creditLimit,
openingBalance, status: "active"|"inactive" }`. Plain CRUD.

### 5.2 Invoices

```ts
type InvoiceStatus = "draft" | "sent" | "partially-paid" | "paid" | "cancelled";
type InvoiceSource = "manual" | "estimate" | "recurring" | "pos" | "debit-note" | "credit-note" | "retainer" | "retainer-topup";
type InvoiceLine = { id; description; quantity; unitPrice; taxRate; total; productId?: string; warehouseId?: string };
type Payment = { id; date; amount; method: "bank-transfer"|"card"|"cash"|"cheque"|"mobile-payment"|"retainer"; reference? };
type Invoice = {
  id; number; // INV-0045, own sequence, separate from POS-000001
  customerId; issueDate; dueDate; currency; lines: InvoiceLine[];
  subtotal; discountPercent?; discount; tax; total; paidAmount;
  status: InvoiceStatus; source: InvoiceSource;
  notes?; createdBy; createdAt; sentAt?; lastReminderAt?; cancelledAt?;
  payments: Payment[];
};
```

**`overdue` is never a stored status** — computed as `sent`/`partially-paid` past due
with a balance remaining. Same derive-don't-store pattern applies to Proposals (§5.4)
and Retainers (§5.6).

Rules to enforce server-side (currently `zod`-only): drafts reserve nothing; multiple
partial payments accumulate (`paidAmount`, `fullyPaid = paidAmount >= total - 0.005`);
QR defaults to a payment link, but **swap to the jurisdiction's e-invoicing format
(e.g. ZATCA) if the tenant's market mandates it** — unresolved which markets need this,
confirm before locking format; PDF generation needs to move server-side.

Endpoints: `GET /invoices[/:id]`, `GET /invoices/next-number`, `POST /invoices { input,
mode: "draft"|"send", source? }`, `PATCH /invoices/:id`, `POST /invoices/:id/send`,
`POST /invoices/:id/record-payment`, `POST /invoices/:id/cancel`,
`POST /invoices/:id/send-reminder`.

### 5.3 Recurring Invoices (`recurring/types.ts`)

`RecurringTemplate { id, number, customerId, description, currency, amount, frequency:
"weekly"|"monthly"|"quarterly"|"yearly", nextInvoiceDate, status: "active"|"paused",
kind?: "invoice"|"retainer-topup", retainerId?, lastInvoiceId?, lastGeneratedAt?,
createdAt }`.

**Generation is manual-trigger only ("Generate Now") — never a background scheduler**,
explicit client decision. `"invoice"` templates generate a draft; `"retainer-topup"`
templates generate an already-paid invoice. Worth adding a per-template `autoSend`
opt-in when you build this — flagged as a real gap, not built on the frontend.

### 5.4 Proposals

Merged with "Estimates". `Proposal { id, number, customerId, date, expiryDate,
currency, lines, subtotal, discountPercent?, discount, tax, total, status: "draft"|
"sent"|"accepted"|"rejected", notes?, createdBy, createdAt, sentAt?, respondedAt?,
convertedInvoiceId? }`. `"expired"` is derived (`sent` + past expiry), never stored.

`POST /proposals/:id/convert-to-invoice` → draft Invoice (`source: "estimate"`), sets
`convertedInvoiceId`. **Check that field server-side** — a converted proposal can't
convert twice.

### 5.5 Credit & Debit Notes (one entity, `kind` field — deliberately not two models)

`Adjustment { id, number, kind: "credit"|"debit", customerId, invoiceId?, amount,
reason, currency, status: "issued"|"void", createdBy, createdAt, voidedAt? }`.

Issued immediately, no draft stage. `POST /adjustments/:id/convert-to-invoice` — only
for standalone notes (`!invoiceId`) — positive-value invoice for debit, negative for
credit. **Not built on the frontend but required by the client's own answer here**: a
credit note tied to a physical return should also trigger Inventory's return flow
(sellable → restocked; damaged → quarantine). Add `linkedReturn`/`returnCondition`
fields now if you're building this alongside Inventory.

### 5.6 Retainers — most-specified entity in the codebase

Read `docs/plans/Sales-Invoicing-Implementation-Plan.md` Phase H / Key Decisions #6–14
and `docs/source/client-qa-retainers.md` before implementing — summarized:

```ts
type Retainer = {
  id; number; customerId; contractAmount; billingPeriod: "monthly"|"quarterly"|"yearly";
  billingModel: "one-time"|"recurring"; remainingBalance; currency;
  status: "active"|"paused"|"closed"; startDate; expiryDate?; notes?; createdBy; createdAt;
  usage: { id; date; amount; note? }[];
  fundingInvoiceId?; dispositionReason?: "forfeited"|"refunded"|"transferred"|"rolled-over";
  transferredToRetainerId?; rolledOverFromRetainerId?; rolledOverToRetainerId?; refundAdjustmentId?;
};
```

Server-enforced rules:

1. Creation generates a Paid funding Invoice (`source: "retainer"`) for the full amount.
2. `POST /retainers/:id/draw-for-invoice` deducts `min(invoice.total, remainingBalance)`
   — **hard cap, no override.** Shortfall becomes a normal partial payment
   (`method: "retainer"`) — no separate split-payment mechanism needed.
3. Every draw generates a real Invoice — no invoice-less "record usage" path.
4. Draws auto-pay when covered — no confirm step.
5. Recurring top-up (`kind: "retainer-topup"` template) generates a Paid invoice
   (`source: "retainer-topup"`) and **adds to** `remainingBalance`, never resets it.
6. `POST /retainers/:id/transfer { toRetainerId }` — moves full balance to another
   active retainer, closes source (`dispositionReason: "transferred"`). Self-serve.
7. `POST /retainers/:id/roll-over { newExpiryDate }` — closes this one, creates a new
   one seeded with the leftover, no new funding invoice. Self-serve.
8. `POST /retainers/:id/forfeit` — zeroes balance, no invoice. **Requires
   `retainer.approve` permission.**
9. `POST /retainers/:id/refund { reason }` — standalone credit `Adjustment` for
   `remainingBalance`, converted to a real negative-value invoice. **Requires
   `retainer.approve`.**

Rules 2–9 are inferred defaults reasoned from the client's philosophy elsewhere, not
directly re-confirmed — worth a sanity check with the client before this ships, even
though it's fully built and working. Same for who holds `retainer.approve` — currently
assumed to be the tenant's own Owner/Admin, not platform staff.

### 5.7 Alerts

Computed live on every read from retainer data — no alerts table, no background job.
`GET /alerts` should replicate: expiry within `expiringWithinDays` (14) or balance below
`lowBalancePercentRemaining` (20%). Move both thresholds into real Settings (§3.5)
rather than hardcoding.

### 5.8 Reports

Sales trend, Invoice list, Customer statement — all derive live from
Invoices/Payments/Adjustments/Customers, no separate reporting dataset. All three need
CSV export.

---

## 6. Product-linking on invoice lines (built, but isolated demo data)

`InvoiceLine.productId`/`warehouseId` are populated today by a real UI
(`components/product-picker.tsx`, `components/line-items-editor.tsx`) but from an
isolated 10-item demo catalog (`api/product-lookup.service.ts`,
`mock/product-lookup-seed.ts`, shapes `ProductLookupItem { id, name, sku, price,
stockByWarehouse }` / `WarehouseOption { id, name }`) — deliberately not wired to real
Inventory, to avoid touching that module mid-build.

**When building the real backend, delete this mock service and point the same frontend
component at `GET /inventory/products?warehouseId=`** — the shapes above were designed
to match what a real Inventory products endpoint should return, specifically for this
swap to be low-effort. The same demo catalog is also what Delivery/Fulfillment
(`docs/plans/Sales-Invoicing-Implementation-Plan.md` Phase I, built) deducts against via
`productLookupApi.deduct()` — and now POS too, indirectly: every POS checkout calls
`fulfillmentsApi.autoFulfillPos()` (§7.2), which calls the same `deduct()`. Three
consumers, one service file — do all three swaps together when the real Inventory API
exists.

---

## 7. POS

Source: `src/app/(tenant)/dashboard/pos/`
(`docs/plans/POS-Implementation-Plan.md` has the full frontend build notes — component
breakdown, flow diagram, decision log; this section is the backend contract for it).
**Frontend is built as a web-only demo** — start shift → sell → checkout → receipt → end
shift, plus refunds and terminal admin. **Offline mode, real hardware, and native apps
are explicitly not built** (§7.4/§7.5 below) — the demo simulates them (a receipt
preview instead of a real print job, a text input instead of a real scanner feed).
Requirements for all of it are in `docs/requirements/Client-Requirements-Phase1.md` §4.

### 7.1 Entities

```ts
// A terminal is admin config — not a hardware-enrollment record. accessCode
// gates who can start a shift on it (§7.2), separate from the manager-
// approval PIN used for discount overrides/refunds (§7.3).
type PosTerminal = {
  id; name; code;              // code shown on receipts
  warehouseId: string;         // every sale through this terminal deducts from here — client-confirmed (4.1)
  accessCode: string;          // demo: plain string, client-side compare — needs a real hash+server check (§7.6)
  status: "active" | "inactive";
};

// One open→close shift on a terminal.
type PosSession = {
  id; terminalId; openedBy: string; openedAt: string; openingCash: number;
  closedAt?; closingCashCounted?; expectedCash?; variance?;
  status: "open" | "closed";
};

// Cart is client-only while shopping; becomes PosSale.lines on checkout.
type CartLine = { productId; name; sku; unitPrice; quantity; taxRate; discountAmount? };
type PosPayment = { method: "cash" | "card" | "mobile-payment"; amount: number };

type PosSale = {
  id; number: string;           // POS-000001 — own sequence, separate from INV- (client-confirmed, 4.7)
  sessionId; terminalId;
  warehouseId: string;          // denormalized from the terminal at sale time
  customerId?; lines: CartLine[]; payments: PosPayment[];
  subtotal; discount; tax; total;
  status: "completed" | "partially-refunded" | "refunded";
  fulfillmentId?: string;       // set once stock deduction runs — see 7.2
  createdBy: string;            // = the session's openedBy
  createdAt: string;
};

type PosRefund = {
  id; saleId;
  lines: { productId; quantity; condition: "sellable" | "damaged" }[];
  amount; reason; approvedBy: string;   // manager-PIN gate, client-confirmed (4.4)
  createdAt: string;
};
```

### 7.2 Endpoints and the sale/stock transaction

Terminals (admin): `GET/POST /pos/terminals`, `GET/PATCH /pos/terminals/:id`,
`POST /pos/terminals/:id/status`.

Sessions: `GET /pos/sessions`, `GET /pos/sessions/:id`,
`GET /pos/terminals/:id/open-session` (the frontend's `getOpenForTerminal` — **must be
enforced server-side that a terminal can only have one open session at a time**,
client-confirmed one-drawer-one-owner rule, 4.4), `POST /pos/sessions` (open, validates
`accessCode` server-side — see §7.6), `POST /pos/sessions/:id/close`.

Sales: `GET /pos/sales`, `GET /pos/sales/:id`, `GET /pos/sales/next-number`,
`POST /pos/sales` (checkout), `POST /pos/sales/:id/refund`.

**Checkout must be one atomic transaction**, not two separate calls the frontend happens
to sequence:

1. Validate the session is open and belongs to the terminal in the request.
2. Assign the next `POS-######` number — **use a real sequence/lock, not read-then-increment**;
   the mock frontend's in-memory counter has an obvious race condition under concurrent
   checkouts that a real backend must not repeat.
3. Deduct stock at the terminal's warehouse for every line — same mutation Delivery/
   Fulfillment's `POST /inventory/stock-movements` uses (§6, `trigger: "pos-auto"`).
   **Never blocks on insufficient stock** — post it anyway and flag
   `pending-reconciliation`, exactly like the B2B fulfillment path (§8's negative-stock
   rule). This is what `fulfillmentsApi.autoFulfillPos()` does client-side today; it's
   this endpoint's first real caller.
4. Persist the `PosSale` row, `createdBy` set from the session's `openedBy` server-side
   — **never trust a client-supplied cashier name.**
5. If any step fails, the whole checkout rolls back — a half-deducted, unsaved sale is
   the one outcome that must never happen.

**Refund** (`POST /pos/sales/:id/refund`): requires manager approval server-side (§7.3,
not just a client PIN prompt). Sellable lines restock (reverse of step 3 above); damaged
lines are recorded but don't restock — no real "quarantine" stock status exists in
Inventory yet (§8's `Product`/`StockAdjustment` don't have one either); adding it means
extending Inventory, out of this section's scope without that separate decision.

**Close session** (`POST /pos/sessions/:id/close`): `expectedCash` must be **computed
server-side** from the session's actual sales/refunds — never accept it from the client.
Formula: `openingCash + Σ(cash payments on sales in this session) − Σ(refund amounts
against those sales)`. The frontend's mock assumes every refund was paid back in cash;
a real build should track each refund's own payment method instead and net only the
cash ones.

### 7.3 Manager-approval gate

Client-confirmed (4.4): **manager PIN/approval required for POS discounts, voids, and
refunds.** The frontend demo (`ManagerPinDialog`) accepts any 4-digit string — this is
explicitly a placeholder, not a design to replicate. Real backend needs:

- A real permission check (`POS.ApproveDiscount` / `POS.ApproveRefund`-style, matching
  the module/action permission pairs already used elsewhere, SRS §11.14) tied to an
  actual manager account, not a shared PIN typed into the cashier's own screen.
- The approving user's real identity recorded as `approvedBy` — not a literal string
  like `"Manager (PIN)"` the way the demo does it.

### 7.4 Offline mode — client-confirmed requirements, not built

None of this exists in the frontend demo (web-only, always-online). Requirements, per
`docs/source/client-qa-inventory-pos-tenant.md` Q16–Q18 and
`Client-Requirements-Phase1.md` §4.2/§4.3:

- **Allowed offline**: sales (the core operation), basic customer lookup/creation,
  standard pre-configured discounts (percentage/fixed rules already synced to the
  device).
- **Online-only**: refunds, manager-override discounts — higher fraud/error risk,
  safer once the register has live data to verify against.
- **Stock can't be verified offline — the sale still proceeds anyway.** Blocking a sale
  over a connectivity issue is worse than an occasional oversell reconciled afterward.
- **Sync-conflict rule**: "sync in timestamp order, allow negative stock temporarily" —
  when multiple offline terminals sell the same low-stock item, accept *every*
  transaction as a valid sale (never reject a completed customer sale after the fact),
  let stock go negative if oversold, and surface an alert to the Inventory Manager to
  reconcile. The system never programmatically "undoes" a completed sale.
- **Failed sync**: automatic retry with exponential backoff first, escalating to a
  manual-resolution queue only after repeated failures, surfaced to an admin with the
  full transaction payload — nothing silently lost.
- **Offline transaction shape** (SRS §11.5/§22.4): offline transaction ID, device ID,
  terminal ID, timestamp, local sequence number, transaction payload, sync status.
  **Server prevents duplicate creation via an idempotency key on sync** — the offline
  transaction ID doubles as that key.

Implementation shape this implies, not yet built anywhere:

- A local queue on the terminal device (IndexedDB/service worker in a browser-based
  build, or native local storage in a packaged app) holding unsynced `PosSale`/
  `PosRefund`-shaped records with the offline-transaction fields above.
- `POST /pos/sales/sync` — batch endpoint accepting an array of queued transactions,
  each keyed by its offline transaction ID; returns per-item accept/reject/duplicate
  status so the device can clear its queue incrementally.
- The checkout transaction in §7.2 step 3 (stock deduction) is exactly where the
  negative-stock-allowed rule already documented for Fulfillment/Inventory (§6, §8)
  does double duty here — the same "never block, flag instead" behavior is what makes
  the offline-sync conflict rule safe to implement without new stock-side rules.

### 7.5 Hardware integration — not built, and deliberately web-first

The frontend demo simulates every physical device (a receipt *preview* dialog instead
of a real print job, a plain text input instead of a real scanner feed). Per the
proposal (`MRM_Project_Proposal_v2.pdf` §4), Windows is explicitly excluded as a POS
platform and the scope is Web + Android + iOS — so hardware choices should favor
network/Bluetooth-capable devices over USB-only ones a browser can't reach directly:

- **Barcode scanner**: most handheld scanners already act as a keyboard (HID) — they
  "type" the barcode into whatever's focused, which is exactly what
  `product-search-panel.tsx`'s search input already handles with zero extra code. No
  backend work needed for this class of scanner. A camera-based/native scanning API
  would be a frontend addition (e.g. the Barcode Detection API or a native app camera),
  not a backend concern.
- **Receipt printer**: prefer network (IP) or Bluetooth ESC/POS printers over USB-only
  — a backend/edge service can send print jobs to a network printer's IP directly;
  Bluetooth printers need a native/PWA bridge on the device itself. `receipt-dialog.tsx`
  already renders the printable content; only the "send it to a real printer" transport
  is missing.
- **Cash drawer**: typically triggered by the receipt printer's kick-out cable (opens
  automatically on print) rather than its own separate integration — so this usually
  falls out of the printer choice above, not a separate hardware contract.
- **Card reader**: use a cloud-connected smart terminal (Stripe Terminal or equivalent)
  that talks to the payment processor directly over WiFi/Bluetooth — the app only ever
  handles a payment-intent reference, never raw card data, which keeps PCI scope off
  this codebase entirely. This is additive to `payment-dialog.tsx`'s existing `card`
  payment method, not a redesign of it.

**Exact models for all of the above are still unconfirmed by the client** — carried
over as open question in §9. Confirm hardware choices *before* committing to a specific
vendor SDK, since the network/Bluetooth-vs-USB distinction changes which integration
path is even viable.

### 7.6 Other server-side rules currently only client-side

- **Terminal `accessCode`** is compared as a plain string client-side in the demo —
  needs a real server-side check (hashed at rest, verified server-side, ideally rate-
  limited) once this isn't a demo.
- **One open session per terminal** — enforced by a `find()` in the mock service;
  needs a real unique-constraint-or-equivalent server-side (e.g. a partial unique index
  on `terminal_id` where `status = 'open'`) to survive concurrent requests.
- **Numbering** — see §7.2 step 2; same "don't repeat the mock's race condition" note
  applies to `POS-######` as to every other numbered document in this codebase.

---

## 8. Inventory & Procurement

Source: `src/app/(tenant)/dashboard/(inventory)/`. UI-complete against mock data, and
every mutating dialog has a `// TODO: replace with …Api…` marker — the most
mechanical swap of all the modules, no business-logic archaeology needed.

**Known gap to fix in the real schema**: stock isn't tracked per-warehouse today
(`Product.stock` is one global number) — the real schema needs a genuine
`(product_id, warehouse_id) → quantity` relationship. Everything else in this section
depends on that existing.

| Entity | Shape (source file) | Key rule |
| :--- | :--- | :--- |
| `Product` | `products/mock-data.ts`: `{ id, name, sku, category, stock, price, status }` | replace `stock` with the per-warehouse relationship above |
| `Warehouse` | `warehouses/mock-data.ts`: `{ id, name, location, manager, totalItems, totalValue, capacity, occupancy, status, address, contactNumber, email, createdAt, stockByCategory[] }` | — |
| `StockMovement` | `stock-movement/mock-data.ts`: `{ id, datetime, kind: "inbound"\|"outbound"\|"adjustment"\|"transfer", productName, sku, category, sourceWarehouse, destinationWarehouse, quantity, reference, status }` | **build this table first** — it's the ledger every other mutation below should write into. Real schema needs real FKs, not names/free-text |
| `GoodsReceipt` / `PurchaseOrder` | `goods-receipt/mock-data.ts` | stock increases **only on GR confirm/post**, never at PO creation or bill entry. Partial receipt supported — PO stays open until fully received or manually closed. Vendor Bill never moves stock independently |
| `StockAdjustment` | `adjustments/mock-data.ts`: `{ id, date, type: "add"\|"deduct", productName, sku, category, warehouse, quantity, reason, reference, status: "approved"\|"pending" }` | requires Owner/Manager approval — no UI trigger for that action exists yet |
| `PurchaseReorder` / `LowStockItem` | `reorder/mock-data.ts` | suggested qty = `max(reorderPoint * 2 - currentQty, 1)`; PO requires Owner/Manager approval |
| `StockTransfer` | `stock-transfer/mock-data.ts`: `{ id, fromWarehouse, toWarehouse, productName, sku, category, quantity, unit, transferDate, expectedDelivery, status }` | full workflow is **Request → Approve → Dispatch → Receive** — stock leaves source at Dispatch (goes in-transit), lands at destination only at Receive |
| `Batch` | `batches/mock-data.ts` | FEFO tracking, display-only today — no real consumption/selection algorithm exists yet, needs design work before it connects to sales |
| Valuation | `valuation/mock-data.ts` | **Weighted Average Cost for Phase 1** (not FIFO) — client-confirmed. FIFO flagged as a possible future per-tenant setting, not built now |

**Negative stock — applies across every mutating endpoint above**: allowed, never
hard-blocked, but must set a real `PENDING — stock confirmation missing` flag on the
affected stock record for reconciliation. The flag/state is client-confirmed; the
reconciliation workflow that clears it is not — raise before finalizing.

**Sequencing**: Products+Warehouses+per-warehouse stock → Stock Movement ledger →
Goods Receipt/PO → Stock Transfer → Adjustments/Reorder/Batches/Valuation → swap
`product-lookup.service.ts` (§6) for the real endpoint.

---

## 9. Open questions — don't silently assume answers here

1. Sub-role structure beyond one flat Super Admin role (SRS names three tiers, Phase 1
   shipped one).
2. Two-vs-three "realm" architecture — open per `Project-Structure.md` §7.
3. Negative-stock reconciliation *workflow* (the state itself is decided, §8).
4. Serial-number tracking scope — which categories need it isn't specified.
5. POS hardware models — left blank by the client; see §7.5 for the web-first
   recommendation this leads to regardless of the exact answer.
6. Tax-QR format per jurisdiction — confirm before locking beyond the payment-link default.
7. Delivery/Fulfillment — frontend is built (`docs/plans/Sales-Invoicing-Implementation-Plan.md`
   Phase I: manual/delivery-note fulfillment for B2B, negative-stock alerting) and POS
   now exists too, so its `autoFulfillPos()` caller (§7.2 step 3) is reachable — the
   demo checkout genuinely calls it. Still against the isolated demo catalog either way.
   Backend needs the real `POST /inventory/stock-movements` endpoint both deduct against
   once built (Phase I-F/§7.2), plus the delivery-note PDF view (Phase I-C) isn't built
   on either side yet.
8. Retainer rules 2–9 in §5.6 — inferred defaults, not directly re-confirmed.
9. Who holds `retainer.approve` — assumed tenant Owner/Admin, not platform staff.
10. Branch-level vs. warehouse-level permission interaction — SRS supports both, doesn't
    specify how they combine.
11. POS offline-sync conflict handling (§7.4) is client-confirmed at the policy level
    ("accept every transaction, allow negative stock, alert to reconcile") but no one has
    confirmed the actual reconciliation UX — same open item already flagged for Inventory
    (#3 above); POS inherits it rather than duplicating a separate answer.
12. Whether POS terminals need real device/hardware "enrollment" beyond the admin-created
    `PosTerminal` config record once offline mode is actually built — today's `accessCode`
    is a login credential, not a device certificate, and offline sync may need the latter
    too (SRS's `device_identifier` field, currently unused — §7.1/§7.4).
13. Who's allowed to hold `POS.ApproveDiscount`/`POS.ApproveRefund`-style permissions
    (§7.3) — assumed a tenant's own manager/admin, same open question as
    `retainer.approve` (#9), not yet asked of the client specifically for POS.
