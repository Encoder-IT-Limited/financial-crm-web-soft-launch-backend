# Database Design

## 1. Database Recommendation

PostgreSQL is recommended because the system contains: financial transactions, inventory transactions, relational business data, multi-tenant requirements, complex reporting, approval workflows, audit requirements, and requires strong transaction consistency.

The database should use UUID primary keys for major entities.

## 1a. Multi-Tenancy Strategy (Decision)

**Model: schema-per-tenant, subdomain-based tenant resolution, single Postgres instance/database.**

- One shared `public` schema holds platform-level tables: `tenants` (`id`, `subdomain`, `schema_name`, `status`, ...), `subscription_plans`, `subscriptions`, and anything Super Admin needs visibility into across all tenants.
- Each tenant gets its own Postgres schema (e.g. `tenant_acme`) containing a full copy of every tenant-owned table from this document (`customers`, `products`, `sales`, `invoices`, etc.).
- **Tenant resolution**: incoming request host (`acme.yourapp.com`) → middleware extracts the subdomain → looks up `public.tenants` by `subdomain` → resolves `schema_name` → attaches to `req.tenant`.
- **Query scoping**: the resolved schema is applied per-request via `SET search_path TO tenant_acme, public` on the connection before any tenant queries run.
- **Implication for `tenant_id` columns**: since the schema itself is the isolation boundary, `tenant_id` is no longer required on every tenant-owned table purely for isolation (see §3 "Common Columns" below — treat `tenant_id` there as optional defense-in-depth for tenant schemas, not mandatory). It remains mandatory on any table that lives in the shared `public` schema.
- **Migrations**: written once, applied in a loop across every schema listed in `public.tenants` at deploy time. Provisioning a new tenant = `CREATE SCHEMA tenant_xxx` + replay full migration history against it + insert the `public.tenants` registry row.
- **Connection pooling caution**: session-level `SET search_path` does not reliably survive pgbouncer transaction-mode pooling. Use session-mode pooling, or manage pooling directly via node-postgres (acquire → `SET search_path` → query → release) rather than relying on transaction-mode pgbouncer.
- **Scale ceiling**: this model is comfortable up to roughly 1,000–2,000 tenant schemas. Beyond that, catalog bloat, slower `autovacuum`, and slower `pg_dump`/migration loops become real operational costs — reassess (e.g. shard across multiple Postgres instances, or move large tenants to pooled+RLS) if tenant count trends toward five figures.

## 2. Core Entity Relationship

```
TENANT
  ├── Branch
  │     ├── Users
  │     ├── POS Terminals
  │     └── Employees
  ├── Warehouses
  │     └── Stock
  ├── Customers
  ├── Suppliers
  ├── Products
  ├── Invoices
  ├── Expenses
  ├── Purchases
  ├── Bank Accounts
  ├── Employees
  ├── Appointments
  ├── Accounting
  └── Reports
```

## 3. Common Columns

Most tenant-owned tables should contain:

```
id UUID PK
tenant_id UUID FK
created_at TIMESTAMP
updated_at TIMESTAMP
created_by UUID
updated_by UUID
deleted_at TIMESTAMP NULL
```

Soft deletion should be used where historical/audit preservation is required.

## 4. Tenant & Organization Tables

### tenants
```
id UUID PK
name VARCHAR
legal_name VARCHAR
email VARCHAR
phone VARCHAR
address TEXT
country VARCHAR
currency VARCHAR
timezone VARCHAR
tax_number VARCHAR
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### branches
```
id UUID PK
tenant_id UUID FK
name VARCHAR
code VARCHAR
address TEXT
phone VARCHAR
email VARCHAR
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

Relationship: Tenant 1 ─── N Branches

## 5. Users & Roles

### users
```
id UUID PK
tenant_id UUID FK
name VARCHAR
email VARCHAR
phone VARCHAR
password_hash VARCHAR
status VARCHAR
last_login_at TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

### roles
```
id UUID PK
tenant_id UUID FK NULL
name VARCHAR
description TEXT
is_system_role BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

