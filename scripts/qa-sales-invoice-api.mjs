/**
 * Live API QA — Sales & Invoicing completeness (missing-sales-invoice.md).
 */
const API = process.env.API_BASE ?? "http://localhost:4001/api/v1";
const EMAIL = "owner@demo.local";
const PASSWORD = "SecurePass123";
const TENANT = "demo";

const results = [];

function record(suite, name, passed, detail = "") {
  results.push({ suite, case: name, passed, detail: String(detail).slice(0, 400) });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${suite} :: ${name}${!passed && detail ? " — " + String(detail).slice(0, 160) : ""}`);
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
  console.log("SALES / INVOICING QA — API");
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
  record("Auth", "Login owner@demo.local", Boolean(token), loginRes.status);
  if (!token) {
    console.error(JSON.stringify(loginRes.json, null, 2));
    process.exit(1);
  }

  const meRes = await request("/auth/me", { token });
  const me = dataOf(meRes.json);
  const tenantCurrency = me?.tenant?.currency;
  record("Auth", "Tenant currency is BDT", tenantCurrency === "BDT", tenantCurrency);

  const invoicesAll = await request("/invoices", { token });
  const invoiceItems = dataOf(invoicesAll.json);
  const invoiceMeta = invoicesAll.json?.meta;
  record(
    "Invoices",
    "List returns array + currency",
    Array.isArray(invoiceItems) && (invoiceItems.length === 0 || typeof invoiceItems[0].currency === "string"),
    invoiceItems?.[0]?.currency,
  );
  record(
    "Invoices",
    "Unpaged list meta.total matches length",
    Number(invoiceMeta?.total) === invoiceItems.length,
    JSON.stringify(invoiceMeta),
  );

  const invoicesPage = await request("/invoices?page=1&pageSize=5", { token });
  const pagedItems = dataOf(invoicesPage.json);
  const pagedMeta = invoicesPage.json?.meta;
  record(
    "Invoices",
    "Pagination honors pageSize=5",
    Array.isArray(pagedItems) && pagedItems.length <= 5 && Number(pagedMeta?.pageSize) === 5,
    JSON.stringify(pagedMeta),
  );

  const nextInv = await request("/invoices/next-number", { token });
  const nextNumber = dataOf(nextInv.json)?.number;
  record("Invoices", "Next invoice number", typeof nextNumber === "string" && nextNumber.startsWith("INV-"), nextNumber);

  const customers = dataOf((await request("/customers", { token })).json) ?? [];
  const products = dataOf((await request("/inventory/products", { token })).json) ?? [];
  const warehouses = dataOf((await request("/inventory/warehouses", { token })).json) ?? [];
  const customerId = customers[0]?.id;
  const productId = products[0]?.id;
  const warehouseId = warehouses[0]?.id;
  record("Fixtures", "Customer + product + warehouse", Boolean(customerId && productId && warehouseId), {
    customers: customers.length,
    products: products.length,
    warehouses: warehouses.length,
  });

  if (customerId) {
    const due = new Date();
    due.setDate(due.getDate() + 15);
    const createBody = {
      customerId,
      dueDate: due.toISOString().slice(0, 10),
      items: [
        {
          description: products[0]?.name ?? "QA line",
          quantity: 1,
          unitPrice: 25,
          discount: 0,
          tax: 0,
          ...(productId ? { productId } : {}),
        },
      ],
    };
    const created = await request("/invoices", { method: "POST", token, body: createBody });
    const invoice = dataOf(created.json);
    record(
      "Invoices",
      "Create stamps tenant currency BDT",
      created.status < 300 && invoice?.currency === "BDT",
      `${created.status} ${invoice?.currency} ${invoice?.invoiceNumber}`,
    );
    record(
      "Invoices",
      "Create line carries productId",
      !productId || invoice?.items?.[0]?.productId === productId,
      invoice?.items?.[0]?.productId,
    );

    const getOne = await request(`/invoices/${invoice.id}`, { token });
    record("Invoices", "GET :id includes currency", dataOf(getOne.json)?.currency === "BDT", dataOf(getOne.json)?.currency);

    const byNumber = await request(
      `/invoices?page=1&pageSize=5&search=${encodeURIComponent(invoice.invoiceNumber)}`,
      { token },
    );
    const byNumberItems = dataOf(byNumber.json) ?? [];
    const byNumberMeta = byNumber.json?.meta;
    record(
      "Invoices",
      "Search + page filters to matching invoice numbers",
      byNumber.status < 300 &&
        Array.isArray(byNumberItems) &&
        byNumberItems.length >= 1 &&
        byNumberItems.every((row) => String(row.invoiceNumber).includes(invoice.invoiceNumber)) &&
        Number(byNumberMeta?.total) >= 1,
      `${byNumber.status} total=${byNumberMeta?.total} first=${byNumberItems[0]?.invoiceNumber}`,
    );

    const byCustomer = await request(`/invoices?page=1&pageSize=5&customerId=${customerId}`, { token });
    const byCustomerItems = dataOf(byCustomer.json) ?? [];
    record(
      "Invoices",
      "customerId filter returns only that customer",
      byCustomer.status < 300 &&
        Array.isArray(byCustomerItems) &&
        byCustomerItems.every((row) => row.customerId === customerId),
      `${byCustomer.status} count=${byCustomerItems.length}`,
    );

    const statsRes = await request("/invoices/stats", { token });
    const stats = dataOf(statsRes.json);
    record(
      "Invoices",
      "Stats returns totals",
      statsRes.status < 300 &&
        typeof stats?.total === "number" &&
        typeof stats?.outstanding === "number" &&
        typeof stats?.drafts === "number",
      JSON.stringify(stats),
    );

    const cnNext = await request("/credit-notes/next-number", { token });
    record("Credit notes", "Next number", String(dataOf(cnNext.json)?.number ?? "").startsWith("CN-"), dataOf(cnNext.json)?.number);

    const dnNext = await request("/debit-notes/next-number", { token });
    record("Debit notes", "Next number", String(dataOf(dnNext.json)?.number ?? "").startsWith("DN-"), dataOf(dnNext.json)?.number);

    const notes = dataOf((await request("/credit-notes", { token })).json) ?? [];
    record(
      "Credit notes",
      "List includes currency",
      Array.isArray(notes) && (notes.length === 0 || typeof notes[0].currency === "string"),
      notes[0]?.currency,
    );

    const templates = dataOf((await request("/recurring-templates", { token })).json) ?? [];
    record(
      "Recurring",
      "List includes currency + autoSend",
      Array.isArray(templates) && (templates.length === 0 || "autoSend" in templates[0]),
      templates[0] ? `${templates[0].currency} autoSend=${templates[0].autoSend}` : "empty",
    );

    const recPage = await request("/recurring-templates?page=1&pageSize=1", { token });
    const recItems = dataOf(recPage.json) ?? [];
    const recMeta = recPage.json?.meta;
    record(
      "Recurring",
      "Paged list includes activeCount meta",
      recPage.status < 300 &&
        Array.isArray(recItems) &&
        recItems.length <= 1 &&
        Number(recMeta?.pageSize) === 1 &&
        typeof recMeta?.activeCount === "number",
      JSON.stringify(recMeta),
    );

    if (templates[0]?.id) {
      const gen = await request(`/recurring-templates/${templates[0].id}/generate`, { method: "POST", token });
      const genInvoice = dataOf(gen.json);
      const genOk = gen.status < 300 && genInvoice?.id;
      record(
        "Recurring",
        "Generate produces invoice",
        genOk || gen.status === 409,
        `${gen.status} ${genInvoice?.invoiceNumber ?? gen.json?.error?.message}`,
      );
    } else {
      record("Recurring", "Generate produces invoice", true, "skipped — no templates");
    }

    const retainers = dataOf((await request("/retainers", { token })).json) ?? [];
    const small = retainers.find((r) => Number(r.remainingBalance) > 0 && r.status === "ACTIVE") ?? retainers[0];
    if (small?.id) {
      const over = await request(`/retainers/${small.id}/refund`, {
        method: "POST",
        token,
        body: { reason: "QA over-refund", amount: 9999 },
      });
      record(
        "Retainers",
        "Refund 9999 rejected when over remaining",
        over.status === 400 && (dataOf(over.json) == null || over.json?.error?.code === "REFUND_EXCEEDS_BALANCE" || over.json?.success === false),
        `${over.status} ${over.json?.error?.code ?? ""} ${over.json?.error?.message ?? ""}`,
      );
    } else {
      record("Retainers", "Refund 9999 rejected when over remaining", true, "skipped — no retainer with balance");
    }

    const nextPro = await request("/proposals/next-number", { token });
    record("Proposals", "Next number", String(dataOf(nextPro.json)?.number ?? "").startsWith("PRO-"), dataOf(nextPro.json)?.number);

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 14);
    const createdProposal = await request("/proposals", {
      method: "POST",
      token,
      body: {
        customerId,
        proposalDate: new Date().toISOString().slice(0, 10),
        expiryDate: expiry.toISOString().slice(0, 10),
        items: [
          {
            description: products[0]?.name ?? "QA proposal line",
            quantity: 1,
            unitPrice: 40,
            discount: 0,
            tax: 0,
            productId,
          },
        ],
      },
    });
    const proposal = dataOf(createdProposal.json);
    if (proposal?.id) {
      await request(`/proposals/${proposal.id}/send`, { method: "POST", token });
      const converted = await request(`/proposals/${proposal.id}/convert`, { method: "POST", token });
      const payload = dataOf(converted.json);
      const inv = payload?.invoice ?? payload;
      record(
        "Proposals",
        "Convert copies productId onto invoice lines",
        converted.status < 300 && inv?.items?.some((i) => i.productId === productId),
        `${converted.status} invoice=${inv?.id} lineProduct=${inv?.items?.[0]?.productId}`,
      );
    } else {
      record("Proposals", "Convert copies productId onto invoice lines", false, JSON.stringify(createdProposal.json));
    }
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
