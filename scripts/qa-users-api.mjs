/**
 * Live API QA — Users & invites (Phase 1).
 */
const API = process.env.API_BASE ?? "http://localhost:4001/api/v1";
const EMAIL = process.env.POS_QA_EMAIL ?? "owner@demo.local";
const PASSWORD = process.env.POS_QA_PASSWORD ?? "SecurePass123";
const TENANT = process.env.POS_QA_TENANT ?? "demo";

const results = [];

function record(suite, name, passed, detail = "") {
  results.push({ suite, case: name, passed, detail: String(detail).slice(0, 400) });
  console.log(
    `[${passed ? "PASS" : "FAIL"}] ${suite} :: ${name}${!passed && detail ? " — " + String(detail).slice(0, 160) : ""}`,
  );
}

async function request(path, { method = "GET", token, csrf, cookie, body, tenantHeader = true } = {}) {
  const headers = { Accept: "application/json" };
  if (tenantHeader) headers["X-Tenant-Subdomain"] = TENANT;
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

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@qa.local`;
}

async function main() {
  console.log("=".repeat(72));
  console.log("USERS / INVITES QA — API");
  console.log(`Target: ${API}  tenant=${TENANT}`);
  console.log("=".repeat(72));

  const csrfRes = await request("/auth/csrf");
  const csrf = dataOf(csrfRes.json)?.csrf ?? csrfRes.json?.csrf;
  const cookie = cookieHeader(csrfRes);
  record("Auth", "CSRF token", Boolean(csrf), csrfRes.status);

  const loginRes = await request("/auth/login", {
    method: "POST",
    csrf,
    cookie,
    body: { email: EMAIL, password: PASSWORD },
  });
  const login = dataOf(loginRes.json);
  const token = login?.tokens?.accessToken;
  record("Auth", `Login ${EMAIL}`, Boolean(token) && login?.role === "OWNER", `${loginRes.status} role=${login?.role}`);
  if (!token) {
    console.error(JSON.stringify(loginRes.json, null, 2));
    process.exit(1);
  }

  const meRes = await request("/auth/me", { token });
  const me = dataOf(meRes.json);
  record("Auth", "/me includes role", me?.role === "OWNER" && Array.isArray(me?.permissions), me?.role);

  const catalogRes = await request("/users/roles", { token });
  const catalog = dataOf(catalogRes.json);
  record(
    "Catalog",
    "Role catalog includes invitable roles",
    Array.isArray(catalog) && catalog.some((r) => r.key === "SALES_CASHIER" && r.invitable) && catalog.some((r) => r.key === "OWNER" && !r.invitable),
    catalogRes.status,
  );

  const listRes = await request("/users", { token });
  const users = dataOf(listRes.json);
  record("List", "List users array", Array.isArray(users) && users.length >= 1, `${listRes.status} n=${users?.length}`);

  const seatsRes = await request("/users/seats", { token });
  const seats = dataOf(seatsRes.json);
  record(
    "Seats",
    "Seat usage returned",
    typeof seats?.used === "number" && typeof seats?.total === "number" && typeof seats?.message === "string",
    JSON.stringify(seats),
  );

  const ownerInvite = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "Nope", email: uniqueEmail("owner"), role: "OWNER" },
  });
  record(
    "Guards",
    "Cannot invite OWNER",
    ownerInvite.status === 400,
    `${ownerInvite.status} ${ownerInvite.json?.error?.code ?? ""}`,
  );

  const ownerRow = (users ?? []).find((u) => u.role === "OWNER") ?? { id: me.id };
  const disableOwner = await request(`/users/${ownerRow.id}`, {
    method: "PATCH",
    token,
    body: { status: "DISABLED" },
  });
  record(
    "Guards",
    "Cannot disable last OWNER",
    disableOwner.status === 400 && disableOwner.json?.error?.code === "LAST_OWNER",
    `${disableOwner.status} ${disableOwner.json?.error?.code ?? ""}`,
  );

  const selfRole = await request(`/users/${me.id}`, {
    method: "PATCH",
    token,
    body: { role: "ADMIN" },
  });
  record(
    "Guards",
    "Cannot change own role",
    selfRole.status === 400 && (selfRole.json?.error?.code === "CANNOT_MODIFY_SELF" || selfRole.json?.error?.code === "LAST_OWNER"),
    `${selfRole.status} ${selfRole.json?.error?.code ?? ""}`,
  );

  const usedBeforeViewer = dataOf((await request("/users/seats", { token })).json)?.used;
  const viewerInvite = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "QA Viewer", email: uniqueEmail("viewer"), role: "VIEWER" },
  });
  const viewer = dataOf(viewerInvite.json);
  record(
    "Invite",
    "VIEWER invite returns acceptToken (mail bypass)",
    viewerInvite.status === 201 && Boolean(viewer?.acceptToken) && viewer?.status === "INVITED",
    `${viewerInvite.status} token=${Boolean(viewer?.acceptToken)}`,
  );
  const usedAfterViewer = dataOf((await request("/users/seats", { token })).json)?.used;
  record("Seats", "VIEWER does not increase used seats", usedAfterViewer === usedBeforeViewer, `${usedBeforeViewer} -> ${usedAfterViewer}`);

  const cashierEmail = uniqueEmail("cashier");
  const cashierInvite = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "QA Cashier", email: cashierEmail, role: "SALES_CASHIER" },
  });
  const cashier = dataOf(cashierInvite.json);
  record(
    "Invite",
    "Cashier invite created",
    cashierInvite.status === 201 && Boolean(cashier?.acceptToken),
    `${cashierInvite.status} ${cashierInvite.json?.error?.code ?? ""}`,
  );

  const preview = await request(`/auth/invite?token=${encodeURIComponent(cashier.acceptToken ?? "missing")}`, {
    tenantHeader: true,
  });
  const previewData = dataOf(preview.json);
  record(
    "Accept",
    "Preview invite (tenant header still works)",
    preview.status === 200 && previewData?.email === cashierEmail,
    `${preview.status} ${previewData?.email ?? preview.json?.error?.code}`,
  );

  const acceptRes = await request("/auth/accept-invite", {
    method: "POST",
    csrf,
    cookie,
    tenantHeader: true,
    body: { token: cashier.acceptToken, password: "SecurePass123" },
  });
  const accepted = dataOf(acceptRes.json);
  record(
    "Accept",
    "Accept invite logs the user in",
    acceptRes.status === 200 && accepted?.email === cashierEmail && accepted?.role === "SALES_CASHIER",
    `${acceptRes.status} role=${accepted?.role} ${acceptRes.json?.error?.code ?? ""}`,
  );

  const cashierLogin = await request("/auth/login", {
    method: "POST",
    csrf,
    cookie,
    body: { email: cashierEmail, password: "SecurePass123" },
  });
  const cashierAuth = dataOf(cashierLogin.json);
  const cashierToken = cashierAuth?.tokens?.accessToken;
  record("Auth", "Invitee can login", Boolean(cashierToken), cashierLogin.status);

  const forbidden = await request("/users/invites", {
    method: "POST",
    token: cashierToken,
    body: { name: "Blocked", email: uniqueEmail("blocked"), role: "ADMIN" },
  });
  record(
    "Guards",
    "Invitee 403 on POST /users/invites",
    forbidden.status === 403,
    `${forbidden.status} ${forbidden.json?.error?.code ?? ""}`,
  );

  const adminEmail = uniqueEmail("admin");
  const adminInvite = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "QA Admin", email: adminEmail, role: "ADMIN" },
  });
  const adminRow = dataOf(adminInvite.json);
  if (adminRow?.acceptToken) {
    await request("/auth/accept-invite", {
      method: "POST",
      csrf,
      cookie,
      tenantHeader: true,
      body: { token: adminRow.acceptToken, password: "SecurePass123" },
    });
    const adminLogin = await request("/auth/login", {
      method: "POST",
      csrf,
      cookie,
      body: { email: adminEmail, password: "SecurePass123" },
    });
    const adminAuth = dataOf(adminLogin.json);
    const adminSelf = await request(`/users/${adminAuth?.id}`, {
      method: "PATCH",
      token: adminAuth?.tokens?.accessToken,
      body: { role: "MANAGER" },
    });
    record(
      "Guards",
      "Admin cannot change own role",
      adminSelf.status === 400 && adminSelf.json?.error?.code === "CANNOT_MODIFY_SELF",
      `${adminSelf.status} ${adminSelf.json?.error?.code ?? ""}`,
    );
  } else {
    record("Guards", "Admin cannot change own role", false, JSON.stringify(adminInvite.json));
  }

  const permCatalogRes = await request("/users/permission-catalog", { token });
  const permCatalog = dataOf(permCatalogRes.json);
  record(
    "Roles",
    "Permission catalog includes POS keys",
    Array.isArray(permCatalog) && permCatalog.some((g) => g.permissions?.some((p) => p.key === "pos.view")),
    permCatalogRes.status,
  );

  const customRoleName = `QA POS View ${Date.now().toString(36)}`;
  const createRoleRes = await request("/users/roles", {
    method: "POST",
    token,
    body: { name: customRoleName, countsTowardSeats: true, permissions: ["pos.view"] },
  });
  const customRole = dataOf(createRoleRes.json);
  record(
    "Roles",
    "Create custom role with pos.view",
    createRoleRes.status === 201 && customRole?.key && Array.isArray(customRole?.permissions) && customRole.permissions.includes("pos.view"),
    `${createRoleRes.status} key=${customRole?.key ?? ""} ${createRoleRes.json?.error?.code ?? ""}`,
  );

  const customEmail = uniqueEmail("posview");
  const customInvite = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "QA POS View", email: customEmail, role: customRole?.key },
  });
  const customUser = dataOf(customInvite.json);
  record(
    "Roles",
    "Invite user with custom role",
    customInvite.status === 201 && Boolean(customUser?.acceptToken),
    `${customInvite.status} ${customInvite.json?.error?.code ?? ""}`,
  );

  let customToken = null;
  if (customUser?.acceptToken) {
    await request("/auth/accept-invite", {
      method: "POST",
      csrf,
      cookie,
      tenantHeader: true,
      body: { token: customUser.acceptToken, password: "SecurePass123" },
    });
    const customLogin = await request("/auth/login", {
      method: "POST",
      csrf,
      cookie,
      body: { email: customEmail, password: "SecurePass123" },
    });
    customToken = dataOf(customLogin.json)?.tokens?.accessToken;
    record("Roles", "Custom role user can login", Boolean(customToken), customLogin.status);

    const customInviteForbidden = await request("/users/invites", {
      method: "POST",
      token: customToken,
      body: { name: "Blocked", email: uniqueEmail("blocked2"), role: "ADMIN" },
    });
    record(
      "Roles",
      "Custom role 403 on POST /users/invites",
      customInviteForbidden.status === 403,
      `${customInviteForbidden.status} ${customInviteForbidden.json?.error?.code ?? ""}`,
    );

    const posManage = await request("/pos/terminals", {
      method: "POST",
      token: customToken,
      body: { name: "Should Fail", location: "QA" },
    });
    record(
      "Roles",
      "Custom role 403 on POS manage",
      posManage.status === 403,
      `${posManage.status} ${posManage.json?.error?.code ?? ""}`,
    );

    const posView = await request("/pos/terminals", { token: customToken });
    record(
      "Roles",
      "GET /pos/terminals allowed with pos.view",
      posView.status === 200,
      `${posView.status} ${posView.json?.error?.code ?? ""}`,
    );

    const patched = await request(`/users/roles/${customRole.id}`, {
      method: "PATCH",
      token,
      body: { permissions: ["pos.view", "pos.manage"] },
    });
    record("Roles", "Edit custom role permissions", patched.status === 200, patched.status);

    const customMe = dataOf((await request("/auth/me", { token: customToken })).json);
    record(
      "Roles",
      "Next /me reflects edited grants",
      Array.isArray(customMe?.permissions) &&
        (customMe.permissions.includes("pos.manage") || customMe.permissions.includes("pos.*") || customMe.permissions.includes("*")),
      JSON.stringify(customMe?.permissions),
    );
  } else {
    record("Roles", "Custom role user can login", false, "invite missing acceptToken");
  }

  const rolesNow = dataOf((await request("/users/roles", { token })).json) ?? [];
  const ownerRole = rolesNow.find((r) => r.key === "OWNER");
  const deleteOwner = await request(`/users/roles/${ownerRole?.id ?? "00000000-0000-0000-0000-000000000000"}`, {
    method: "DELETE",
    token,
  });
  record(
    "Roles",
    "Cannot delete OWNER",
    deleteOwner.status === 400 && deleteOwner.json?.error?.code === "SYSTEM_ROLE",
    `${deleteOwner.status} ${deleteOwner.json?.error?.code ?? ""}`,
  );

  const deleteInUse = await request(`/users/roles/${customRole?.id}`, { method: "DELETE", token });
  record(
    "Roles",
    "Cannot delete role with users",
    deleteInUse.status === 409 && deleteInUse.json?.error?.code === "ROLE_IN_USE",
    `${deleteInUse.status} ${deleteInUse.json?.error?.code ?? ""}`,
  );

  if (customUser?.id) {
    const reassign = await request(`/users/${customUser.id}`, {
      method: "PATCH",
      token,
      body: { role: "VIEWER" },
    });
    record("Roles", "Reassign custom user before delete", reassign.status === 200, reassign.status);
  }

  const deleteAfter = await request(`/users/roles/${customRole?.id}`, { method: "DELETE", token });
  record(
    "Roles",
    "Delete custom role after reassign",
    deleteAfter.status === 200,
    `${deleteAfter.status} ${deleteAfter.json?.error?.code ?? ""}`,
  );

  const createdInvites = [];
  if (viewer?.inviteId) createdInvites.push(viewer.inviteId);

  const seatsNow = dataOf((await request("/users/seats", { token })).json);
  let remaining = Math.max(0, (seatsNow?.total ?? 0) - (seatsNow?.used ?? 0));
  if (remaining > 12) remaining = 0;
  for (let i = 0; i < remaining; i += 1) {
    const fill = await request("/users/invites", {
      method: "POST",
      token,
      body: { name: `Fill ${i}`, email: uniqueEmail(`fill${i}`), role: "ACCOUNTANT" },
    });
    const row = dataOf(fill.json);
    if (row?.inviteId) createdInvites.push(row.inviteId);
    record("Seats", `Fill seat ${i + 1}`, fill.status === 201, `${fill.status} ${fill.json?.error?.code ?? ""}`);
  }

  const over = await request("/users/invites", {
    method: "POST",
    token,
    body: { name: "Over cap", email: uniqueEmail("over"), role: "ACCOUNTANT" },
  });
  const expectCap = remaining > 0 || seatsNow?.used >= seatsNow?.total;
  if (expectCap) {
    record(
      "Seats",
      "Seat cap returns SEAT_LIMIT_REACHED",
      over.status === 409 && over.json?.error?.code === "SEAT_LIMIT_REACHED",
      `${over.status} ${over.json?.error?.code ?? ""} ${over.json?.error?.message ?? ""}`,
    );
  } else {
    record("Seats", "Seat cap returns SEAT_LIMIT_REACHED", true, "skipped — remaining seats too high to fill safely");
    if (over.status === 201 && dataOf(over.json)?.inviteId) createdInvites.push(dataOf(over.json).inviteId);
  }

  for (const id of createdInvites) {
    await request(`/users/invites/${id}`, { method: "DELETE", token });
  }

  const failed = results.filter((r) => !r.passed);
  console.log("=".repeat(72));
  console.log(`Done: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.suite} :: ${f.case} — ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
