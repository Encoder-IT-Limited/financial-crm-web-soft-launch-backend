import { describe, it, expect } from "vitest";
import { permissionAllowed } from "../../../utils/permissionCheck";

describe("permissionAllowed", () => {
  it("grants everything to *", () => {
    expect(permissionAllowed(["*"], "pos.refund")).toBe(true);
  });

  it("matches module wildcards", () => {
    expect(permissionAllowed(["pos.*"], "pos.view")).toBe(true);
    expect(permissionAllowed(["pos.*"], "pos.manage")).toBe(true);
    expect(permissionAllowed(["pos.*"], "invoice.view")).toBe(false);
  });

  it("matches *.view", () => {
    expect(permissionAllowed(["*.view"], "pos.view")).toBe(true);
    expect(permissionAllowed(["*.view"], "pos.createSale")).toBe(false);
  });

  it("matches exact grants", () => {
    expect(permissionAllowed(["pos.view", "pos.createSale"], "pos.createSale")).toBe(true);
    expect(permissionAllowed(["pos.view", "pos.createSale"], "pos.manage")).toBe(false);
  });
});
