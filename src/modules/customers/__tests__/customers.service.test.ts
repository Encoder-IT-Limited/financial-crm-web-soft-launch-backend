import { describe, it, expect } from "vitest";
import * as customersService from "../customers.service";

describe("customers.service – exports", () => {
  it("exports expected functions", () => {
    expect(typeof customersService.listCustomers).toBe("function");
    expect(typeof customersService.getCustomer).toBe("function");
    expect(typeof customersService.createCustomer).toBe("function");
    expect(typeof customersService.updateCustomer).toBe("function");
  });
});
