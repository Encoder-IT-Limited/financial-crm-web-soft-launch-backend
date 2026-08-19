import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/spike-client/client";

const BASE_URL = process.env.DATABASE_URL!;
const SCHEMA_A = "tenant_a";
const SCHEMA_B = "tenant_b";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function tenantClient(schemaName: string) {
  const pool = new Pool({
    connectionString: BASE_URL,
    options: `-c search_path="${schemaName}"`,
    max: 3,
  });
  const adapter = new PrismaPg(pool, { schema: schemaName });
  const client = new PrismaClient({ adapter });
  return { client, pool };
}

async function main() {
  const setupPool = new Pool({ connectionString: BASE_URL });

  console.log("--- Setting up two isolated schemas with an identical table ---");
  await setupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA_A} CASCADE`);
  await setupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA_B} CASCADE`);
  await setupPool.query(`CREATE SCHEMA ${SCHEMA_A}`);
  await setupPool.query(`CREATE SCHEMA ${SCHEMA_B}`);
  await setupPool.query(`CREATE TABLE ${SCHEMA_A}."Widget" (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`);
  await setupPool.query(`CREATE TABLE ${SCHEMA_B}."Widget" (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`);
  await setupPool.end();

  const a = tenantClient(SCHEMA_A);
  const b = tenantClient(SCHEMA_B);

  console.log("--- Writing tenant-specific rows via two separate PrismaClient instances ---");
  await a.client.widget.create({ data: { name: "from-tenant-a" } });
  await b.client.widget.create({ data: { name: "from-tenant-b" } });
  await b.client.widget.create({ data: { name: "from-tenant-b-2" } });

  const aRows = await a.client.widget.findMany();
  const bRows = await b.client.widget.findMany();

  console.log("tenant_a sees:", aRows);
  console.log("tenant_b sees:", bRows);

  assert(aRows.length === 1, `tenant_a should see exactly 1 row, saw ${aRows.length}`);
  assert(aRows[0].name === "from-tenant-a", "tenant_a row has wrong content");
  assert(bRows.length === 2, `tenant_b should see exactly 2 rows, saw ${bRows.length}`);
  assert(
    bRows.every((r) => r.name.startsWith("from-tenant-b")),
    "tenant_b sees data that doesn't belong to it — CROSS-TENANT LEAK",
  );
  assert(
    !bRows.some((r) => r.name === "from-tenant-a"),
    "tenant_b can see tenant_a's row — CROSS-TENANT LEAK",
  );

  console.log("--- PASS: cross-schema isolation confirmed under Prisma 7 + @prisma/adapter-pg ---");

  await a.client.$disconnect();
  await b.client.$disconnect();
  await a.pool.end();
  await b.pool.end();

  const cleanupPool = new Pool({ connectionString: BASE_URL });
  await cleanupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA_A} CASCADE`);
  await cleanupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA_B} CASCADE`);
  await cleanupPool.end();
}

main().catch((err) => {
  console.error("--- SPIKE FAILED ---");
  console.error(err);
  process.exit(1);
});
