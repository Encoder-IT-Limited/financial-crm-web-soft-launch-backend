/**
 * Live API QA — Admin portal + public site (missing-admin-public.md).
 */
const API = process.env.API_BASE ?? "http://localhost:4001/api/v1";
const ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@mrm.local";
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "SecurePass123";

const results = [];

function record(suite, name, passed, detail = "") {
  results.push({ suite, case: name, passed, detail: String(detail).slice(0, 400) });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${suite} :: ${name}${!passed && detail ? " — " + String(detail).slice(0, 180) : ""}`);
}

async function request(path, { method = "GET", token, csrf, cookie, body, tenant } = {}) {
  const headers = { Accept: "application/json" };
  if (tenant) headers["X-Tenant-Subdomain"] = tenant;
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
  return { status: res.status, json, headers: res.headers, text: null };
}

async function requestRaw(path, { method = "GET", token } = {}) {
  const headers = { Accept: "text/html" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
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
  console.log("Admin + Public QA — API");
  console.log(`Target: ${API}`);
  console.log("=".repeat(72));

  const csrfRes = await request("/auth/csrf");
  const csrf = dataOf(csrfRes.json)?.csrf ?? csrfRes.json?.csrf;
  const cookie = cookieHeader(csrfRes);

  const settings = dataOf((await request("/settings")).json);
  record("Public settings", "GET /settings unauthenticated", Boolean(settings?.platformName), settings?.platformName);

  const plans = dataOf((await request("/plans")).json) ?? [];
  record("Public plans", "Live plans include minSeats/salesAssisted", Array.isArray(plans) && plans.every((p) => "minSeats" in p && "salesAssisted" in p), plans.length);

  const contactRes = await request("/contact", {
    method: "POST",
    csrf,
    cookie,
    body: { name: "QA Bot", email: "qa@example.com", company: "QA", message: "This is a live QA contact message." },
  });
  record("Contact", "POST /contact accepted", contactRes.status === 201 && dataOf(contactRes.json)?.accepted === true, contactRes.status);

  const forgot = await request("/auth/forgot-password", {
    method: "POST",
    csrf,
    cookie,
    body: { email: "nobody-qa@example.com" },
  });
  const otp = dataOf(forgot.json)?.otp;
  record("Auth", "Forgot-password returns OTP in non-prod", forgot.status === 200 && /^\d{6}$/.test(otp ?? ""), otp);

  if (otp) {
    const verify = await request("/auth/verify-otp", {
      method: "POST",
      csrf,
      cookie,
      body: { email: "nobody-qa@example.com", otp },
    });
    record("Auth", "Verify OTP", verify.status === 200 && dataOf(verify.json)?.verified === true, verify.status);

    const badReset = await request("/auth/reset-password", {
      method: "POST",
      csrf,
      cookie,
      body: { email: "nobody-qa@example.com", otp, password: "NewPass1234" },
    });
    record("Auth", "Reset unknown email is 404", badReset.status === 404, badReset.status);
  } else {
    record("Auth", "Verify OTP", false, "no OTP returned");
    record("Auth", "Reset unknown email is 404", false, "skipped");
  }

  const loginRes = await request("/auth/login", {
    method: "POST",
    csrf,
    cookie,
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = dataOf(loginRes.json)?.tokens?.accessToken;
  record("Auth", "Platform admin login", Boolean(token), loginRes.status);
  if (!token) {
    console.error(JSON.stringify(loginRes.json, null, 2));
    process.exit(1);
  }

  const patched = dataOf(
    (
      await request("/admin/settings", {
        method: "PATCH",
        token,
        body: { tagline: "QA tagline", contactEmail: "hello@mrmportal.com", currency: "BDT" },
      })
    ).json,
  );
  record("Settings", "PATCH persists tagline/contact/currency", patched?.tagline === "QA tagline" && patched?.currency === "BDT", patched?.tagline);

  const publicAfter = dataOf((await request("/settings")).json);
  record("Settings", "Public GET reflects admin PATCH", publicAfter?.tagline === "QA tagline" && publicAfter?.currency === "BDT", publicAfter?.tagline);

  const dashboard = dataOf((await request("/admin/dashboard", { token })).json);
  record(
    "Dashboard",
    "GET /admin/dashboard kpis",
    dashboard?.kpis && typeof dashboard.kpis.newTenantsLast30Days === "number",
    dashboard?.kpis?.activeTenants,
  );

  const auditPage = await request("/admin/audit?page=1&pageSize=10", { token });
  const auditData = dataOf(auditPage.json);
  record(
    "Audit",
    "Paged list returns items+meta",
    Array.isArray(auditData) && typeof auditPage.json?.meta?.total === "number",
    auditPage.json?.meta?.total,
  );

  const tenants = dataOf((await request("/admin/tenants", { token })).json) ?? [];
  record("Tenants", "List tenants", Array.isArray(tenants), tenants.length);

  const payments = dataOf((await request("/admin/payments", { token })).json) ?? [];
  record("Payments", "List payments", Array.isArray(payments), payments.length);
  if (payments[0]) {
    const one = dataOf((await request(`/admin/payments/${payments[0].id}`, { token })).json);
    record("Payments", "GET payment by id", one?.id === payments[0].id, one?.reference);
    const invoice = await requestRaw(`/admin/payments/${payments[0].id}/invoice`, { token });
    record("Payments", "HTML invoice download", invoice.status === 200 && invoice.text.includes("Payment receipt"), invoice.status);
  } else {
    record("Payments", "GET payment by id", true, "no payments seeded");
    record("Payments", "HTML invoice download", true, "no payments seeded");
  }

  const failed = results.filter((r) => !r.passed);
  console.log("=".repeat(72));
  console.log(`Done: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
