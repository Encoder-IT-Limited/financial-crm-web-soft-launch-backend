import { describe, it, expect } from "vitest";
import * as repo from "../auth.repository";

describe("auth.repository – exports", () => {
  it("exports expected functions", () => {
    expect(typeof repo.findUserByEmail).toBe("function");
    expect(typeof repo.findUserById).toBe("function");
    expect(typeof repo.touchLastLogin).toBe("function");
    expect(typeof repo.createRefreshToken).toBe("function");
    expect(typeof repo.findRefreshTokenByHash).toBe("function");
    expect(typeof repo.revokeRefreshToken).toBe("function");
  });
});
