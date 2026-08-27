/**
 * Live API QA — POS completeness (missing-pos.md).
 */
const API = process.env.API_BASE ?? "http://localhost:4001/api/v1";
const EMAIL = "owner@demo.local";
const PASSWORD = "SecurePass123";
const TENANT = "demo";

const results = [];

function record(suite, name, passed, detail = "") {
  results.push({ suite, case: name, passed, detail: String(detail).slice(0, 400) });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${suite} :: ${name}${!passed && detail ? " — " + String(detail).slice(0, 180) : ""}`);
}

async function request(path, { method = "GET", token, csrf, cookie, body } = {}) {
  const headers = {
    "X-Tenant-Subdomain": TENANT,
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

function dataOf(json) {
  if (json && json.success === true) return json.data;
  return json;
}

function cookieHeader(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  console.log("=".repeat(72));
  console.log("POS QA — API");
  console.log(`Target: ${API}  tenant=${TENANT}`);
  console.log("=".repeat(72));

  const csrfRes = await request("/auth/csrf");
  const csrf = dataOf(csrfRes.json)?.csrf ?? csrfRes.json?.csrf;
  const cookie = cookieHeader(csrfRes);
  const loginRes = await request("/auth/login", {
    method: "POST",
    csrf,
    cookie,
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = dataOf(loginRes.json)?.tokens?.accessToken;
  record("Auth", "Login", Boolean(token), loginRes.status);
  if (!token) {
    console.error(JSON.stringify(loginRes.json, null, 2));
    process.exit(1);
  }

  const stockAll = dataOf((await request("/inventory/stock", { token })).json) ?? [];
  const warehouseIds = [...new Set(stockAll.map((r) => r.warehouseId).filter(Boolean))];
  record("Stock", "List returns rows", Array.isArray(stockAll), stockAll.length);
  if (warehouseIds.length > 0) {
    const filtered = dataOf((await request(`/inventory/stock?warehouseId=${warehouseIds[0]}`, { token })).json) ?? [];
    const allMatch = filtered.every((r) => r.warehouseId === warehouseIds[0]);
    const narrower = warehouseIds.length === 1 ? true : filtered.length <= stockAll.length;
    record("Stock", "warehouseId filter is applied", allMatch && narrower, `all=${stockAll.length} filtered=${filtered.length}`);
  } else {
    record("Stock", "warehouseId filter is applied", true, "no stock rows");
  }

  const terminals = dataOf((await request("/pos/terminals", { token })).json) ?? [];
  const active = dataOf((await request("/pos/terminals?status=ACTIVE", { token })).json) ?? [];
  record("Terminals", "List + status=ACTIVE", Array.isArray(terminals) && active.every((t) => t.status === "ACTIVE"), `all=${terminals.length} active=${active.length}`);

  const sessions = dataOf((await request("/pos/sessions", { token })).json) ?? [];
  const openSessions = dataOf((await request("/pos/sessions?status=OPEN", { token })).json) ?? [];
  record("Sessions", "status=OPEN filter", openSessions.every((s) => s.status === "OPEN"), `open=${openSessions.length} all=${sessions.length}`);
  if (terminals[0]) {
    const byTerm = dataOf((await request(`/pos/sessions?terminalId=${terminals[0].id}`, { token })).json) ?? [];
    record("Sessions", "terminalId filter", byTerm.every((s) => s.terminalId === terminals[0].id), byTerm.length);
  }

  const sales = dataOf((await request("/pos/sales", { token })).json) ?? [];
  record("Sales", "List returns array with terminalId", Array.isArray(sales) && (sales.length === 0 || "terminalId" in sales[0]), sales.length);

  if (sales[0]?.terminalId) {
    const byTerm = dataOf((await request(`/pos/sales?terminalId=${sales[0].terminalId}`, { token })).json) ?? [];
    record("Sales", "terminalId filter", byTerm.every((s) => s.terminalId === sales[0].terminalId), `n=${byTerm.length}`);
  } else {
    record("Sales", "terminalId filter", true, "no sales with terminal");
  }

  if (sales[0]?.customerId) {
    const byCust = dataOf((await request(`/pos/sales?customerId=${sales[0].customerId}`, { token })).json) ?? [];
    record("Sales", "customerId filter", byCust.every((s) => s.customerId === sales[0].customerId), `n=${byCust.length}`);
  }

  const dateFiltered = dataOf((await request("/pos/sales?startDate=2099-01-01", { token })).json) ?? [];
  record("Sales", "startDate far-future returns empty", Array.isArray(dateFiltered) && dateFiltered.length === 0, dateFiltered.length);

  const saleWithInvoice = sales.find((s) => s.invoiceId);
  if (saleWithInvoice?.invoiceId) {
    const invoice = dataOf((await request(`/invoices/${saleWithInvoice.invoiceId}`, { token })).json);
    const payments = invoice?.payments ?? [];
    const currencies = payments.map((p) => p.currency);
    record(
      "Payments",
      "POS invoice payment currency is stamped",
      payments.length === 0 || currencies.every((c) => typeof c === "string" && c.length === 3),
      JSON.stringify(currencies),
    );
  } else {
    record("Payments", "POS invoice payment currency is stamped", true, "no POS invoice in list");
  }

  const pinRes = await request("/pos/manager-pin", { method: "POST", token, body: { pin: "1234" } });
  record(
    "PIN",
    "POST /pos/manager-pin exists (200 or current-pin required)",
    pinRes.status === 200 || pinRes.status === 403 || pinRes.status === 400,
    `${pinRes.status} ${dataOf(pinRes.json)?.code ?? pinRes.json?.error?.code ?? ""}`,
  );

  const deletable = terminals.find((t) => t.status === "ACTIVE");
  if (deletable) {
    const del = await request(`/pos/terminals/${deletable.id}`, { method: "DELETE", token });
    const after = dataOf(del.json);
    const okDeactivate = del.status === 200 && after?.status === "INACTIVE";
    const openConflict = del.status === 409;
    record("Terminals", "DELETE deactivates (or 409 if shift open)", okDeactivate || openConflict, `${del.status} ${after?.status ?? del.json?.error?.code}`);
    if (okDeactivate) {
      await request(`/pos/terminals/${deletable.id}`, { method: "PATCH", token, body: { status: "ACTIVE" } });
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log("-".repeat(72));
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
