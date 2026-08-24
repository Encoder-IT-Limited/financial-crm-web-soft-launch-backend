import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword, hashToken } from "../auth.service";

describe("auth.service – pure helpers", () => {
  it("hashPassword returns a bcrypt hash", async () => {
    const hash = await hashPassword("test-password");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("hashToken returns a hex sha256", () => {
    const h = hashToken("some-token");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("hashToken is deterministic", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
});
