import { provisionTenant } from "../src/platform/tenants/tenant.service";
import { publicPrisma } from "../src/db/publicPrisma";
import { closeAllTenantClients } from "../src/db/tenantClientCache";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("--name");
  const subdomain = arg("--subdomain");
  const ownerName = arg("--owner-name") ?? "Owner";
  const ownerEmail = arg("--owner-email");
  const ownerPassword = arg("--owner-password");

  if (!name || !subdomain || !ownerEmail || !ownerPassword) {
    console.error(
      "Usage: tsx scripts/provisionTenant.ts --name <name> --subdomain <subdomain> --owner-email <email> --owner-password <password> [--owner-name <name>]",
    );
    process.exit(1);
  }

  const tenant = await provisionTenant({ name, subdomain, ownerName, ownerEmail, ownerPassword });
  console.log(`Provisioned tenant ${tenant.id} (${tenant.subdomain}) — status: ${tenant.status}`);
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
