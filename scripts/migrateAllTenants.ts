import { publicPrisma } from "../src/db/publicPrisma";
import { migrateTenantSchema } from "../src/db/migrateTenantSchema";
import { closeAllTenantClients } from "../src/db/tenantClientCache";

// Rolls out the current tenant migration history to every provisioned
// tenant. Fine for a handful of tenants (spawns the Prisma CLI once per
// tenant, serially); needs a concurrency-limited or raw-SQL runner once
// tenant count grows past the low hundreds. See docs/database-design.md §1a.
async function main() {
  const tenants = await publicPrisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
  });

  console.log(`Migrating ${tenants.length} tenant schema(s)...`);
  for (const tenant of tenants) {
    process.stdout.write(`  ${tenant.schemaName}... `);
    try {
      await migrateTenantSchema(tenant.schemaName);
      console.log("ok");
    } catch (err) {
      console.log("FAILED");
      console.error(err);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllTenantClients();
    await publicPrisma.$disconnect();
  });