### permissions
```
id UUID PK
module VARCHAR
action VARCHAR
description TEXT
```

### user_roles
```
user_id UUID FK
role_id UUID FK
PRIMARY KEY(user_id, role_id)
```

### role_permissions
```
role_id UUID FK
permission_id UUID FK
PRIMARY KEY(role_id, permission_id)
```

## 6. Subscription Tables

### subscription_plans
```
id UUID PK
name VARCHAR
price DECIMAL
billing_cycle VARCHAR
base_seats INT
status VARCHAR
created_at TIMESTAMP
```

### subscriptions
```
id UUID PK
tenant_id UUID FK
plan_id UUID FK
start_date DATE
end_date DATE
status VARCHAR
auto_renew BOOLEAN
```

### subscription_seats
```
id UUID PK
subscription_id UUID FK
included_seats INT
additional_seats INT
used_seats INT
```

## 7. Customer Tables

### customers
```
id UUID PK
tenant_id UUID FK
customer_code VARCHAR
name VARCHAR
email VARCHAR
phone VARCHAR
address TEXT
tax_number VARCHAR
credit_limit DECIMAL
opening_balance DECIMAL
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

## 8. Supplier Tables

### suppliers
```
id UUID PK
tenant_id UUID FK
supplier_code VARCHAR
name VARCHAR
email VARCHAR
phone VARCHAR
address TEXT
tax_number VARCHAR
opening_balance DECIMAL
status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

## 9. Product & Inventory Tables

### product_categories
```
id UUID PK
tenant_id UUID FK
name VARCHAR
parent_id UUID FK NULL
```

### products
```
id UUID PK
tenant_id UUID FK
category_id UUID FK
sku VARCHAR
barcode VARCHAR
name VARCHAR
description TEXT
unit_id UUID FK
cost_price DECIMAL
selling_price DECIMAL
tax_rate DECIMAL
reorder_level DECIMAL
track_batch BOOLEAN
track_serial BOOLEAN
status VARCHAR
```

### product_variants
```
id UUID PK
product_id UUID FK
sku VARCHAR
barcode VARCHAR
attributes JSONB
cost_price DECIMAL
selling_price DECIMAL
```

### units
```
id UUID PK
tenant_id UUID FK
name VARCHAR
symbol VARCHAR
```

## 10. Warehouse Tables

### warehouses
```
id UUID PK
tenant_id UUID FK
branch_id UUID FK
name VARCHAR
code VARCHAR
address TEXT
status VARCHAR
```

### warehouse_locations
```
id UUID PK
warehouse_id UUID FK
name VARCHAR
code VARCHAR
```

### stock_balances
```
id UUID PK
tenant_id UUID FK
warehouse_id UUID FK
product_id UUID FK
variant_id UUID FK NULL
quantity DECIMAL
reserved_quantity DECIMAL
average_cost DECIMAL
```

## 11. Inventory Transaction Tables

### stock_movements
```
id UUID PK
tenant_id UUID FK
warehouse_id UUID FK
product_id UUID FK
variant_id UUID FK NULL
batch_id UUID FK NULL
movement_type VARCHAR
quantity DECIMAL
unit_cost DECIMAL
reference_type VARCHAR
reference_id UUID
movement_date TIMESTAMP
created_by UUID
```

Examples of `movement_type`: PURCHASE_RECEIPT, SALE, SALES_RETURN, PURCHASE_RETURN, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, OPENING, DAMAGE, EXPIRY.

### batches
```
id UUID PK
product_id UUID FK
warehouse_id UUID FK
batch_number VARCHAR
manufacture_date DATE
expiry_date DATE
quantity DECIMAL
```

## 12. POS Tables

### pos_terminals
```
id UUID PK
tenant_id UUID FK
branch_id UUID FK
name VARCHAR
code VARCHAR
device_identifier VARCHAR
status VARCHAR
```

