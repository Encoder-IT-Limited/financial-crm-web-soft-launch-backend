import { describe, it, expect } from "vitest";
import {
  hostHasTenantSubdomain,
  isPlatformUnscopedPath,
  parseSubdomain,
} from "../../src/middlewares/subdomain";
import { AppError } from "../../src/utils/errors";

describe("parseSubdomain", () => {
  it("returns null for a bare root-domain request", () => {
    expect(parseSubdomain("localhost", "localhost")).toBeNull();
  });

  it("extracts the subdomain from a tenant host", () => {
    expect(parseSubdomain("acme.localhost", "localhost")).toBe("acme");
  });

  it("extracts the subdomain from a production-style root domain", () => {
    expect(parseSubdomain("acme.yourapp.com", "yourapp.com")).toBe("acme");
  });

  it("rejects a host that isn't part of the root domain", () => {
    expect(() => parseSubdomain("evil.com", "yourapp.com")).toThrow(AppError);
  });

  it("rejects a subdomain with invalid characters", () => {
    expect(() => parseSubdomain("ac_me!.yourapp.com", "yourapp.com")).toThrow(AppError);
  });

  it("accepts hyphenated subdomains", () => {
    expect(parseSubdomain("acme-corp.yourapp.com", "yourapp.com")).toBe("acme-corp");
  });
});

describe("hostHasTenantSubdomain", () => {
  it("is false on the bare root domain", () => {
    expect(hostHasTenantSubdomain("localhost", "localhost")).toBe(false);
  });

  it("is true for a tenant subdomain host", () => {
    expect(hostHasTenantSubdomain("acme.localhost", "localhost")).toBe(true);
  });

  it("is false for IP hosts used in soft-launch", () => {
    expect(hostHasTenantSubdomain("127.0.0.1", "localhost")).toBe(false);
  });
});

describe("isPlatformUnscopedPath", () => {
  it("matches signup, invite, and tenant-provision routes", () => {
    expect(isPlatformUnscopedPath("/api/v1/auth/signup")).toBe(true);
    expect(isPlatformUnscopedPath("/api/v1/auth/invite")).toBe(true);
    expect(isPlatformUnscopedPath("/api/v1/auth/accept-invite")).toBe(true);
    expect(isPlatformUnscopedPath("/api/v1/platform/tenants")).toBe(true);
  });

  it("does not match tenant-scoped auth routes", () => {
    expect(isPlatformUnscopedPath("/api/v1/auth/login")).toBe(false);
    expect(isPlatformUnscopedPath("/api/v1/users")).toBe(false);
  });
});
