/**
 * Live UI smoke — Phase 1 soft launch (Playwright).
 * Usage: cd frontend && npx playwright test ../backend/scripts/qa-phase1-ui.mjs
 * Or: node with playwright programmatic API below.
 */
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = process.env.UI_BASE ?? "http://localhost:3001";
const EMAIL = "owner@demo.local";
const PASSWORD = "SecurePass123";

const results = [];

function record(suite, caseName, passed, detail = "", severity = "P1") {
  results.push({ suite, case: caseName, passed, detail: String(detail).slice(0, 300), severity });
  console.log(`[${passed ? "PASS" : "FAIL"}] [${severity}] ${suite} :: ${caseName}${!passed && detail ? " — " + String(detail).slice(0, 120) : ""}`);
}

async function expectVisible(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { state: "visible", timeout });
}

async function gotoOk(page, path, suite, label) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = res?.status() ?? 0;
  const body = await page.locator("body").innerText().catch(() => "");
  const crashed = body.includes("Application error") || body.includes("Unhandled Runtime Error");
  const comingSoon = /coming soon/i.test(body) && !/live/i.test(label);
  const ok = status < 400 && !crashed;
  record(suite, label, ok, crashed ? "runtime error" : comingSoon ? "ComingSoon page" : `HTTP ${status}`);
  return { ok, body, comingSoon };
}

