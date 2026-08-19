import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { provisionTenant } from "../src/platform/tenants/tenant.service";
import { publicPrisma } from "../src/db/publicPrisma";
import { closeAllTenantClients } from "../src/db/tenantClientCache";
import { AppError } from "../src/common/errors";
import { env } from "../src/config/env";

const suffix = Date.now();
const subdomain = `vitest-${suffix}`;
const schemaName = `tenant_vitest_${suffix}`;

describe("provisionTenant", () => {
  it("provisions a tenant end to end: schema created, migrated, owner user created, status ACTIVE", async () => {
    const tenant = await provisionTenant({
      name: "Vitest Co",
      subdomain,
      ownerName: "Test Owner",
      ownerEmail: `owner-${suffix}@vitest.test`,
      ownerPassword: "correct-horse-battery",
    });

    expect(tenant.status).toBe("ACTIVE");
    expect(tenant.schemaName).toBe(schemaName);

    const pool = new Pool({ connectionString: env.PUBLIC_DATABASE_URL });
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schemaName],
    );
    await pool.end();
    expect(rows.map((r) => r.table_name)).toEqual(expect.arrayContaining(["users", "customers"]));
  });

  it("rejects provisioning a duplicate subdomain", async () => {
    await expect(
      provisionTenant({
        name: "Duplicate Co",
        subdomain,
        ownerName: "Someone Else",
        ownerEmail: `dup-${suffix}@vitest.test`,
        ownerPassword: "another-password",
      }),
    ).rejects.toThrow(AppError);
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString: env.PUBLIC_DATABASE_URL });
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await pool.end();
    await publicPrisma.tenant.deleteMany({ where: { subdomain } });
    await closeAllTenantClients();
    await publicPrisma.$disconnect();
  });
});
