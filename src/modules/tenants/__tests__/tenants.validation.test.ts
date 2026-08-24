import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/publicPrisma", () => ({
  publicPrisma: {},
}));

const { provisionTenantSchema, signupSchema } = await import("../tenants.validation");

describe("tenants.validation", () => {
  it("accepts a valid provision input", () => {
    const result = provisionTenantSchema.safeParse({
      name: "Acme",
      subdomain: "acme",
      ownerName: "John",
      ownerEmail: "john@acme.com",
      ownerPassword: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid subdomain", () => {
    const result = provisionTenantSchema.safeParse({
      name: "Acme",
      subdomain: "ACME!!",
      ownerName: "John",
      ownerEmail: "john@acme.com",
      ownerPassword: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid signup input", () => {
    const result = signupSchema.safeParse({
      planId: "550e8400-e29b-41d4-a716-446655440000",
      company: { name: "Test Co", country: "AE" },
      owner: { name: "Owner", email: "o@test.com", password: "12345678" },
    });
    expect(result.success).toBe(true);
  });
});
