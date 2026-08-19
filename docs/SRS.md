# Software Requirements Specification (SRS)

## 1. Document Purpose

This SRS defines the functional and non-functional requirements for a multi-tenant business management platform containing:

- POS
- Invoicing
- Accounting
- Expenses
- Inventory
- Procurement
- HR & Payroll
- Calendar & Booking
- Banking
- User & Role Management
- AI Assistant
- Forms and Document Generation
- Social Media Integration
- Notifications
- Mobile Applications
- Subscription & Seat Management
- Reporting and Dashboard

The platform shall support multiple organizations/clients from a common SaaS infrastructure while keeping each organization's business data isolated.

## 2. System Objectives

The system shall:

- Centralize business operations into one platform.
- Support multiple companies/tenants.
- Provide Web, Android, and iOS applications.
- Support offline POS operation.
- Synchronize POS transactions when connectivity returns.
- Manage sales, purchasing, inventory, expenses, banking and accounting.
- Automate receipt processing using AI/OCR.
- Manage employees, attendance, leave and payroll.
- Manage appointments, resources and staff schedules.
- Generate Excel, Word and PDF documents.
- Provide email, SMS and push notifications.
- Integrate social media platforms.
- Provide role-based access control.
- Support subscription plans and additional seats.
- Provide centralized reporting and dashboards.

## 3. User Types

### Platform-Level Users
- Super Admin
- Platform Administrator
- Support/Admin Staff

### Tenant-Level Users
- Tenant Owner
- Tenant Admin
- Manager
- Accountant
- Sales Staff
- POS/Cashier
- Inventory Manager
- Procurement Officer
- HR Manager
- HR Staff
- Employee
- Approver
- Viewer

The system shall allow configurable roles and permissions rather than hard-coding only these roles (see [Requirements Q&A](./requirements-qa.md) — Phase 1 ships a fixed set of predefined roles).

## 4. Multi-Tenant Architecture