### pos_sessions
```
id UUID PK
terminal_id UUID FK
cashier_id UUID FK
opening_cash DECIMAL
closing_cash DECIMAL
opened_at TIMESTAMP
closed_at TIMESTAMP
status VARCHAR
```

### sales
```
id UUID PK
tenant_id UUID FK
branch_id UUID FK
customer_id UUID FK NULL
pos_session_id UUID FK NULL
invoice_id UUID FK NULL
transaction_number VARCHAR
transaction_date TIMESTAMP
subtotal DECIMAL
discount DECIMAL
tax DECIMAL
total DECIMAL
status VARCHAR
offline_transaction_key VARCHAR UNIQUE
```

### sale_items
```
id UUID PK
sale_id UUID FK
product_id UUID FK
variant_id UUID FK NULL
quantity DECIMAL
unit_price DECIMAL
discount DECIMAL
tax DECIMAL
total DECIMAL
```

## 13. Payment Tables

### payments
```
id UUID PK
tenant_id UUID FK
reference_type VARCHAR
reference_id UUID
payment_method VARCHAR
amount DECIMAL
currency VARCHAR
transaction_reference VARCHAR
payment_date TIMESTAMP
status VARCHAR
```

Payment methods: CASH, CARD, BANK, MOBILE_PAYMENT, CHEQUE, OTHER.

## 14. Invoice Tables

### invoices
```
id UUID PK
tenant_id UUID FK
customer_id UUID FK
invoice_number VARCHAR
invoice_date DATE
due_date DATE
subtotal DECIMAL
discount DECIMAL
tax DECIMAL
total DECIMAL
paid_amount DECIMAL
balance_due DECIMAL
status VARCHAR
```

### invoice_items
```
id UUID PK
invoice_id UUID FK
product_id UUID FK NULL
description TEXT
quantity DECIMAL
unit_price DECIMAL
discount DECIMAL
tax DECIMAL
total DECIMAL
```

## 15. Recurring Invoice Tables

### recurring_invoices
```
id UUID PK
tenant_id UUID FK
customer_id UUID FK
frequency VARCHAR
start_date DATE
next_invoice_date DATE
end_date DATE NULL
amount DECIMAL
status VARCHAR
```

## 16. Credit Note Tables

### credit_notes
```
id UUID PK
tenant_id UUID FK
customer_id UUID FK
invoice_id UUID FK NULL
credit_note_number VARCHAR
amount DECIMAL
reason TEXT
status VARCHAR
created_at TIMESTAMP
```

## 17. Expense Tables

### expense_categories
```
id UUID PK
tenant_id UUID FK
name VARCHAR
parent_id UUID FK NULL
```

### expenses
```
id UUID PK
tenant_id UUID FK
employee_id UUID FK NULL
vendor_id UUID FK NULL
category_id UUID FK
expense_date DATE
description TEXT
amount DECIMAL
tax_amount DECIMAL
currency VARCHAR
status VARCHAR
source VARCHAR
ai_processed BOOLEAN
ai_confidence DECIMAL
approval_status VARCHAR
```

### expense_attachments
```
id UUID PK
expense_id UUID FK
file_name VARCHAR
file_url TEXT
mime_type VARCHAR
file_size BIGINT
```

## 18. AI/OCR Tables

### ai_processing_jobs
```
id UUID PK
tenant_id UUID FK
entity_type VARCHAR
entity_id UUID
job_type VARCHAR
status VARCHAR
confidence DECIMAL
raw_response JSONB
processed_at TIMESTAMP
```

### ai_extracted_fields
```
id UUID PK
job_id UUID FK
field_name VARCHAR
field_value TEXT
confidence DECIMAL
verified BOOLEAN
verified_by UUID FK NULL
```

This design allows the AI system to evolve without adding a new database column for every extracted field.

## 19. Procurement Tables