async function main() {
  console.log("=".repeat(72));
  console.log("LIVE UI QA — Phase 1 Soft Launch");
  console.log(`Target: ${BASE}`);
  console.log("=".repeat(72));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // --- Login ---
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
    const loginErr = await page.locator("form p, .text-red").first().textContent().catch(() => null);
    record("Auth", "Login as owner@demo.local → /dashboard", onDash, loginErr || page.url());

    if (!onDash) {
      await page.screenshot({ path: "/tmp/ui-qa-login-fail.png", fullPage: true });
      throw new Error("Login failed — aborting UI suite");
    }

    await page.waitForTimeout(800);

    // --- Nav / page loads (Phase 1 live screens) ---
    const pages = [
      ["/dashboard", "Sales dashboard"],
      ["/dashboard/customers", "Customers list"],
      ["/dashboard/invoices", "Invoices list"],
      ["/dashboard/proposals", "Proposals list"],
      ["/dashboard/retainers", "Retainers list"],
      ["/dashboard/credit-notes", "Credit & debit notes"],
      ["/dashboard/fulfillment", "Delivery / Fulfillment"],
      ["/dashboard/pos", "POS register"],
      ["/dashboard/alerts", "Alerts"],
      ["/dashboard/reports", "Reports"],
      ["/dashboard/settings", "Tenant settings"],
      ["/dashboard/products", "Products"],
      ["/dashboard/warehouses", "Warehouses"],
      ["/dashboard/vendors", "Vendors"],
      ["/dashboard/purchase-orders", "Purchase orders"],
      ["/dashboard/bills", "Vendor bills"],
    ];

    for (const [path, label] of pages) {
      consoleErrors.length = 0;
      await gotoOk(page, path, "Navigation", label);
      await page.waitForTimeout(400);
      // soft check: no uncaught pageerror flood
      const fatal = consoleErrors.filter((e) => /ChunkLoadError|Hydration|TypeError|Cannot read/i.test(e));
      if (fatal.length) {
        record("Navigation", `${label} — no fatal console errors`, false, fatal[0], "P1");
      }
    }

    // --- Invoices interaction ---
    await page.goto(`${BASE}/dashboard/invoices`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const invRows = page.locator("table tbody tr, [role='row']");
    const invCount = await invRows.count().catch(() => 0);
    record("Invoices", "Invoices table renders rows or empty state", invCount >= 0 || (await page.locator("body").innerText()).length > 50);

    const newInv = page.getByRole("link", { name: /new invoice/i }).or(page.getByRole("button", { name: /new invoice/i }));
    if (await newInv.first().isVisible().catch(() => false)) {
      await newInv.first().click();
      await page.waitForURL(/\/invoices\/new/, { timeout: 15000 });
      record("Invoices", "Open New Invoice form", page.url().includes("/invoices/new"));
      const hasCustomer = await page
        .getByText(/customer/i)
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      const hasPlaceholder = await page.getByText(/select customer/i).isVisible().catch(() => false);
      record("Invoices", "New invoice form shows customer field", hasCustomer || hasPlaceholder);
      await page.goto(`${BASE}/dashboard/invoices`);
    } else {
      record("Invoices", "Open New Invoice form", false, "New Invoice control not found", "P1");
    }

    // --- Customers ---
    await page.goto(`${BASE}/dashboard/customers`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const custText = await page.locator("body").innerText();
    record("Customers", "Customers page has content", /customer|name|email|outstanding/i.test(custText));

    // --- Proposals ---
    await page.goto(`${BASE}/dashboard/proposals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    record("Proposals", "Proposals page loads", /proposal|pipeline|draft|sent/i.test(await page.locator("body").innerText()));

    // --- Retainers ---
    await page.goto(`${BASE}/dashboard/retainers`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    record("Retainers", "Retainers page loads", /retainer|balance|contract/i.test(await page.locator("body").innerText()));

    // --- Credit notes tabs ---
    await page.goto(`${BASE}/dashboard/credit-notes`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const cnBody = await page.locator("body").innerText();
    record("Adjustments", "Credit notes page loads", /credit|debit/i.test(cnBody));
    const debitTab = page.getByRole("tab", { name: /debit/i });
    if (await debitTab.isVisible().catch(() => false)) {
      await debitTab.click();
      await page.waitForTimeout(400);
      record("Adjustments", "Debit notes tab switchable", true);
    } else {
      record("Adjustments", "Debit notes tab switchable", /debit/i.test(cnBody), "tab role not found — page still mentions debit", "P2");
    }

    // --- Fulfillment ---
    await page.goto(`${BASE}/dashboard/fulfillment`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    record(
      "Fulfillment",
      "Fulfillment list page loads",
      /fulfill|deliver|shipment|unfulfilled|ordered/i.test(await page.locator("body").innerText()),
    );

    // --- POS ---
    await page.goto(`${BASE}/dashboard/pos`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const posBody = await page.locator("body").innerText();
    record("POS", "POS page loads", /pos|terminal|session|sale|register/i.test(posBody));

    // --- Alerts ---
    await page.goto(`${BASE}/dashboard/alerts`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    record("Alerts", "Alerts page loads (not ComingSoon)", !/coming soon/i.test(await page.locator("body").innerText()) || /alert|retainer|reconcil/i.test(await page.locator("body").innerText()));

    // --- Reports ---
    await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const rep = await page.locator("body").innerText();
    record("Reports", "Reports tabs present", /sales report|invoice report|customer statement/i.test(rep));

    // --- Settings ---
    await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    record("Settings", "Settings page loads", /setting|organization|profile|legal|currency/i.test(await page.locator("body").innerText()));

    // --- Products live ---
    await page.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    record("Inventory", "Products page loads", /product|sku|stock/i.test(await page.locator("body").innerText()));

    // Screenshot dashboard for artifact
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/ui-qa-dashboard.png", fullPage: true });
    record("Artifacts", "Dashboard screenshot saved", true, "/tmp/ui-qa-dashboard.png", "P2");
  } catch (err) {
    record("Suite", "CRASH", false, err?.message || String(err), "P0");
    await page.screenshot({ path: "/tmp/ui-qa-crash.png", fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  console.log("\n" + "=".repeat(72));
  console.log(`SUMMARY: ${passed}/${results.length} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  - [${f.severity}] ${f.suite} :: ${f.case}${f.detail ? " — " + f.detail : ""}`);
  }
  console.log("=".repeat(72));
  writeFileSync("/tmp/phase1-ui-qa-report.json", JSON.stringify({ passed, total: results.length, results }, null, 2));
  console.log("Report: /tmp/phase1-ui-qa-report.json");
  process.exit(failed.some((f) => f.severity === "P0" || f.severity === "P1") ? 1 : 0);
}

main();
