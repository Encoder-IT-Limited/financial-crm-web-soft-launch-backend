#!/usr/bin/env python3
"""
Senior QA — Phase 1 Sales/Invoicing soft-launch regression suite.
Runs against live demo tenant API. Exit 0 only if all critical cases pass.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

BASE = "http://localhost:4001/api/v1"
HOST = "localhost:4001"
TENANT = "demo"
EMAIL = "owner@demo.local"
PASSWORD = "SecurePass123"

COOKIE = ""
TOKEN = ""
CSRF = ""

results: list[dict[str, Any]] = []


@dataclass
class Ctx:
    customer_id: str = ""
    product_id: str = ""
    warehouse_id: str = ""
    terminal_id: str = ""
    session_id: str = ""
    extras: dict[str, Any] = field(default_factory=dict)


def record(suite: str, case: str, passed: bool, detail: str = "", severity: str = "P1"):
    results.append(
        {
            "suite": suite,
            "case": case,
            "passed": passed,
            "detail": detail[:400],
            "severity": severity,
        }
    )
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] [{severity}] {suite} :: {case}" + (f" — {detail[:160]}" if detail and not passed else ""))


def req(
    method: str,
    path: str,
    body: Any = None,
    *,
    auth: bool = True,
    expect_success: Optional[bool] = None,
) -> dict[str, Any]:
    global COOKIE, TOKEN, CSRF
    url = f"{BASE}{path}"
    data = None if body is None else json.dumps(body).encode()
    headers = {
        "Host": HOST,
        "Content-Type": "application/json",
        "X-Tenant-Subdomain": TENANT,
    }
    if COOKIE:
        headers["Cookie"] = COOKIE
    if auth and TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    if CSRF and method.upper() in {"POST", "PATCH", "PUT", "DELETE"} and not (auth and TOKEN):
        headers["X-CSRF-Token"] = CSRF

    r = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            set_cookie = resp.headers.get("Set-Cookie")
            if set_cookie:
                # keep csrf cookie jar simplistic
                parts = set_cookie.split(";")[0]
                if COOKIE:
                    # merge/replace by name
                    name = parts.split("=")[0]
                    jars = [c for c in COOKIE.split("; ") if not c.startswith(name + "=")]
                    jars.append(parts)
                    COOKIE = "; ".join(jars)
                else:
                    COOKIE = parts
            payload = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw) if raw else {"success": False, "error": {"message": str(e)}}
        except json.JSONDecodeError:
            payload = {"success": False, "error": {"message": raw or str(e), "code": f"HTTP_{e.code}"}}
    except Exception as e:
        payload = {"success": False, "error": {"message": str(e), "code": "NETWORK"}}

    if expect_success is True and not payload.get("success"):
        raise AssertionError(payload.get("error") or payload)
    if expect_success is False and payload.get("success"):
        raise AssertionError(f"Expected failure but succeeded: {payload}")
    return payload


def data_of(payload: dict) -> Any:
    return payload.get("data")


def num(v: Any) -> float:
    return float(v)


# ---------------------------------------------------------------------------
# Suites
# ---------------------------------------------------------------------------

def suite_auth(ctx: Ctx):
    global CSRF, TOKEN, COOKIE
    COOKIE = ""
    TOKEN = ""
    CSRF = ""

    p = req("GET", "/auth/csrf", auth=False)
    ok = p.get("success") and data_of(p) and data_of(p).get("csrf")
    if ok:
        CSRF = data_of(p)["csrf"]
    record("Auth", "GET /auth/csrf returns token", bool(ok), str(p.get("error")))

    p = req(
        "POST",
        "/auth/login",
        {"email": EMAIL, "password": PASSWORD},
        auth=False,
        expect_success=None,
    )
    # login may need CSRF — Bearer not yet; with CSRF header
    if not p.get("success"):
        # retry with CSRF header explicitly
        url = f"{BASE}/auth/login"
        body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
        headers = {
            "Host": HOST,
            "Content-Type": "application/json",
            "X-Tenant-Subdomain": TENANT,
            "X-CSRF-Token": CSRF,
            "Cookie": COOKIE,
        }
        r = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            sc = resp.headers.get("Set-Cookie")
            if sc:
                COOKIE = (COOKIE + "; " if COOKIE else "") + sc.split(";")[0]
            p = json.loads(raw)
    tokens = (data_of(p) or {}).get("tokens") or {}
    TOKEN = tokens.get("accessToken") or ""
    record("Auth", "POST /auth/login owner@demo.local", bool(TOKEN), str(p.get("error")))

    p = req("GET", "/me")
    record("Auth", "GET /me authenticated", bool(p.get("success") and data_of(p)), str(p.get("error")))

    # Prove bearer is required: clear both token and cookies
    saved_token, saved_cookie = TOKEN, COOKIE
    TOKEN = ""
    COOKIE = ""
    p = req("GET", "/invoices", auth=False)
    record("Auth", "Unauthenticated invoice list rejected", not p.get("success"), str(p.get("error") or "unexpected success"))
    TOKEN, COOKIE = saved_token, saved_cookie


def suite_fixtures(ctx: Ctx):
    p = req("GET", "/customers")
    customers = data_of(p) or []
    record("Fixtures", "List customers", p.get("success") is True and len(customers) > 0, str(p.get("error")))
    if customers:
        ctx.customer_id = customers[0]["id"]

    # create dedicated QA customer
    code = f"QA-{int(time.time()) % 100000}"
    p = req(
        "POST",
        "/customers",
        {
            "name": "QA Test Customer",
            "email": f"qa-{code.lower()}@example.com",
            "customerCode": code,
            "phone": "01700000000",
            "status": "ACTIVE",
        },
    )
    if p.get("success"):
        ctx.customer_id = data_of(p)["id"]
        record("Fixtures", "Create QA customer", True)
    else:
        # older DTO shape
        p2 = req(
            "POST",
            "/customers",
            {"name": "QA Test Customer", "email": f"qa-{code.lower()}@example.com"},
        )
        ok = p2.get("success")
        if ok:
            ctx.customer_id = data_of(p2)["id"]
        record("Fixtures", "Create QA customer", bool(ok), str((p.get("error") or {}) | (p2.get("error") or {})))

    p = req("GET", "/inventory/warehouses")
    wh = data_of(p) or []
    record("Fixtures", "List warehouses", p.get("success") is True and len(wh) > 0, str(p.get("error")))
    if wh:
        ctx.warehouse_id = wh[0]["id"]

    p = req("GET", "/inventory/products")
    products = data_of(p) or []
    record("Fixtures", "List products", p.get("success") is True and len(products) > 0, str(p.get("error")))
    if products:
        ctx.product_id = products[0]["id"]

    # ensure stock for product
    if ctx.product_id and ctx.warehouse_id:
        p = req(
            "POST",
            "/inventory/stock/receive",
            {
                "productId": ctx.product_id,
                "warehouseId": ctx.warehouse_id,
                "quantity": 50,
                "unitCost": 10,
            },
        )
        record("Fixtures", "Receive stock for QA product", p.get("success") is True, str(p.get("error")))


def suite_invoices(ctx: Ctx):
    # Create draft
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [
                {
                    "productId": ctx.product_id,
                    "description": "QA line product",
                    "quantity": 2,
                    "unitPrice": 100,
                    "discount": 0,
                    "tax": 0,
                },
                {
                    "description": "QA free-text service",
                    "quantity": 1,
                    "unitPrice": 50,
                    "discount": 0,
                    "tax": 0,
                },
            ],
        },
    )
    inv = data_of(p) or {}
    ok = p.get("success") and inv.get("status") == "DRAFT" and num(inv.get("total")) == 250
    record("Invoices", "Create DRAFT invoice (mixed lines)", bool(ok), str(p.get("error") or inv.get("total")))
    inv_id = inv.get("id")
    ctx.extras["invoice_id"] = inv_id
    item_ids = [i["id"] for i in (inv.get("items") or [])]

    # Patch draft
    p = req(
        "PATCH",
        f"/invoices/{inv_id}",
        {
            "items": [
                {
                    "productId": ctx.product_id,
                    "description": "QA line product edited",
                    "quantity": 3,
                    "unitPrice": 100,
                    "discount": 0,
                    "tax": 0,
                }
            ]
        },
    )
    inv = data_of(p) or {}
    record(
        "Invoices",
        "PATCH draft invoice updates totals",
        p.get("success") is True and num(inv.get("total")) == 300,
        str(p.get("error") or inv.get("total")),
    )

    # Send
    p = req("POST", f"/invoices/{inv_id}/send")
    inv = data_of(p) or {}
    record("Invoices", "Send invoice → SENT", p.get("success") is True and inv.get("status") == "SENT", str(p.get("error")))

    # Cannot edit sent
    p = req("PATCH", f"/invoices/{inv_id}", {"dueDate": "2027-01-01"})
    record("Invoices", "PATCH sent invoice rejected", p.get("success") is False, str(p.get("error")))

    # Reminder
    p = req("POST", f"/invoices/{inv_id}/reminders")
    record("Invoices", "Send reminder", p.get("success") is True, str(p.get("error")))

    # Partial payment
    p = req(
        "POST",
        f"/invoices/{inv_id}/payments",
        {"amount": 100, "paymentMethod": "CASH"},
    )
    inv = (data_of(p) or {}).get("invoice") or data_of(p) or {}
    record(
        "Invoices",
        "Partial payment → PARTIALLY_PAID",
        p.get("success") is True and inv.get("status") == "PARTIALLY_PAID",
        str(p.get("error") or inv.get("status")),
    )

    # Remaining payment
    bal = num(inv.get("balanceDue", 200))
    p = req(
        "POST",
        f"/invoices/{inv_id}/payments",
        {"amount": bal, "paymentMethod": "BANK"},
    )
    inv = (data_of(p) or {}).get("invoice") or data_of(p) or {}
    record(
        "Invoices",
        "Full payment → PAID",
        p.get("success") is True and inv.get("status") == "PAID",
        str(p.get("error") or inv.get("status")),
    )

    # Fulfill partial then remainder
    product_item = next((i for i in (inv.get("items") or []) if i.get("productId")), None)
    # re-get invoice for items
    p = req("GET", f"/invoices/{inv_id}")
    inv = data_of(p) or {}
    product_item = next((i for i in (inv.get("items") or []) if i.get("productId")), None)
    if product_item:
        p = req(
            "POST",
            f"/invoices/{inv_id}/fulfill",
            {
                "warehouseId": ctx.warehouse_id,
                "lines": [{"invoiceItemId": product_item["id"], "quantity": 1}],
                "generateDeliveryNote": True,
            },
        )
        d = data_of(p) or {}
        ful = d.get("fulfillment") or {}
        record(
            "Invoices",
            "Partial fulfill + delivery note",
            p.get("success") is True and bool(ful.get("deliveryNoteNumber")),
            str(p.get("error") or ful),
        )
        ctx.extras["fulfillment"] = ful

        p = req(
            "POST",
            f"/invoices/{inv_id}/fulfill",
            {
                "warehouseId": ctx.warehouse_id,
                "lines": [{"invoiceItemId": product_item["id"], "quantity": 2}],
            },
        )
        d = data_of(p) or {}
        inv2 = d.get("invoice") or {}
        record(
            "Invoices",
            "Complete fulfill sets fulfilledAt",
            p.get("success") is True and bool(inv2.get("fulfilledAt")),
            str(p.get("error") or inv2.get("fulfilledAt")),
        )
    else:
        record("Invoices", "Partial fulfill + delivery note", False, "no product item", "P0")

    # List / get
    p = req("GET", "/invoices")
    record("Invoices", "List invoices", p.get("success") is True and isinstance(data_of(p), list), str(p.get("error")))

    # Cancel draft path
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [{"description": "cancel me", "quantity": 1, "unitPrice": 10, "discount": 0, "tax": 0}],
        },
    )
    draft_id = (data_of(p) or {}).get("id")
    p = req("POST", f"/invoices/{draft_id}/cancel")
    record("Invoices", "Cancel DRAFT invoice", p.get("success") is True and (data_of(p) or {}).get("status") == "CANCELLED", str(p.get("error")))


def suite_credit_debit(ctx: Ctx):
    # invoice for credit/debit balance tests
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [{"description": "adj base", "quantity": 1, "unitPrice": 200, "discount": 0, "tax": 0}],
        },
    )
    inv_id = (data_of(p) or {}).get("id")
    req("POST", f"/invoices/{inv_id}/send")
    before = data_of(req("GET", f"/invoices/{inv_id}")) or {}

    p = req(
        "POST",
        "/credit-notes",
        {
            "customerId": ctx.customer_id,
            "invoiceId": inv_id,
            "amount": 40,
            "reason": "QA credit",
            "linkedReturn": False,
        },
    )
    cn = data_of(p) or {}
    after = data_of(req("GET", f"/invoices/{inv_id}")) or {}
    record(
        "Credit/Debit",
        "Credit note reduces balanceDue",
        p.get("success") is True and num(after.get("balanceDue")) == num(before.get("balanceDue")) - 40,
        f"before={before.get('balanceDue')} after={after.get('balanceDue')} err={p.get('error')}",
    )
    cn_id = cn.get("id")

    p = req("POST", f"/credit-notes/{cn_id}/void")
    restored = data_of(req("GET", f"/invoices/{inv_id}")) or {}
    record(
        "Credit/Debit",
        "Void credit restores balanceDue",
        p.get("success") is True and num(restored.get("balanceDue")) == num(before.get("balanceDue")),
        f"restored={restored.get('balanceDue')} expected={before.get('balanceDue')} err={p.get('error')}",
    )

    p = req(
        "POST",
        "/debit-notes",
        {"customerId": ctx.customer_id, "invoiceId": inv_id, "amount": 25, "reason": "QA debit"},
    )
    dn = data_of(p) or {}
    after_dn = data_of(req("GET", f"/invoices/{inv_id}")) or {}
    record(
        "Credit/Debit",
        "Debit note increases balanceDue",
        p.get("success") is True and num(after_dn.get("balanceDue")) == num(before.get("balanceDue")) + 25,
        f"after={after_dn.get('balanceDue')} err={p.get('error')}",
    )
    dn_id = dn.get("id")

    p = req("POST", f"/debit-notes/{dn_id}/void")
    after_void = data_of(req("GET", f"/invoices/{inv_id}")) or {}
    record(
        "Credit/Debit",
        "Void debit restores balanceDue",
        p.get("success") is True and abs(num(after_void.get("balanceDue")) - num(before.get("balanceDue"))) < 0.01,
        f"after={after_void.get('balanceDue')} err={p.get('error')}",
    )

    # Standalone convert
    p = req(
        "POST",
        "/credit-notes",
        {"customerId": ctx.customer_id, "amount": 15, "reason": "standalone CN", "linkedReturn": False},
    )
    scn = data_of(p) or {}
    p = req("POST", f"/credit-notes/{scn.get('id')}/convert")
    inv = data_of(p) or {}
    record(
        "Credit/Debit",
        "Convert standalone credit → negative invoice",
        p.get("success") is True and inv.get("source") == "CREDIT_NOTE" and num(inv.get("total")) < 0,
        str(p.get("error") or inv),
    )

    p = req(
        "POST",
        "/debit-notes",
        {"customerId": ctx.customer_id, "amount": 18, "reason": "standalone DN"},
    )
    sdn = data_of(p) or {}
    p = req("POST", f"/debit-notes/{sdn.get('id')}/convert")
    inv = data_of(p) or {}
    record(
        "Credit/Debit",
        "Convert standalone debit → draft invoice",
        p.get("success") is True and inv.get("source") == "DEBIT_NOTE" and num(inv.get("total")) == 18,
        str(p.get("error") or inv),
    )

    p = req("GET", "/credit-notes")
    record("Credit/Debit", "List credit notes", p.get("success") is True, str(p.get("error")))
    p = req("GET", "/debit-notes")
    record("Credit/Debit", "List debit notes", p.get("success") is True, str(p.get("error")))


def suite_proposals(ctx: Ctx):
    p = req(
        "POST",
        "/proposals",
        {
            "customerId": ctx.customer_id,
            "proposalDate": "2026-08-24",
            "expiryDate": "2026-09-30",
            "items": [{"description": "Consulting", "quantity": 1, "unitPrice": 500, "discount": 0, "tax": 0}],
        },
    )
    prop = data_of(p) or {}
    record("Proposals", "Create DRAFT proposal", p.get("success") is True and prop.get("status") == "DRAFT", str(p.get("error")))
    pid = prop.get("id")

    p = req("POST", f"/proposals/{pid}/send")
    record("Proposals", "Send proposal → SENT", p.get("success") is True and (data_of(p) or {}).get("status") == "SENT", str(p.get("error")))

    p = req("POST", f"/proposals/{pid}/convert")
    inv = data_of(p) or {}
    # convert may return proposal+invoice or invoice
    invoice = inv.get("invoice") if isinstance(inv, dict) and "invoice" in inv else inv
    # get proposal
    prop2 = data_of(req("GET", f"/proposals/{pid}")) or {}
    ok_convert = p.get("success") is True and prop2.get("status") == "ACCEPTED" and bool(prop2.get("convertedInvoiceId"))
    record("Proposals", "Convert SENT → invoice + ACCEPTED", bool(ok_convert), str(p.get("error") or prop2))

    # Convert again should fail
    p = req("POST", f"/proposals/{pid}/convert")
    record("Proposals", "Double convert rejected", p.get("success") is False, str(p.get("error")))

    # Reject path
    p = req(
        "POST",
        "/proposals",
        {
            "customerId": ctx.customer_id,
            "proposalDate": "2026-08-24",
            "expiryDate": "2026-09-30",
            "items": [{"description": "X", "quantity": 1, "unitPrice": 10, "discount": 0, "tax": 0}],
        },
    )
    pid2 = (data_of(p) or {}).get("id")
    req("POST", f"/proposals/{pid2}/send")
    p = req("POST", f"/proposals/{pid2}/reject")
    record("Proposals", "Reject SENT proposal", p.get("success") is True and (data_of(p) or {}).get("status") == "REJECTED", str(p.get("error")))

    p = req("GET", "/proposals")
    record("Proposals", "List proposals", p.get("success") is True, str(p.get("error")))


def suite_retainers(ctx: Ctx):
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 1000,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
            "expiryDate": "2026-12-31",
        },
    )
    ret = data_of(p) or {}
    record("Retainers", "Create retainer", p.get("success") is True and num(ret.get("remainingBalance")) == 1000, str(p.get("error")))
    rid = ret.get("id")
    ctx.extras["retainer_id"] = rid

    # Funding invoice for draw — create + send invoice then draw
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [{"description": "draw target", "quantity": 1, "unitPrice": 300, "discount": 0, "tax": 0}],
        },
    )
    draw_inv = (data_of(p) or {}).get("id")
    req("POST", f"/invoices/{draw_inv}/send")

    p = req("POST", f"/retainers/{rid}/draw", {"invoiceId": draw_inv})
    ret2 = (data_of(p) or {}).get("retainer") or data_of(p) or {}
    # remaining should drop
    record(
        "Retainers",
        "Draw against invoice reduces balance",
        p.get("success") is True and num(ret2.get("remainingBalance", 1000)) < 1000,
        str(p.get("error") or ret2.get("remainingBalance")),
    )

    # Top-up
    p = req("POST", f"/retainers/{rid}/top-up", {"amount": 50, "note": "QA topup", "increaseContractAmount": True})
    record("Retainers", "Top-up retainer", p.get("success") is True, str(p.get("error")))

    # Recurring top-up template
    p = req(
        "POST",
        "/recurring-templates",
        {
            "customerId": ctx.customer_id,
            "frequency": "MONTHLY",
            "startDate": "2026-08-24",
            "amount": 75,
            "description": "QA retainer top-up",
            "autoSend": False,
            "kind": "RETAINER_TOPUP",
            "retainerId": rid,
        },
    )
    tpl = data_of(p) or {}
    record(
        "Retainers",
        "Create RETAINER_TOPUP recurring template",
        p.get("success") is True and tpl.get("kind") == "RETAINER_TOPUP",
        str(p.get("error") or tpl),
    )
    if tpl.get("id"):
        before = data_of(req("GET", f"/retainers/{rid}")) or {}
        p = req("POST", f"/recurring-templates/{tpl['id']}/generate")
        inv = data_of(p) or {}
        after = data_of(req("GET", f"/retainers/{rid}")) or {}
        record(
            "Retainers",
            "Generate top-up → PAID invoice + balance increase",
            p.get("success") is True
            and inv.get("source") == "RETAINER_TOPUP"
            and inv.get("status") == "PAID"
            and num(after.get("remainingBalance")) > num(before.get("remainingBalance")),
            str(p.get("error") or {"inv": inv.get("status"), "bal": after.get("remainingBalance")}),
        )

    # Second retainer for transfer
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 100,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
        },
    )
    rid2 = (data_of(p) or {}).get("id")

    # Roll-over (new retainer)
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 200,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
            "expiryDate": "2026-10-01",
        },
    )
    rid3 = (data_of(p) or {}).get("id")
    p = req("POST", f"/retainers/{rid3}/roll-over", {"expiryDate": "2027-12-31"})
    d = data_of(p) or {}
    record(
        "Retainers",
        "Roll-over creates new retainer + closes source",
        p.get("success") is True and "source" in d and "retainer" in d and (d["source"].get("status") == "CLOSED"),
        str(p.get("error") or list(d.keys())),
    )

    # Transfer
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 80,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
        },
    )
    from_id = (data_of(p) or {}).get("id")
    p = req("POST", f"/retainers/{from_id}/transfer", {"toRetainerId": rid2})
    record("Retainers", "Transfer balance between retainers", p.get("success") is True, str(p.get("error")))

    # Forfeit
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 40,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
        },
    )
    fid = (data_of(p) or {}).get("id")
    p = req("POST", f"/retainers/{fid}/forfeit")
    record("Retainers", "Forfeit retainer", p.get("success") is True and (data_of(p) or {}).get("status") == "CLOSED", str(p.get("error")))

    # Refund
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 60,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
        },
    )
    rfid = (data_of(p) or {}).get("id")
    p = req("POST", f"/retainers/{rfid}/refund", {"reason": "QA refund"})
    d = data_of(p) or {}
    record(
        "Retainers",
        "Refund creates credit note + closes",
        p.get("success") is True and bool(d.get("creditNote")) and (d.get("retainer") or {}).get("status") == "CLOSED",
        str(p.get("error") or d),
    )

    p = req("GET", "/retainers")
    record("Retainers", "List retainers", p.get("success") is True, str(p.get("error")))


def suite_recurring(ctx: Ctx):
    p = req(
        "POST",
        "/recurring-templates",
        {
            "customerId": ctx.customer_id,
            "frequency": "MONTHLY",
            "startDate": "2026-08-24",
            "amount": 120,
            "description": "QA recurring invoice",
            "autoSend": False,
            "kind": "INVOICE",
        },
    )
    tpl = data_of(p) or {}
    record("Recurring", "Create invoice template", p.get("success") is True, str(p.get("error")))
    tid = tpl.get("id")

    p = req("POST", f"/recurring-templates/{tid}/generate")
    inv = data_of(p) or {}
    record(
        "Recurring",
        "Generate creates invoice source=RECURRING",
        p.get("success") is True and inv.get("source") == "RECURRING",
        str(p.get("error") or inv.get("source")),
    )

    p = req("PATCH", f"/recurring-templates/{tid}/status", {"status": "PAUSED"})
    record("Recurring", "Pause template", p.get("success") is True, str(p.get("error")))

    p = req("POST", f"/recurring-templates/{tid}/generate")
    record("Recurring", "Generate while paused rejected", p.get("success") is False, str(p.get("error")))

    p = req("PATCH", f"/recurring-templates/{tid}/status", {"status": "ACTIVE"})
    record("Recurring", "Resume template", p.get("success") is True, str(p.get("error")))

    p = req("GET", "/recurring-templates")
    record("Recurring", "List templates", p.get("success") is True, str(p.get("error")))


def suite_fulfillment_recon(ctx: Ctx):
    p = req("GET", "/fulfillments")
    record("Fulfillment", "List fulfillments", p.get("success") is True and isinstance(data_of(p), list), str(p.get("error")))

    p = req("GET", "/fulfillments/pending-reconciliation")
    record("Fulfillment", "List pending reconciliation", p.get("success") is True, str(p.get("error")))

    # Force pending: create product with no stock? Use huge qty vs available
    # Create invoice with product qty that exceeds stock after we check
    # Simpler: fulfill with allowNegative by draining — receive 0 path
    # Create new product
    sku = f"QA-NEG-{int(time.time()) % 100000}"
    p = req(
        "POST",
        "/inventory/products",
        {
            "name": "QA Zero Stock Product",
            "sku": sku,
            "costPrice": 1,
            "sellingPrice": 5,
            "trackBatch": False,
        },
    )
    prod = data_of(p) or {}
    prod_id = prod.get("id")
    if not prod_id:
        prod_id = ctx.product_id
        record("Fulfillment", "Create zero-stock product (fallback to existing)", True, str(p.get("error")), "P2")
    else:
        record("Fulfillment", "Create zero-stock product", True)

    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [
                {
                    "productId": prod_id,
                    "description": "oversell line",
                    "quantity": 9999,
                    "unitPrice": 1,
                    "discount": 0,
                    "tax": 0,
                }
            ],
        },
    )
    inv_id = (data_of(p) or {}).get("id")
    req("POST", f"/invoices/{inv_id}/send")
    p = req("POST", f"/invoices/{inv_id}/fulfill", {"warehouseId": ctx.warehouse_id})
    d = data_of(p) or {}
    lines = (d.get("fulfillment") or {}).get("lines") or []
    pending = [l for l in lines if l.get("status") == "PENDING_RECONCILIATION"]
    record(
        "Fulfillment",
        "Oversell fulfill → PENDING_RECONCILIATION",
        p.get("success") is True and len(pending) >= 1,
        str(p.get("error") or (lines[0] if lines else None)),
    )
    if pending:
        lid = pending[0]["id"]
        p = req("POST", f"/fulfillments/lines/{lid}/reconcile")
        record(
            "Fulfillment",
            "Reconcile pending line → FULFILLED",
            p.get("success") is True and (data_of(p) or {}).get("status") == "FULFILLED",
            str(p.get("error")),
        )
        p = req("POST", f"/fulfillments/lines/{lid}/reconcile")
        record("Fulfillment", "Re-reconcile rejected", p.get("success") is False, str(p.get("error")))


def suite_pos(ctx: Ctx):
    p = req("GET", "/pos/terminals")
    terminals = data_of(p) or []
    if not terminals:
        p = req(
            "POST",
            "/pos/terminals",
            {"name": "QA Terminal", "code": f"QA-T-{int(time.time())%10000}", "warehouseId": ctx.warehouse_id},
        )
        terminals = [data_of(p)] if p.get("success") else []
        record("POS", "Create terminal", p.get("success") is True, str(p.get("error")))
    else:
        record("POS", "List terminals", True)
    if not terminals:
        record("POS", "Open session", False, "no terminal", "P0")
        return
    ctx.terminal_id = terminals[0]["id"]

    # close any open session first
    sessions = data_of(req("GET", "/pos/sessions?status=OPEN")) or []
    for s in sessions:
        if s.get("terminalId") == ctx.terminal_id:
            req("POST", f"/pos/sessions/{s['id']}/close", {"closingCash": 0})

    p = req("POST", "/pos/sessions", {"terminalId": ctx.terminal_id, "openingCash": 100})
    sess = data_of(p) or {}
    record("POS", "Open session", p.get("success") is True and sess.get("status") == "OPEN", str(p.get("error")))
    ctx.session_id = sess.get("id")

    before_inv_count = len(data_of(req("GET", "/invoices")) or [])
    p = req(
        "POST",
        "/pos/sales",
        {
            "posSessionId": ctx.session_id,
            "customerId": ctx.customer_id,
            "items": [
                {
                    "productId": ctx.product_id,
                    "quantity": 1,
                    "unitPrice": 25,
                    "discount": 0,
                    "tax": 0,
                }
            ],
            "payments": [{"paymentMethod": "CASH", "amount": 25}],
            "isOfflineSync": False,
        },
    )
    sale = data_of(p) or {}
    record("POS", "Create cash sale", p.get("success") is True and bool(sale.get("id")), str(p.get("error")))
    ctx.extras["sale_id"] = sale.get("id")

    time.sleep(0.5)
    after_inv = data_of(req("GET", "/invoices")) or []
    pos_invoices = [i for i in after_inv if i.get("source") == "POS"]
    record(
        "POS",
        "Sale auto-creates POS invoice (source=POS)",
        len(after_inv) >= before_inv_count and len(pos_invoices) >= 1,
        f"pos_invoices={len(pos_invoices)} delta={len(after_inv)-before_inv_count}",
    )

    # Fulfillments from POS_AUTO
    fulf = data_of(req("GET", "/fulfillments")) or []
    pos_ful = [f for f in fulf if f.get("trigger") == "POS_AUTO"]
    record("POS", "Sale auto-fulfill trigger=POS_AUTO", len(pos_ful) >= 1, f"count={len(pos_ful)}")

    p = req("GET", "/pos/sales")
    record("POS", "List sales", p.get("success") is True, str(p.get("error")))

    # Refund
    if sale.get("id"):
        p = req(
            "POST",
            f"/pos/sales/{sale['id']}/refund",
            {
                "items": [
                    {
                        "productId": ctx.product_id,
                        "quantity": 1,
                        "unitPrice": 25,
                        "condition": "SELLABLE",
                    }
                ],
                "reason": "QA refund",
            },
        )
        record("POS", "Refund sale", p.get("success") is True, str(p.get("error")), "P1")

    # Void another sale
    p = req(
        "POST",
        "/pos/sales",
        {
            "posSessionId": ctx.session_id,
            "items": [
                {"productId": ctx.product_id, "quantity": 1, "unitPrice": 15, "discount": 0, "tax": 0}
            ],
            "payments": [{"paymentMethod": "CASH", "amount": 15}],
            "isOfflineSync": False,
        },
    )
    sale2 = data_of(p) or {}
    if sale2.get("id"):
        p = req("POST", f"/pos/sales/{sale2['id']}/void")
        record("POS", "Void completed sale", p.get("success") is True, str(p.get("error")))
    else:
        record("POS", "Void completed sale", False, "could not create second sale", "P2")

    p = req("POST", f"/pos/sessions/{ctx.session_id}/close", {"closingCash": 140})
    record("POS", "Close session", p.get("success") is True, str(p.get("error")))


def suite_tenant_profile(ctx: Ctx):
    p = req("GET", "/me")
    record("Tenant", "GET /me includes tenant", p.get("success") is True, str(p.get("error")))
    p = req(
        "PATCH",
        "/tenant/profile",
        {"legalName": "Demo QA Org", "currency": "BDT"},
    )
    # may use different field names
    if not p.get("success"):
        p = req("PATCH", "/tenant/profile", {"name": "Demo QA Org"})
    record("Tenant", "PATCH /tenant/profile", p.get("success") is True, str(p.get("error")), "P2")


def suite_inventory_procurement(ctx: Ctx):
    p = req("GET", "/inventory/stock")
    record("Inventory", "List stock balances", p.get("success") is True, str(p.get("error")))

    p = req("GET", "/inventory/movements")
    record("Inventory", "List stock movements", p.get("success") is True, str(p.get("error")))

    p = req("GET", "/inventory/batches")
    record("Inventory", "List batches", p.get("success") is True, str(p.get("error")))

    # Product PATCH
    if ctx.product_id:
        p = req("PATCH", f"/inventory/products/{ctx.product_id}", {"minimumStock": 1})
        record("Inventory", "PATCH product minimumStock", p.get("success") is True, str(p.get("error")), "P2")

    # Procurement: suppliers + PO happy path (if available)
    p = req("GET", "/procurement/suppliers")
    suppliers = data_of(p) or []
    record("Procurement", "List suppliers", p.get("success") is True, str(p.get("error")))
    if not suppliers:
        p = req(
            "POST",
            "/procurement/suppliers",
            {"name": "QA Supplier", "supplierCode": f"SUP-QA-{int(time.time())%10000}"},
        )
        if not p.get("success"):
            p = req("POST", "/procurement/suppliers", {"name": "QA Supplier"})
        record("Procurement", "Create supplier", p.get("success") is True, str(p.get("error")), "P2")
        suppliers = [data_of(p)] if p.get("success") else []

    p = req("GET", "/procurement/purchase-orders")
    record("Procurement", "List purchase orders", p.get("success") is True, str(p.get("error")), "P2")

    p = req("GET", "/procurement/purchase-invoices")
    # route may be /bills or /purchase-invoices
    if not p.get("success"):
        p = req("GET", "/procurement/bills")
    record("Procurement", "List purchase invoices/bills", p.get("success") is True, str(p.get("error")), "P2")


def suite_negative_guards(ctx: Ctx):
    p = req("GET", "/invoices/00000000-0000-0000-0000-000000000000")
    record("Guards", "GET missing invoice → error", p.get("success") is False, str(p.get("error")))

    p = req(
        "POST",
        "/invoices",
        {"customerId": ctx.customer_id, "dueDate": "2026-12-31", "items": []},
    )
    record("Guards", "Create invoice with empty items rejected", p.get("success") is False, str(p.get("error")))

    p = req("POST", f"/retainers/{ctx.extras.get('retainer_id', '00000000-0000-0000-0000-000000000000')}/draw", {"invoiceId": "00000000-0000-0000-0000-000000000000"})
    record("Guards", "Draw with bogus invoice rejected", p.get("success") is False, str(p.get("error")))

    # Fulfill draft rejected
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [{"description": "draft fulfill", "quantity": 1, "unitPrice": 1, "discount": 0, "tax": 0, "productId": ctx.product_id}],
        },
    )
    draft_id = (data_of(p) or {}).get("id")
    p = req("POST", f"/invoices/{draft_id}/fulfill", {"warehouseId": ctx.warehouse_id})
    record("Guards", "Fulfill DRAFT invoice rejected", p.get("success") is False, str(p.get("error")))

    # Overdraw retainer
    p = req(
        "POST",
        "/retainers",
        {
            "customerId": ctx.customer_id,
            "contractAmount": 10,
            "billingPeriod": "MONTHLY",
            "billingModel": "ONE_TIME",
            "currency": "BDT",
            "startDate": "2026-08-01",
        },
    )
    small = (data_of(p) or {}).get("id")
    p = req(
        "POST",
        "/invoices",
        {
            "customerId": ctx.customer_id,
            "dueDate": "2026-12-31",
            "items": [{"description": "big", "quantity": 1, "unitPrice": 500, "discount": 0, "tax": 0}],
        },
    )
    big_inv = (data_of(p) or {}).get("id")
    req("POST", f"/invoices/{big_inv}/send")
    p = req("POST", f"/retainers/{small}/draw", {"invoiceId": big_inv})
    # partial draw allowed — remaining should be 0, success true
    ret = (data_of(p) or {}).get("retainer") or data_of(p) or {}
    record(
        "Guards",
        "Oversize draw caps at remaining (no overdraw)",
        p.get("success") is True and num(ret.get("remainingBalance", -1)) == 0,
        str(p.get("error") or ret.get("remainingBalance")),
    )


def main():
    ctx = Ctx()
    suites: list[tuple[str, Callable[[Ctx], None]]] = [
        ("Auth", suite_auth),
        ("Fixtures", suite_fixtures),
        ("Invoices", suite_invoices),
        ("Credit/Debit", suite_credit_debit),
        ("Proposals", suite_proposals),
        ("Retainers", suite_retainers),
        ("Recurring", suite_recurring),
        ("Fulfillment", suite_fulfillment_recon),
        ("POS", suite_pos),
        ("Inventory/Procurement", suite_inventory_procurement),
        ("Tenant", suite_tenant_profile),
        ("Guards", suite_negative_guards),
    ]

    print("=" * 72)
    print("SENIOR QA — Phase 1 Soft Launch Regression")
    print(f"Target: {BASE}  tenant={TENANT}")
    print("=" * 72)

    for name, fn in suites:
        print(f"\n--- Suite: {name} ---")
        try:
            fn(ctx)
        except Exception as e:
            record(name, "SUITE CRASH", False, str(e), "P0")

    passed = sum(1 for r in results if r["passed"])
    failed = [r for r in results if not r["passed"]]
    p0 = [r for r in failed if r["severity"] == "P0"]
    p1 = [r for r in failed if r["severity"] == "P1"]
    p2 = [r for r in failed if r["severity"] == "P2"]

    print("\n" + "=" * 72)
    print(f"SUMMARY: {passed}/{len(results)} passed, {len(failed)} failed")
    print(f"  P0 (blocker): {len(p0)}  P1 (major): {len(p1)}  P2 (minor): {len(p2)}")
    if failed:
        print("\nFAILURES:")
        for r in failed:
            print(f"  - [{r['severity']}] {r['suite']} :: {r['case']}")
            if r["detail"]:
                print(f"      {r['detail']}")
    print("=" * 72)

    # Write machine-readable report
    out = "/tmp/phase1-qa-report.json"
    with open(out, "w") as f:
        json.dump({"passed": passed, "total": len(results), "results": results}, f, indent=2)
    print(f"Report: {out}")

    # Exit non-zero if any P0/P1
    if p0 or p1:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
