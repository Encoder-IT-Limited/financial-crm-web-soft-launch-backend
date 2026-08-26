import { describe, it, expect } from "vitest";
import { AppError } from "../../../utils/errors";
import { resolveRefundAmount } from "../retainers.service";

describe("retainer refund amount", () => {
  it("rejects a request above remaining balance instead of silently capping", () => {
    expect(() => resolveRefundAmount(50, 9999)).toThrow(AppError);
    try {
      resolveRefundAmount(50, 9999);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("REFUND_EXCEEDS_BALANCE");
      expect((err as AppError).status).toBe(400);
    }
  });

  it("refunds the remaining balance when no amount is sent", () => {
    expect(resolveRefundAmount(50)).toBe(50);
  });

  it("allows a partial refund at or below remaining", () => {
    expect(resolveRefundAmount(50, 20)).toBe(20);
    expect(resolveRefundAmount(50, 50)).toBe(50);
  });
});
