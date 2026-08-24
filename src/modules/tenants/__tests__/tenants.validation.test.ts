import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/publicPrisma", () => ({
  publicPrisma: {},
}));

const { provisionTenantSchema, signupSchema, updateOwnTenantProfileSchema } = await import("../tenants.validation");

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

  it("accepts a tenant org-profile patch and blanks optional text", () => {
    const result = updateOwnTenantProfileSchema.safeParse({
      name: " Demo Co ",
      legalName: "  ",
      email: "ops@demo.local",
      phone: null,
      taxNumber: "TRN-1",
      currency: "AED",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Demo Co");
      expect(result.data.legalName).toBeNull();
      expect(result.data.phone).toBeNull();
      expect(result.data.taxNumber).toBe("TRN-1");
      expect(result.data.address).toBeUndefined();
    }
  });

  it("rejects an invalid tenant profile email", () => {
    const result = updateOwnTenantProfileSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});
