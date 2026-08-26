import { describe, it, expect } from "vitest";
import { parsePageQuery, pageMeta, isPagedQuery } from "../../../utils/pagination";
import { resolveCurrency, withCurrency } from "../../../utils/currency";
import { formatDocumentNumber } from "../../../utils/documentNumber";

describe("isPagedQuery", () => {
  it("is false when no page params are present", () => {
    expect(isPagedQuery({})).toBe(false);
  });

  it("is true when any page param is present", () => {
    expect(isPagedQuery({ page: 1 })).toBe(true);
    expect(isPagedQuery({ limit: 10 })).toBe(true);
  });
});

describe("parsePageQuery", () => {
  it("defaults to page 1 / 25", () => {
    expect(parsePageQuery({})).toEqual({ page: 1, pageSize: 25, skip: 0 });
  });

  it("honors page + pageSize", () => {
    expect(parsePageQuery({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, skip: 20 });
  });

  it("honors limit + offset aliases", () => {
    expect(parsePageQuery({ limit: 10, offset: 20 })).toEqual({ page: 3, pageSize: 10, skip: 20 });
  });

  it("caps pageSize at 100", () => {
    expect(parsePageQuery({ pageSize: 500 }).pageSize).toBe(100);
  });
});

describe("pageMeta", () => {
  it("returns total/page/pageSize", () => {
    expect(pageMeta(44, 2, 10)).toEqual({ page: 2, pageSize: 10, total: 44 });
  });
});

describe("resolveCurrency", () => {
  it("prefers the first non-empty candidate", () => {
    expect(resolveCurrency("bdt", "AED")).toBe("BDT");
    expect(resolveCurrency(undefined, "BDT")).toBe("BDT");
    expect(resolveCurrency(null, "", undefined)).toBe("AED");
  });
});

describe("withCurrency", () => {
  it("attaches currency without dropping other fields", () => {
    expect(withCurrency({ id: "1" }, "BDT")).toEqual({ id: "1", currency: "BDT" });
  });
});

describe("formatDocumentNumber", () => {
  it("pads invoice-style sequences", () => {
    expect(formatDocumentNumber("INV", 46)).toBe("INV-000047");
    expect(formatDocumentNumber("CN", 10)).toBe("CN-000011");
    expect(formatDocumentNumber("PRO", 0)).toBe("PRO-000001");
  });
});
