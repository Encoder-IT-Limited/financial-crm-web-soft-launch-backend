/**
 * Live UI QA — Sales & Invoicing screens.
 */
import { createRequire } from "node:module";

const require = createRequire("/tmp/pw-qa/package.json");
const { chromium } = require("playwright");

const BASE = process.env.UI_BASE ?? "http://localhost:3001";
const EMAIL = "owner@demo.local";
const PASSWORD = "SecurePass123";

const results = [];
function record(suite, name, passed, detail = "") {
  results.push({ suite, case: name, passed, detail: String(detail).slice(0, 300) });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${suite} :: ${name}${!passed && detail ? " — " + String(detail).slice(0, 140) : ""}`);
}

async function main() {
  console.log("=".repeat(72));
  console.log("SALES / INVOICING QA — UI");
  console.log(`Target: ${BASE}`);
  console.log("=".repeat(72));

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
    await page.evaluate(() => sessionStorage.setItem("mrm_tenant_subdomain", "demo"));
    record("Auth", "Login page loads", /login|email|password/i.test(await page.locator("body").innerText()));

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ]);
    const onDash = page.url().includes("/dashboard");
    record("Auth", "Login → dashboard", onDash, page.url());
    if (!onDash) throw new Error("login failed");

    await page.goto(`${BASE}/dashboard/invoices`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    const invoicesBody = await page.locator("body").innerText();
    record("Invoices", "List page renders", /invoice/i.test(invoicesBody) && !/Application error/i.test(invoicesBody));
    record("Invoices", "Pagination controls present", /page|prev|next|entries/i.test(invoicesBody), invoicesBody.slice(0, 80));
    record("Invoices", "No hardcoded AED on list", !/\bAED\b/.test(invoicesBody) || /BDT|৳/.test(invoicesBody), invoicesBody.match(/\bAED\b|\bBDT\b|৳/)?.[0]);

    await page.goto(`${BASE}/dashboard/invoices/new`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800);
    const newBody = await page.locator("body").innerText();
    record("Invoices", "New invoice form", /customer|line|currency/i.test(newBody));
    record("Invoices", "Product / service line mode", /product|service|custom/i.test(newBody));
    const currencyValue = await page
      .locator("button, [data-slot='select-trigger']")
      .filter({ hasText: /AED|USD|EUR|GBP|SAR|BDT/ })
      .first()
      .innerText()
      .catch(() => "");
    record("Invoices", "Currency picker shows BDT", /BDT/.test(currencyValue) || /BDT/.test(newBody), currencyValue);

    await page.goto(`${BASE}/dashboard/proposals/new`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(600);
    const proBody = await page.locator("body").innerText();
    record("Proposals", "New proposal has product line picker", /product|service|custom/i.test(proBody));

    await page.goto(`${BASE}/dashboard/invoices`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /recurring/i }).click().catch(() => {});
    await page.waitForTimeout(600);
    const recBody = await page.locator("body").innerText();
    record("Recurring", "Templates panel", /template|recurring/i.test(recBody));

    await page.goto(`${BASE}/dashboard/credit-notes`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => page.goto(`${BASE}/dashboard/adjustments`));
    await page.waitForTimeout(600);
    const adjBody = await page.locator("body").innerText();
    record("Adjustments", "Credit/debit notes page", /credit|debit|adjustment/i.test(adjBody));

    await page.goto(`${BASE}/dashboard/retainers`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(600);
    const retBody = await page.locator("body").innerText();
    record("Retainers", "Retainers page", /retainer/i.test(retBody) && !/Application error/i.test(retBody));
  } catch (err) {
    record("Runner", "Suite aborted", false, String(err));
    await page.screenshot({ path: "/tmp/sales-invoice-ui-fail.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log("=".repeat(72));
  console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.suite} :: ${f.case} — ${f.detail}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