### purchase_orders
```
id UUID PK
tenant_id UUID FK
supplier_id UUID FK
warehouse_id UUID FK
po_number VARCHAR
order_date DATE
expected_date DATE
subtotal DECIMAL
tax DECIMAL
discount DECIMAL
total DECIMAL
status VARCHAR
approval_status VARCHAR
```

### purchase_order_items
```
id UUID PK
purchase_order_id UUID FK
product_id UUID FK
quantity DECIMAL
unit_cost DECIMAL
tax DECIMAL
discount DECIMAL
total DECIMAL
```

### goods_receipts
```
id UUID PK
tenant_id UUID FK
purchase_order_id UUID FK
warehouse_id UUID FK
receipt_number VARCHAR
receipt_date DATE
status VARCHAR
```

### goods_receipt_items
```
id UUID PK
goods_receipt_id UUID FK
product_id UUID FK
quantity DECIMAL
batch_id UUID FK NULL
unit_cost DECIMAL
```

## 20. Accounting Tables

### chart_of_accounts
```
id UUID PK
tenant_id UUID FK
account_code VARCHAR
account_name VARCHAR
account_type VARCHAR
parent_id UUID FK NULL
is_system_account BOOLEAN
status VARCHAR
```

Account types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE.

### journals
```
id UUID PK
tenant_id UUID FK
journal_number VARCHAR
journal_date DATE
reference_type VARCHAR
reference_id UUID
description TEXT
status VARCHAR
```

### journal_entries
```
id UUID PK
journal_id UUID FK
account_id UUID FK
debit DECIMAL
credit DECIMAL
description TEXT
```

Accounting rule: `SUM(debit) = SUM(credit)` for every posted journal.

## 21. Banking Tables

### bank_accounts
```
id UUID PK
tenant_id UUID FK
bank_name VARCHAR
account_name VARCHAR
account_number VARCHAR
currency VARCHAR
opening_balance DECIMAL
current_balance DECIMAL
status VARCHAR
```

### bank_transactions
```
id UUID PK
bank_account_id UUID FK
transaction_date DATE
reference VARCHAR
description TEXT
debit DECIMAL
credit DECIMAL
balance DECIMAL
reconciliation_status VARCHAR
```

### bank_reconciliations
```
id UUID PK
bank_account_id UUID FK
statement_date DATE
statement_balance DECIMAL
book_balance DECIMAL
difference DECIMAL
status VARCHAR
reconciled_by UUID FK
reconciled_at TIMESTAMP
```

## 22. HR Tables

### employees
```
id UUID PK
tenant_id UUID FK
user_id UUID FK NULL
employee_code VARCHAR
first_name VARCHAR
last_name VARCHAR
department_id UUID FK
designation_id UUID FK
joining_date DATE
employment_status VARCHAR
salary DECIMAL
phone VARCHAR
email VARCHAR
```

### departments
```
id UUID PK
tenant_id UUID FK
name VARCHAR
```

### designations
```
id UUID PK
tenant_id UUID FK
name VARCHAR
```

## 23. Attendance Tables

### attendance
```
id UUID PK
tenant_id UUID FK
employee_id UUID FK
attendance_date DATE
check_in TIMESTAMP
check_out TIMESTAMP
working_hours DECIMAL
overtime_hours DECIMAL
status VARCHAR
```

## 24. Leave Tables

### leave_types
```
id UUID PK
tenant_id UUID FK
name VARCHAR
annual_days DECIMAL
```

### leave_requests
```
id UUID PK
tenant_id UUID FK
employee_id UUID FK
leave_type_id UUID FK
start_date DATE
end_date DATE
days DECIMAL
reason TEXT
status VARCHAR
approved_by UUID FK NULL
```

## 25. Payroll Tables

### salary_structures
```
id UUID PK
tenant_id UUID FK
employee_id UUID FK
basic_salary DECIMAL
allowances JSONB
deductions JSONB
effective_from DATE
```

