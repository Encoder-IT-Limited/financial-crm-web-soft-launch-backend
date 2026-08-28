import { describe, it, expect } from "vitest";
import { occupiesSeat, usedSeats } from "../../../utils/seats";
import {
  getGrantsForRole,
  listRoleCatalog,
  INVITABLE_ROLES,
  slugifyRoleKey,
  uniqueRoleKey,
  sanitizePermissions,
} from "../../../utils/permissions";
import { permissionAllowed } from "../../../utils/permissionCheck";
import { assertRoleDelete, assertRolePatch } from "../roles.service";
import { AppError } from "../../../utils/errors";

describe("seats", () => {
  it("occupies a seat while ACTIVE or INVITED, not DISABLED", () => {
    expect(occupiesSeat("ACTIVE")).toBe(true);
    expect(occupiesSeat("INVITED")).toBe(true);
    expect(occupiesSeat("DISABLED")).toBe(false);
  });

  it("counts invited staff and ignores roles that do not occupy seats", () => {
    expect(
      usedSeats([
        { status: "ACTIVE", countsTowardSeats: true },
        { status: "INVITED", countsTowardSeats: true },
        { status: "ACTIVE", countsTowardSeats: false },
        { status: "DISABLED", countsTowardSeats: true },
      ]),
    ).toBe(2);
  });

  it("honors countsTowardSeats on a custom role", () => {
    expect(usedSeats([{ status: "ACTIVE", countsTowardSeats: true }])).toBe(1);
    expect(usedSeats([{ status: "ACTIVE", countsTowardSeats: false }])).toBe(0);
  });
});

describe("permission catalog", () => {
  it("grants user.manage to OWNER and ADMIN via *", () => {
    expect(permissionAllowed(getGrantsForRole("OWNER"), "user.manage")).toBe(true);
    expect(permissionAllowed(getGrantsForRole("ADMIN"), "user.manage")).toBe(true);
  });

  it("denies user.manage to cashier, accountant, and viewer", () => {
    expect(permissionAllowed(getGrantsForRole("SALES_CASHIER"), "user.manage")).toBe(false);
    expect(permissionAllowed(getGrantsForRole("ACCOUNTANT"), "user.manage")).toBe(false);
    expect(permissionAllowed(getGrantsForRole("VIEWER"), "user.manage")).toBe(false);
  });

  it("does not allow inviting OWNER", () => {
    expect(INVITABLE_ROLES).not.toContain("OWNER");
    expect(listRoleCatalog().find((r) => r.key === "OWNER")?.invitable).toBe(false);
  });

  it("marks VIEWER as not counting toward seats in the catalog", () => {
    expect(listRoleCatalog().find((r) => r.key === "VIEWER")?.countsTowardSeats).toBe(false);
  });

  it("matches stored permission arrays including wildcards", () => {
    expect(permissionAllowed(["pos.view"], "pos.view")).toBe(true);
    expect(permissionAllowed(["pos.view"], "pos.manage")).toBe(false);
    expect(permissionAllowed(["pos.*"], "pos.manage")).toBe(true);
    expect(permissionAllowed(["*.view"], "inventory.view")).toBe(true);
    expect(permissionAllowed(["*"], "user.manage")).toBe(true);
  });
});

describe("role keys", () => {
  it("slugifies a display name", () => {
    expect(slugifyRoleKey("POS Clerk")).toBe("pos_clerk");
    expect(slugifyRoleKey("  Sales Lead!! ")).toBe("sales_lead");
  });

  it("does not mint the reserved OWNER key", () => {
    expect(slugifyRoleKey("Owner")).toBe("owner_custom");
    expect(slugifyRoleKey("OWNER")).toBe("owner_custom");
    expect(uniqueRoleKey("Owner", [])).not.toBe("OWNER");
  });

  it("disambiguates colliding keys", () => {
    expect(uniqueRoleKey("POS Clerk", ["pos_clerk"])).toBe("pos_clerk_2");
    expect(uniqueRoleKey("POS Clerk", ["pos_clerk", "pos_clerk_2"])).toBe("pos_clerk_3");
  });

  it("drops unknown permission keys", () => {
    expect(sanitizePermissions(["pos.view", "not.a.perm", "inventory.*"])).toEqual(["pos.view", "inventory.*"]);
  });
});

describe("OWNER lock", () => {
  it("rejects permission changes on OWNER", () => {
    expect(() => assertRolePatch({ key: "OWNER" }, { permissions: ["pos.view"] })).toThrow(AppError);
    try {
      assertRolePatch({ key: "OWNER" }, { permissions: ["pos.view"] });
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("OWNER_LOCKED");
    }
  });

  it("allows permission edits on other system roles", () => {
    expect(() => assertRolePatch({ key: "MANAGER" }, { permissions: ["inventory.view"] })).not.toThrow();
  });

  it("cannot delete system roles or roles with users", () => {
    try {
      assertRoleDelete({ key: "OWNER", isSystem: true }, 0);
    } catch (err) {
      expect((err as AppError).code).toBe("SYSTEM_ROLE");
    }
    try {
      assertRoleDelete({ key: "pos_clerk", isSystem: false }, 2);
    } catch (err) {
      expect((err as AppError).code).toBe("ROLE_IN_USE");
    }
    expect(() => assertRoleDelete({ key: "pos_clerk", isSystem: false }, 0)).not.toThrow();
  });
});
