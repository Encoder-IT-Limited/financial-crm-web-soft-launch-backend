import { describe, it, expect } from "vitest";
import { parseSubdomain } from "../../src/middlewares/subdomain";
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
