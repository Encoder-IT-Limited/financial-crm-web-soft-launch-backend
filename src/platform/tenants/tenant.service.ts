import { publicPrisma } from "../../db/publicPrisma";
import { getTenantPrismaClient, TENANT_SCHEMA_NAME_RE } from "../../db/tenantClientCache";
import { migrateTenantSchema } from "../../db/migrateTenantSchema";
import { hashPassword } from "../../modules/auth/auth.service";
import { AppError } from "../../common/errors";
import { logger } from "../../common/logger";

export interface ProvisionTenantInput {
  name: string;
  subdomain: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

function schemaNameFor(subdomain: string): string {
  return `tenant_${subdomain.replace(/-/g, "_")}`;
}

// Insert-as-PROVISIONING-first so a tenant row is never silently missing,
// then create the schema + replay migrations + create the Owner user, then
// flip to ACTIVE. On failure, flip to FAILED and leave the (possibly
// partial) schema in place — safer than a destructive rollback, and keeps
// provisioning idempotently retryable by schema name. See
// docs/system-workflows.md §2 and docs/database-design.md §1a.
export async function provisionTenant(input: ProvisionTenantInput) {
  const schemaName = schemaNameFor(input.subdomain);
  if (!TENANT_SCHEMA_NAME_RE.test(schemaName)) {
    throw new AppError(400, "INVALID_SUBDOMAIN", `Subdomain produces an invalid schema name: ${input.subdomain}`);
  }

  const existing = await publicPrisma.tenant.findFirst({
    where: { OR: [{ subdomain: input.subdomain }, { schemaName }] },
  });
  if (existing) {
    throw new AppError(409, "TENANT_ALREADY_EXISTS", `Subdomain "${input.subdomain}" is already taken`);
  }

  const tenant = await publicPrisma.tenant.create({
    data: {
      name: input.name,
      email: input.ownerEmail,
      subdomain: input.subdomain,
      schemaName,
      status: "PROVISIONING",
    },
  });

  try {
    await migrateTenantSchema(schemaName);

    const tenantPrisma = getTenantPrismaClient(schemaName);
    const passwordHash = await hashPassword(input.ownerPassword);
    await tenantPrisma.user.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName,
        email: input.ownerEmail,
        passwordHash,
        role: "OWNER",
      },
    });

    return publicPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  } catch (err) {
    logger.error({ err, tenantId: tenant.id, schemaName }, "Tenant provisioning failed");
    await publicPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "FAILED" } });
    throw err;
  }
}
