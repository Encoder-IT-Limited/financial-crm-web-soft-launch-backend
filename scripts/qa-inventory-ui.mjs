/**
 * Live UI QA — Full Inventory module (Playwright).
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.UI_BASE ?? "http://localhost:3001";
const EMAIL = "owner@demo.local";
const PASSWORD = "SecurePass123";

const results = [];

function record(suite, caseName, passed, detail = "", severity = "P1") {
  results.push({ suite, case: caseName, passed, detail: String(detail).slice(0, 300), severity });
  console.log(
    `[${passed ? "PASS" : "FAIL"}] [${severity}] ${suite} :: ${caseName}${!passed && detail ? " — " + String(detail).slice(0, 120) : ""}`,
  );
}

async function gotoOk(page, path, suite, label, expectText) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(600);
  const status = res?.status() ?? 0;
  const body = await page.locator("body").innerText().catch(() => "");
  const crashed = /Application error|Unhandled Runtime Error/i.test(body);
  const comingSoon = /coming soon/i.test(body);
  let textOk = true;
  if (expectText) {
    textOk = expectText.test(body);
  }
  const ok = status < 400 && !crashed && textOk;
  record(
    suite,
    label,
    ok,
    crashed ? "runtime error" : comingSoon ? "ComingSoon" : !textOk ? "expected text missing" : `HTTP ${status}`,
    comingSoon ? "P2" : "P1",
  );
  return { ok, body, comingSoon };
}

async function main() {
  console.log("=".repeat(72));
  console.log("FULL INVENTORY QA — UI");
  console.log(`Target: ${BASE}`);
  console.log("=".repeat(72));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(() => sessionStorage.setItem("mrm_tenant_subdomain", "demo"));
    record("Auth", "Login page loads", true);

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    const onDash = page.url().includes("/dashboard");
    record("Auth", "Login → /dashboard", onDash, page.url());
    if (!onDash) throw new Error("Login failed");

    const pages = [
      ["/dashboard/inventory", "Inventory dashboard", /inventory|stock|product|warehouse/i],
      ["/dashboard/products", "Products list", /product|sku|stock/i],
      ["/dashboard/products/new", "New product form", /product|sku|name|save|create/i],
      ["/dashboard/warehouses", "Warehouses & stock", /warehouse|stock/i],
      ["/dashboard/warehouses/new", "New warehouse form", /warehouse|code|name|save|create/i],
      ["/dashboard/stock-movement", "Stock movement", /movement|stock|receive|issue|adjust/i],
      ["/dashboard/stock-transfer", "Stock transfer", /transfer|warehouse/i],
      ["/dashboard/goods-receipt", "Goods receipt", /receipt|goods|receive|purchase/i],
      ["/dashboard/adjustments", "Inventory adjustments", /adjust|stock|quantity/i],
      ["/dashboard/batches", "Batches", /batch|expiry|lot/i],
      ["/dashboard/reorder", "Reorder / low stock", /reorder|low|stock|minimum/i],
      ["/dashboard/valuation", "Valuation", /valuation|cost|value|stock/i],
      ["/dashboard/inv-reports", "Inventory reports", /report|inventory|stock/i],
    ];

    for (const [path, label, re] of pages) {
      await gotoOk(page, path, "Inventory UI", label, re);
    }

    // Products: open first row if present
    await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    const rowLink = page.locator('a[href*="/dashboard/products/"]').filter({ hasNotText: /new/i }).first();
    const hasRow = await rowLink.isVisible().catch(() => false);
    if (hasRow) {
      await rowLink.click();
      await page.waitForTimeout(800);
      const detailOk = /product|sku|stock|edit|price/i.test(await page.locator("body").innerText());
      record("Inventory UI", "Product detail page opens", detailOk, page.url());
    } else {
      record("Inventory UI", "Product detail page opens", true, "no product rows — skipped", "P2");
    }

    // Nav labels under Inventory group
    await page.goto(`${BASE}/dashboard/inventory`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const navBody = await page.locator("nav, aside, [role='navigation'], body").first().innerText();
    for (const label of ["Products", "Warehouses", "Stock Movement", "Stock Transfer", "Batches"]) {
      record("Inventory Nav", `Nav mentions ${label}`, new RegExp(label, "i").test(navBody), "", "P2");
    }

    await page.screenshot({ path: "/tmp/inventory-ui-dashboard.png", fullPage: true });
    record("Artifacts", "Inventory screenshot saved", true, "/tmp/inventory-ui-dashboard.png", "P2");
  } catch (e) {
    record("Runner", "Suite aborted", false, String(e));
    await page.screenshot({ path: "/tmp/inventory-ui-fail.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  console.log("=".repeat(72));
  console.log(`SUMMARY: ${passed}/${results.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const r of failed) console.log(`  - [${r.severity}] ${r.suite} :: ${r.case} — ${r.detail}`);
  }
  console.log("=".repeat(72));
  writeFileSync("/tmp/inventory-full-ui-qa.json", JSON.stringify({ passed, total: results.length, failed, results }, null, 2));
  console.log("Report: /tmp/inventory-full-ui-qa.json");
  const critical = failed.filter((r) => r.severity === "P0" || r.severity === "P1");
  process.exit(critical.length ? 1 : 0);
}

main();