- Each business shall be represented as a tenant/company.
- A tenant may have: multiple branches, warehouses, users, employees, POS terminals, bank accounts, currencies (where applicable), tax configurations, and subscription seats.
- Tenant data must be logically isolated.
- Every business transaction shall contain a tenant/company reference.
- **Tenant resolution and isolation model**: each tenant is resolved via a dedicated subdomain (e.g. `acme.yourapp.com`) and is assigned its own PostgreSQL schema within a single shared database instance. See [Database Design §1a](./database-design.md#1a-multi-tenancy-strategy-decision) for the full architecture decision.

## 5. POS Module

### Functional Requirements

The POS shall support:

- Product search, barcode scanning/lookup
- Product variants, pricing, discounts, taxes
- Customer selection, walk-in customers
- Cash / card / bank / mobile payments, split payments
- Refunds, returns
- Sales receipts, invoice generation
- Cashier sessions, opening/closing cash, cash-drawer integration
- POS terminal management, branch-level POS, warehouse selection
- Inventory synchronization
- Offline operation

### Offline POS

- The POS application shall continue operating when internet connectivity is unavailable.
- Offline transactions shall be stored locally with: offline transaction ID, device ID, terminal ID, timestamp, local sequence number, transaction payload, synchronization status.
- When connectivity returns, transactions shall be synchronized with the server.
- The server shall prevent duplicate transaction creation using an idempotency key.

## 6. Invoicing Module

The system shall support:

- Customer invoices, recurring invoices, estimates/quotations, credit notes
- Invoice numbering, status, payment tracking, partial payments, outstanding balances, due dates
- Tax calculation, discounts
- Invoice PDF generation, email invoice, invoice history

Invoice statuses: Draft, Sent, Partially Paid, Paid, Overdue, Cancelled.

## 7. Expense Management

The expense module shall support:

- Manual expense entry, AI receipt scanning, OCR data extraction
- Vendor identification, expense categories, amount/tax extraction
- Receipt upload, attachments
- Approval workflow, expense status
- Employee expenses, vendor expenses, recurring expenses, expense reports

### AI Receipt Processing

The AI engine shall attempt to extract: vendor name, receipt date, invoice/receipt number, total amount, tax amount, currency, expense category, line items.

The extracted information shall be presented to the user for review. An expense may then enter an approval workflow before final posting.

## 8. Inventory Management

The inventory module shall support:

- Products, product categories, brands, units of measure, variants, barcodes
- Warehouses, warehouse locations, stock balances
- Batch tracking, serial numbers where required
- Stock receipts, issues, transfers, adjustments, reorder levels
- Purchase orders, goods receipts, stock valuation
- Inventory history, inventory reports

### Stock Movement Types

Purchase Receipt, Sales, Sales Return, Purchase Return, Warehouse Transfer, Stock Adjustment, Opening Stock, Damage, Expiry, Manual Issue.

Every stock movement shall create an auditable inventory transaction.

## 9. Procurement Module

The procurement module shall support: suppliers/vendors, purchase requisitions, purchase orders, PO approval, goods receipts, purchase invoices, purchase returns, supplier payments, supplier balances, purchase history.

Purchase workflow: Requisition → Approval → Purchase Order → Goods Receipt → Purchase Invoice → Payment.

## 10. Accounting Module

The accounting module shall provide unified accounting integration for: sales, purchases, expenses, inventory, payments, banking, POS transactions.

The system should use a double-entry accounting structure.

Core accounting entities: Chart of Accounts, Journal, Journal Entries, Accounts Receivable, Accounts Payable, General Ledger, Tax Accounts, Payment Accounts.

Automatic accounting entries should be generated from approved business transactions. **Phase 1 scope**: POS, Invoice, and Inventory transactions create structured integration events/records carrying everything a journal entry will eventually need (amount, tax, reference type/id, date, module); full automatic double-entry journal-entry generation (Chart of Accounts mapping, debit/credit lines, GL posting) is deferred to a later phase. See [Requirements Q&A](./requirements-qa.md#accounting-integration).

## 11. HR Management & Payroll

### Employee Management
Employee profiles, employee ID, department, designation, joining date, employment status, salary information, documents, emergency/contact information.

### Attendance
Check-in/out, working hours, late attendance, overtime, attendance correction, attendance reports.

### Leave
Leave types, policies, balances, requests, approval, history.

### Payroll
Salary structures (basic, allowances, deductions, overtime, bonuses, taxes), payroll processing, salary slips, payroll approval, payroll history.

## 12. Calendar & Booking

Staff schedules, client appointments, resource booking, calendar views (daily/weekly/monthly), appointment status, rescheduling, cancellation, notifications, conflict detection.

Booking states: Pending, Confirmed, Rescheduled, Completed, Cancelled, No Show.

## 13. Banking

Bank accounts, cash accounts, bank transactions, transfers, deposits, withdrawals, reconciliation, opening balances, cash flow, transaction categorization.

Bank reconciliation workflow: Bank Statement → Import/Entry → Match Transactions → Identify Unmatched Items → Reconcile → Close.

## 14. User Roles & Permissions

The system shall implement RBAC. Permissions shall be defined at module/action level, e.g.:

- POS.View, POS.CreateSale, POS.Refund
- Invoice.View, Invoice.Create, Invoice.Approve
- Expense.Create, Expense.Approve
- Inventory.View, Inventory.Adjust
- Payroll.Process
- Banking.Reconcile
- User.Manage

Also supports: role assignment, permission inheritance, branch-level restrictions, warehouse-level restrictions, approval permissions.

## 15. AI Assistant

The AI assistant shall provide usage-based features: OCR receipt reading, receipt data extraction, automatic expense creation, expense categorization, intelligent suggestions, data extraction, AI reporting, business summaries.

The AI assistant should not automatically finalize sensitive accounting transactions without configured authorization.

AI-generated records should have: AI processing status, confidence score, source document, extracted values, user verification status, approval status.

## 16. Forms & Document Generation

Export: Excel, Word, PDF, CSV. Import: Excel, CSV.

Documents may include: invoices, estimates, purchase orders, salary slips, expense reports, inventory reports, financial reports, employee reports. Templates should be configurable.

## 17. Social Media Integration

Supported platforms: Facebook, Instagram, LinkedIn, X/Twitter.

Features: connect social account, create/schedule/publish posts, campaign tracking, post history, publishing status, error logging.

Social credentials/tokens shall be encrypted.

## 18. Notification System

Channels: Email, SMS, Push Notification, In-app notification.

Events include: task reminders, approval requests/results, invoice/payment reminders, appointment reminders, payroll notifications, inventory/reorder alerts, subscription alerts.

The system should provide notification templates and user notification preferences.

## 19. Mobile Application

Flutter-based Android and iOS applications shall provide: login, dashboard, reports, inventory lookup, barcode scanning, AI receipt scanner, expense submission, approval status, push notifications, profile management.

Mobile authentication should use secure token-based authentication.

## 20. Subscription & Seat Management

Supports: subscription plans, monthly/yearly billing, base seat allocation, additional seats, subscription status, trial periods, upgrade/downgrade, renewal, cancellation, usage limits.

Seat calculation: `Available Seats = Base Plan Seats + Purchased Additional Seats`

The system shall prevent creation of users beyond the permitted seat count unless additional seats are purchased. (See [Requirements Q&A](./requirements-qa.md) for exactly which user types count toward seats.)

## 21. Reporting & Dashboard

Dashboard widgets may include: sales today/this month, expenses, net income, outstanding invoices, receivables, payables, inventory value, low-stock products, purchase value, payroll, cash balance, bank balance, upcoming appointments.

Reports shall support: date/branch/warehouse/employee/customer/supplier filters, export to Excel/PDF/CSV.

## 22. Security Requirements

HTTPS, password hashing, secure authentication, access/refresh tokens, role-based authorization, tenant isolation, audit logs, API rate limiting, input validation, file upload validation, encrypted sensitive credentials, session management, login activity tracking.

Sensitive operations should optionally require additional verification.

## 23. Audit Trail

The system shall record: user, tenant, action, module, entity, entity ID, old value, new value, IP address, device information, timestamp.

Audit logs shall be immutable to normal users.

## 24. Non-Functional Requirements

- **Performance**: Normal API operations should target ~1–3 second response time under normal load.
- **Availability**: Target high availability with monitoring and automated recovery.
- **Scalability**: Support multiple tenants, multiple branches, thousands of users, large transaction volumes, large inventory catalogs.
- **Reliability**: Transactions must be atomic where financial/inventory consistency is required.
- **Maintainability**: Backend should use modular services/modules with clear domain boundaries.
- **Backup**: Automated and periodically tested database backups.
- **Disaster Recovery**: Documented backup restoration and DR procedures.

## 25. Recommended Technology Architecture

- **Web**: React / Next.js, responsive UI, REST/GraphQL API
- **Mobile**: Flutter (Android, iOS)
- **Backend**: Express.js, REST API, background job processing
- **Database**: PostgreSQL (recommended)
- **Cache**: Redis
- **File Storage**: In project directory
- **Queue**: Redis Queue / RabbitMQ / equivalent
- **AI**: OCR + LLM-based extraction service
- **Notifications**: Email provider, SMS provider, Firebase Cloud Messaging
- **Infrastructure**: Docker, cloud load balancer, application servers, database server, object storage, monitoring/logging

## 26. Major Modules

Authentication, Tenant Management, Subscription Management, User & Role Management, Dashboard, POS, Customers, Invoicing, Expenses, Inventory, Procurement, Suppliers, Accounting, Banking, HR, Payroll, Calendar, Booking, Notifications, AI Assistant, Documents/Forms, Social Media, Reports, Audit Logs, Mobile Application.

---

See also: [System Workflows](./system-workflows.md), [Database Design](./database-design.md), [Requirements Q&A](./requirements-qa.md).
