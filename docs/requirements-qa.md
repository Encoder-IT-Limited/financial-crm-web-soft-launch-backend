# Requirements Clarification Q&A

Decisions made during requirements clarification, to be treated as authoritative overrides/refinements of the base [SRS](./SRS.md) where they conflict.


## Multi-Tenancy Architecture

**Q: Will each tenant have a different database, a shared database, or something in between — and how is a tenant identified per request?**
A: Schema-per-tenant within a single shared Postgres database, combined with subdomain-based tenant resolution (`acme.yourapp.com`). A shared `public` schema holds the tenant registry and platform-level tables; each tenant gets its own Postgres schema containing the full set of tenant-owned tables. Chosen over full database-per-tenant (too much ops/migration/connection overhead for the expected tenant count) and over pooled shared-schema+`tenant_id` (weaker isolation — relies on every query remembering to filter). Comfortable up to ~1,000–2,000 tenants; revisit if tenant count trends toward five figures. Full detail: [Database Design §1a](./database-design.md#1a-multi-tenancy-strategy-decision).

## Subscription & Seats

**Q: Exactly which users will be counted as subscription seats, and what will the system do when the seat limit is exceeded?**
A: Count every user account with an active login under the tenant — owner, admins, staff, and POS cashiers alike — toward the seat limit; service/API accounts and read-only auditors should not count. When a tenant tries to add a user beyond their plan's seat count, block the creation with a clear "upgrade your plan" message.

**Q: When a subscription expires, will the tenant be immediately suspended, or will there be a grace period?**
A: No grace period — the tenant moves to a read-only/suspended state immediately on expiry: users can still log in and view/export data, but cannot create new transactions (sales, invoices, stock movements) until payment is resolved. Full data deletion should still only happen after a much longer retention window (e.g., 30–90 days) — immediate suspension is about blocking new activity, not wiping data.

## Roles & Permissions

**Q: Can tenants create custom roles and permissions, or will only predefined roles be available?**
A: Ship a fixed set of predefined roles in Phase 1 (e.g., Owner, Admin, Inventory Manager, Sales/Cashier, Accountant, Viewer).

## Procurement & Approvals

**Q: Will Purchase Orders require approval? If yes, who will be responsible for approval?**
A: Yes — Owner / Manager.

**Q: Will Inventory Adjustments and Stock Transfers require approval?**
A: Yes — Owner / Manager.

## Inventory

**Q: Will negative stock be allowed, or will the transaction be blocked when there is insufficient stock?**
A: Allowed transaction, but it should go to a `PENDING_UPLOAD` state for "stock confirmation missing."

**Q: What will be the batch stock issuing rule — FIFO, FEFO, or manual batch selection?**
A: Default to FEFO (first-expired, first-out) for anything with an expiry date, since that's what actually cuts down on spoilage and waste. For items without expiry tracking, fall back to plain FIFO. Staff can still manually pick a different batch when needed (e.g., a customer asks for a specific one); the system auto-suggests the right batch by default.

**Q: What will be the stock valuation method — FIFO, Weighted Average, or another method?**
A: Weighted Average Cost for Phase 1 — simpler to build since it avoids tracking separate cost layers per batch, and works fine across most business types. FIFO is the go-to alternative for tenants in industries where pricing swings a lot and exact cost layers matter (e.g., import/export) — can be added as a per-tenant setting later if there's demand.

**Q: At which stage will a Goods Receipt increase stock — when the receipt is confirmed/posted, or at another stage?**
A: Stock increases when the Goods Receipt is confirmed/posted — not when the PO is created, and not when the vendor bill is entered. This keeps "what's on the shelf" tied to a physical, verifiable event.

**Q: Should Partial Goods Receipt be supported?**
A: Yes — near a hard requirement, since vendors routinely ship in multiple batches. The PO should track received-vs-ordered quantity per line and stay "Open" until fully received or manually closed.

**Q: Will Stock Transfer be direct, or will it follow a Request → Approve → Dispatch → Receive workflow?**
A: Full Request → Approve → Dispatch → Receive workflow. Stock leaves the source warehouse at Dispatch (moved to an "in-transit" state) and only lands in the destination warehouse at Receive — gives visibility into transfers that are lost, short, or delayed in transit.

**Q: At which stage will an Invoice deduct inventory — when the invoice is issued/posted, when payment is received, or when the goods are delivered?**
A: For straightforward retail/POS sales, deduct at the point the sale/invoice is posted (issued), since goods physically leave with the customer at that moment. For invoice-first B2B workflows where delivery happens separately from invoicing, deduct at Delivery/fulfillment instead and treat the Invoice as a purely financial document. Phase 1 should support both by tying deduction to a "fulfillment"/"delivery" event — triggered automatically for POS sales, manually/via a delivery note for B2B invoices.

**Q: Will a Vendor Bill affect inventory, or will only the Goods Receipt increase inventory while the Vendor Bill is used for accounting purposes?**
A: Only the Goods Receipt increases inventory. The Vendor Bill is a purely financial document (records the payable, matches against PO/GR) and never independently moves stock — otherwise risk double-counting when a bill and receipt are entered for the same delivery at different times.

**Q: Will a Draft Invoice reserve stock?**
A: No. Reserving stock on a draft risks tenants accumulating phantom reservations that block real sales. If pre-commitment reservation is needed, use a separate explicit "Sales Order" or "Quote with hold" concept in a later phase.

**Q: Will each POS Register be linked to a specific warehouse/location, with stock deducted from that warehouse?**
A: Yes — every POS Register is configured with a single linked warehouse/location, and all sales through that register deduct from that warehouse's stock. Essential for multi-location retail chains to keep stock counts accurate per site.

**Q: Will returned products automatically be added back to inventory? How should damaged returns be handled?**
A: Sellable-condition returns automatically go back into available stock at the original warehouse. Damaged returns need a distinct disposition path — route them to a "damaged/quarantine" stock status (not sellable, not counted in available inventory) rather than deleting them or silently mixing them back into sellable stock; a manager can then write them off via the Inventory Adjustment flow.

## Offline POS

**Q: If the POS is offline, which operations will be allowed — only sales, or also customer creation, discounts, refunds, etc.?**
A: Support sales as the core offline operation, plus basic customer lookup/creation and standard discounts configured ahead of time (percentage/fixed rules already synced to the device). Reserve refunds and manager-override discounts for online-only in Phase 1 — higher fraud/error risk, easier to get right once the register has live data to verify against.

**Q: If multiple offline POS registers sell the same stock, how will stock conflicts be handled during synchronization?**
A: Apply a "sync in timestamp order, allow negative stock temporarily" rule: when multiple offline registers sync sales for the same low-stock item, accept all transactions as valid sales (don't reject a completed customer sale after the fact), let the resulting stock go negative if oversold, and surface an alert to the Inventory Manager to reconcile/restock rather than trying to programmatically "undo" a sale.

**Q: If available stock cannot be verified while offline, will the system still allow the sale?**
A: Yes — allow the sale to proceed offline even though live stock can't be verified. Blocking sales at the register because of a connectivity issue is worse for the business than an occasional oversell that gets flagged and reconciled afterward.

**Q: If an offline POS transaction fails to sync, will there be an automatic retry, or will manual resolution be required?**
A: Automatic retry with exponential backoff as the first line of defense; escalate to a manual-resolution queue only after repeated automatic failures — surfaced to an admin with the full transaction payload so nothing is silently lost.

**Q: Which exact barcode scanner, receipt printer, and cash drawer hardware/models need to be supported?**
A: Standardize on protocol, not brand — **HID (keyboard-wedge) for scanners** and **ESC/POS for printers/drawers**, the two de facto international standards, so the platform isn't locked to specific vendors. Certify against these internationally-available reference models per category:

- **Barcode scanners (USB HID)**: Honeywell Voyager 1250g/1200g; Zebra (Symbol) DS2208/LI4278; Datalogic QuickScan QD2100; Newland HR32/NLS-HR3280; NCR RealPOS 7876. HID mode requires no driver/SDK — the scanner types into whatever input is focused.
- **Receipt printers (ESC/POS, 80mm/58mm thermal)**: Epson TM-T88VII/TM-T20III (reference implementation, widest support); Star Micronics TSP143III/TSP650II; Bixolon SRP-350III; Citizen CT-S310II; Rongta RP80/RP58 (budget tier).
- **Cash drawers (RJ11/RJ12, triggered via the printer's kick port)**: APG Vasario series; Star Micronics CD3; Posiflex CR-4000; MMF POS Val-u Line; generic RJ11 405/406-compatible drawers. The drawer is not a separate integration — it's wired into the printer and opened by sending the ESC/POS drawer-kick command over the same connection.

**Architecture implication**: browsers cannot access USB/serial hardware directly. Printers/drawers need a small local print bridge running on each POS terminal (a lightweight Node service using `node-thermal-printer`/`escpos`, or a tool like QZ Tray) that the web POS calls over a local endpoint. Scanners need no bridge since HID input requires nothing beyond a focused text field.

## POS Operations

**Q: Will POS register opening/closing and end-of-day cash reconciliation be required?**
A: Yes.

**Q: Will the POS support split payments?**
A: Yes.

**Q: Which POS operations should be supported: refund, partial refund, return, and exchange?**
A: Yes (all of the above).

**Q: Will manager approval/PIN be required for POS discounts, voids, and refunds?**
A: Yes.

## Invoicing

**Q: Should invoices support partial and multiple payments?**
A: Yes.

**Q: What should the final invoice status workflow be? For example: Draft → Sent → Partially Paid → Paid → Overdue → Cancelled/Void.**
A: That lifecycle is correct, with one addition: Overdue should be a computed flag/state based on due date rather than a manually set status, so it can apply on top of "Sent" or "Partially Paid" (e.g., "Partially Paid, Overdue") rather than being mutually exclusive with them.

**Q: What is the exact purpose/content of the Invoice QR Code — invoice verification, payment link, tax information, or something else?**
A: Default to a payment link — a QR that takes the customer straight to an online payment page for that invoice, since that's the highest-value use case (faster collections). If tenants operate in a jurisdiction with e-invoicing/tax QR mandates (e.g., ZATCA in Saudi Arabia, similar schemes elsewhere), the QR content needs to follow that jurisdiction's required tax-data format instead — worth confirming per target market before locking the format.

**Q: Should Recurring Invoices be automatically generated and sent, or should they be generated as drafts and sent only after approval?**
A: Generate as drafts first, with an option per tenant to switch a given recurring template to "auto-send" once trusted. Auto-generating and auto-sending everything by default risks sending incorrect invoices to customers with no human check.

**Q: When a Credit Note is issued, should it only adjust the invoice balance, or should it also be able to trigger a refund and inventory return?**
A: Both, driven by what the customer actually returned: a pure billing correction (e.g., pricing error, discount owed) only adjusts the invoice balance; a return tied to a physical product should also trigger the inventory return flow and, if the customer already paid, offer a refund rather than just a balance credit. Model as one Credit Note object with optional "linked return" and "linked refund" flags rather than three separate document types.

## Currency

**Q: Should each tenant have a single base currency, or is multi-currency support required at the transaction/invoice level?**
A: Single base currency per tenant for Phase 1, with the option to record individual transactions (invoices, POS sales) in a foreign currency converted to base at the transaction-date rate for accounting purposes. True multi-currency ledgers (holding balances in multiple currencies simultaneously) are better scoped for a later phase.

## Accounting Integration

**Q: From Phase 1, should POS, Invoice, and Inventory transactions create actual accounting journal entries, or should they only create integration events/store records for the Accounting module?**
A: In Phase 1, POS, Invoice, and Inventory transactions should create structured integration events/records — not full double-entry journal entries. Full automatic journal-entry generation (Chart of Accounts mapping, debit/credit lines, GL posting per §20 of the [Database Design](./database-design.md)) is deferred to a later phase, once the accounting rules for each transaction type are proven out. The integration event still needs to carry everything a journal entry would eventually need (amount, tax, reference type/id, transaction date, module) so the later automation can be built as a pure transform over existing events rather than a schema change.

---

## Open / Incomplete Items

All previously open items have been resolved. Add new entries here as future clarifications come up.

---

See also: [SRS](./SRS.md), [System Workflows](./system-workflows.md), [Database Design](./database-design.md).
