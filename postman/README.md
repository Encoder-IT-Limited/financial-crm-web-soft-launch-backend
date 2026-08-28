# Postman — Phase 1

Import every `*.postman_collection.json` file in this folder, then import `MRM-Local.postman_environment.json` and select **MRM Local**.

## Auth notes

- Tenant login must run against a tenant host. In local/dev the API also accepts `X-Tenant-Subdomain`. Tenant collections set that header automatically from `tenantSubdomain`.
- Super Admin login is the same `POST /auth/login` on the root host (no tenant header). Use **MRM – Super Admin → Platform Auth**.
- Bearer tokens skip CSRF. Cookie sessions need `GET /auth/csrf` then `X-CSRF-Token` matching the `csrf` cookie.

## Suggested order

1. Super Admin: Platform Login → Create Plan (saves `planId`) → Provision Tenant (saves `tenantId`)
2. Auth: Login as tenant owner (`john@acme.com` after signup, or the owner email from provision)
3. Customers → Inventory (create a second warehouse and paste its id into `warehouseId2`) → Procurement → Invoicing → POS
4. Users: Login as tenant owner → Invite user (non-prod response includes `acceptToken`) → Accept invite on `/auth/accept-invite`

Copy saved IDs into the **MRM Local** environment if you switch collections; collection test scripts only write collection variables.