### payroll_runs
```
id UUID PK
tenant_id UUID FK
period_start DATE
period_end DATE
total_gross DECIMAL
total_deductions DECIMAL
total_net DECIMAL
status VARCHAR
```

### payroll_items
```
id UUID PK
payroll_run_id UUID FK
employee_id UUID FK
basic_salary DECIMAL
allowances DECIMAL
deductions DECIMAL
overtime DECIMAL
net_salary DECIMAL
```

### salary_slips
```
id UUID PK
payroll_item_id UUID FK
slip_number VARCHAR
file_url TEXT
generated_at TIMESTAMP
```

## 26. Calendar & Booking Tables

### resources
```
id UUID PK
tenant_id UUID FK
name VARCHAR
resource_type VARCHAR
status VARCHAR
```

### appointments
```
id UUID PK
tenant_id UUID FK
customer_id UUID FK
employee_id UUID FK NULL
resource_id UUID FK NULL
start_time TIMESTAMP
end_time TIMESTAMP
status VARCHAR
notes TEXT
```

## 27. Notification Tables

### notification_templates
```
id UUID PK
tenant_id UUID FK NULL
event_type VARCHAR
channel VARCHAR
subject TEXT
body TEXT
```

### notifications
```
id UUID PK
tenant_id UUID FK
user_id UUID FK
event_type VARCHAR
channel VARCHAR
title VARCHAR
message TEXT
status VARCHAR
sent_at TIMESTAMP NULL
read_at TIMESTAMP NULL
```

## 28. Social Media Tables

### social_accounts
```
id UUID PK
tenant_id UUID FK
platform VARCHAR
account_name VARCHAR
access_token_encrypted TEXT
refresh_token_encrypted TEXT
token_expiry TIMESTAMP
status VARCHAR
```

### social_posts
```
id UUID PK
tenant_id UUID FK
created_by UUID FK
content TEXT
media JSONB
scheduled_at TIMESTAMP NULL
status VARCHAR
```

### social_post_platforms
```
id UUID PK
social_post_id UUID FK
social_account_id UUID FK
external_post_id VARCHAR NULL
status VARCHAR
published_at TIMESTAMP NULL
error_message TEXT NULL
```

## 29. Approval Workflow Tables

### approval_workflows
```
id UUID PK
tenant_id UUID FK
module VARCHAR
name VARCHAR
status VARCHAR
```

### approval_steps
```
id UUID PK
workflow_id UUID FK
step_order INT
approver_role_id UUID FK NULL
approver_user_id UUID FK NULL
```

### approval_requests
```
id UUID PK
tenant_id UUID FK
workflow_id UUID FK
entity_type VARCHAR
entity_id UUID
current_step INT
status VARCHAR
requested_by UUID FK
```

### approval_actions
```
id UUID PK
approval_request_id UUID FK
step_id UUID FK
action VARCHAR
comment TEXT
acted_by UUID FK
acted_at TIMESTAMP
```

## 30. Audit Log

### audit_logs
```
id UUID PK
tenant_id UUID FK
user_id UUID FK
module VARCHAR
entity_type VARCHAR
entity_id UUID
action VARCHAR
old_values JSONB
new_values JSONB
ip_address VARCHAR
user_agent TEXT
created_at TIMESTAMP
```

## 31. Document/File Management

### files
```
id UUID PK
tenant_id UUID FK
entity_type VARCHAR
entity_id UUID
file_name VARCHAR
storage_path TEXT
mime_type VARCHAR
file_size BIGINT
uploaded_by UUID FK
created_at TIMESTAMP
```

Files should be stored in object storage rather than directly inside PostgreSQL.

## 32. Important Relationships

