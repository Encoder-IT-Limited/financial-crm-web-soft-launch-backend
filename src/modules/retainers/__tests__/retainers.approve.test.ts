import { describe, it, expect } from "vitest";
import { permissionAllowed } from "../../../utils/permissionCheck";
import { ROLE_PERMISSIONS } from "../../../utils/permissions";

describe("retainer.approve", () => {
  it("is granted to OWNER and ADMIN via *", () => {
    expect(permissionAllowed(ROLE_PERMISSIONS.OWNER, "retainer.approve")).toBe(true);
    expect(permissionAllowed(ROLE_PERMISSIONS.ADMIN, "retainer.approve")).toBe(true);
  });

  it("is denied to ACCOUNTANT, MANAGER, and VIEWER", () => {
    expect(permissionAllowed(ROLE_PERMISSIONS.ACCOUNTANT, "retainer.approve")).toBe(false);
    expect(permissionAllowed(ROLE_PERMISSIONS.MANAGER, "retainer.approve")).toBe(false);
    expect(permissionAllowed(ROLE_PERMISSIONS.VIEWER, "retainer.approve")).toBe(false);
  });
});