```
Tenant
 ├── Users
 │    └── Roles
 │         └── Permissions
 ├── Branches
 │    └── POS Terminals
 │         └── POS Sessions
 │              └── Sales
 ├── Products
 │    ├── Variants
 │    └── Stock Movements
 ├── Warehouses
 │    └── Stock Balances
 ├── Customers
 │    └── Invoices
 │         └── Invoice Items
 ├── Suppliers
 │    └── Purchase Orders
 │         └── Goods Receipts
 ├── Expenses
 │    └── AI Processing
 ├── Employees
 │    ├── Attendance
 │    ├── Leave
 │    └── Payroll
 ├── Bank Accounts
 │    └── Bank Transactions
 └── Accounting
      ├── Chart of Accounts
      ├── Journals
      └── Journal Entries
```

## 33. Critical Database Rules

1. **Tenant Isolation** — Primary isolation is the tenant's Postgres schema (see §1a). `tenant_id` is still carried on every tenant-owned record as a defense-in-depth check and to simplify cross-tenant admin/reporting tooling — but a query never relies on `tenant_id` alone to keep tenants apart.
2. **Financial Integrity** — Posted financial transactions should not be physically deleted. Use reversal/correction transactions instead.
3. **Inventory Integrity** — Stock should be derived from controlled stock movements and/or maintained through transactional stock balance updates.
4. **Accounting Integrity** — Every posted journal must satisfy `Total Debit = Total Credit`.
5. **Offline POS Integrity** — Every offline transaction must have a globally unique idempotency key: `tenant_id + device_id + offline_transaction_key`.
6. **Auditability** — Changes to important business records should generate audit records.
7. **Approval Integrity** — An approved record should not be silently modified. Significant changes should either restart approval or create a new revision.

## 34. Recommended Database Indexes

- `users(tenant_id, email)`
- `customers(tenant_id, customer_code)`
- `products(tenant_id, sku)`
- `products(tenant_id, barcode)`
- `stock_balances(tenant_id, warehouse_id, product_id)`
- `stock_movements(tenant_id, product_id, movement_date)`
- `invoices(tenant_id, invoice_number)`
- `invoices(tenant_id, customer_id, status)`
- `sales(tenant_id, transaction_number)`
- `sales(tenant_id, transaction_date)`
- `expenses(tenant_id, expense_date)`
- `employees(tenant_id, employee_code)`
- `bank_transactions(bank_account_id, transaction_date)`
- `audit_logs(tenant_id, created_at)`

Unique constraints should be tenant-aware where business identifiers are not globally unique, e.g.:

```
UNIQUE(tenant_id, invoice_number)
UNIQUE(tenant_id, sku)
UNIQUE(tenant_id, customer_code)
UNIQUE(tenant_id, supplier_code)
```

## 35. Recommended Transaction Boundaries

A POS sale should execute as one database transaction:

```
BEGIN

Create Sale
Create Sale Items
Create Payment
Create Stock Movements
Update Stock Balance
Create Invoice
Create Accounting Journal
Create Journal Entries
Create Audit Log

COMMIT
```

If any critical operation fails: `ROLLBACK`.

This prevents situations such as: payment recorded but inventory not reduced; inventory reduced but sale not created; sale created but accounting missing.

## 36. Database Architecture Summary

The database should be organized into these logical domains:

1. Identity & Tenant
2. Subscription
3. User & RBAC
4. Customer
5. Supplier
6. Product
7. Inventory
8. POS
9. Sales
10. Invoicing
11. Procurement
12. Expenses
13. Accounting
14. Banking
15. HR
16. Attendance
17. Leave
18. Payroll
19. Calendar
20. Booking
21. Notifications
22. AI/OCR
23. Documents
24. Social Media
25. Approval Workflow
26. Audit

This structure provides a scalable foundation for the complete ERP/POS platform while keeping POS, accounting, inventory, procurement, HR, payroll, banking, AI and mobile functionality connected through a common tenant-aware architecture.

---

See also: [SRS](./SRS.md), [System Workflows](./system-workflows.md), [Requirements Q&A](./requirements-qa.md).
