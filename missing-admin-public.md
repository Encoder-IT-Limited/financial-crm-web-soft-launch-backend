# Admin Portal & Public Site — All Issues

Everything found for the Super Admin portal (`src/app/(admin)/`) and the public
marketing/auth site (`src/app/(public)/`) in one place — UI and API issues
together, since both surfaces are operated by MRM (not tenant-facing) and are
worked on together. Tenant-portal issues stay in `docs/bugs-report.md` and the
per-module `missing-*.md` docs.

All five admin modules (Tenants, Plans, Payments, Settings, Audit Log) call the
real backend (`apiGet`/`apiSend`) — none run on mock data at runtime.

---

## Admin ↔ Public — content that should sync, but doesn't, at all

Checked every field in Admin → Settings against every place the public site
could plausibly read it. **None of it connects, regardless of whether the
admin-side field is backed by a real API or not** — the public site never
calls any settings API; every public page listed below imports the static
constant `src/config/platform-settings.ts` directly at build/request time.

- **Platform name, logo, tagline.** `public-navbar.tsx` and `public-footer.tsx`
  both read `PLATFORM_SETTINGS.general.{platformName,logoUrl,tagline}`
  straight from the static file. Of these three, `platformName` genuinely is
  saved to a real backend today (`settingsApi.updateGeneral()`) — an admin
  changing it in Settings sees a success toast, but the public navbar/footer
  keep showing the old hardcoded name forever, because they never read the
  API result at all.
- **Contact email.** `contact/page.tsx` reads
  `PLATFORM_SETTINGS.general.contactEmail` from the static file. Same story:
  editing it in Settings does nothing to what a visitor sees on `/contact`.
- **Maintenance mode — the most significant gap.** `maintenanceEnabled`/
  `maintenanceMessage` exist only inside the admin module (`settings.service.ts`,
  `general-settings-tab.tsx`, `schemas.ts`, `types.ts`) — grepped the entire
  `src/app/(public)/` tree and root layout/middleware: **zero references**.
  Toggling "Maintenance Mode" on in Admin Settings is the one General field
  that genuinely persists to a real backend end-to-end, and it still does
  nothing — there's no gate, banner, or check anywhere on the public site
  that would ever put it into maintenance mode. The feature is a complete
  no-op from the visitor's perspective no matter what the admin does.
- **Privacy/Terms body + "last updated" date.** `privacy/page.tsx` and
  `terms/page.tsx` render `PLATFORM_SETTINGS.legal.{privacyBody,termsBody,
privacyLastUpdated,termsLastUpdated}` from the static file — and per the
  Admin — Settings section below, the Legal tab doesn't even persist to a
  backend yet, so there's a double disconnect here: nothing to save, and
  nowhere for it to go even if it did.
- **Social links.** `PLATFORM_SETTINGS.socialLinks` is deliberately not
  rendered anywhere on the public site yet (own code comment: cut per a
  2026-08-19 decision, "nothing in the proposal or prototype calls for
  them") — the one item on this list that's an intentional, documented
  decision rather than an oversight.
- **Plans (partial exception — worth noting here too).** Unlike Settings,
  Admin → Plans is genuinely connected to the public Pricing page for the
  main calculator (`pricing-calculator.tsx` uses `usePublicPlans()`, real
  data). But two components on the same page don't: `comparison-table.tsx`
  and `tier-card.tsx`'s sales-assisted check both use the static mock
  `plans-data.ts` instead — see "Public — Pricing" below for detail. Same
  class of bug as everything above (a public page not reading the same data
  admin manages), just partial instead of total.

**Root cause, stated plainly**: `src/config/platform-settings.ts`'s own
comment says it directly — "TEMPORARY: no backend/settingsService yet...
Editing it here is the only way to change site copy until a real settings
API exists." That comment predates Settings' `get()`/`updateGeneral()` being
wired to a real backend for 3 of 6 General fields — the public side of this
was never updated to match. **Fix, once prioritized**: the public
navbar/footer/contact/legal pages need to fetch the same settings data the
admin API now serves (a public, unauthenticated `GET /settings` or
equivalent) instead of importing the static constant — and a maintenance-mode
check needs to exist somewhere in the public route group's layout/middleware
for the toggle to mean anything.

---

## Admin — Tenants

- **[P1] Setting a tenant to "Cancelled" silently does nothing.**
  `tenant-edit-dialog.tsx:172` offers "Cancelled" as a selectable status, but
  `tenants.service.ts`'s `update()` (lines 108–114) has no branch for it — no
  endpoint is ever called. Saving still fires the `PATCH` for other fields and
  shows a success toast, so the admin believes it worked when nothing
  happened. Fix: wire a real cancel endpoint/call, or remove "Cancelled" from
  the options until the backend supports it.
- **[P1] Lowering a tenant's extra seat count silently does nothing.**
  `update()` (lines 104–106) only calls `addSeats` when the count increases —
  there's no "remove seats" call for a decrease. Save succeeds with a toast;
  the backend seat count is unchanged. Fix: add a remove-seats endpoint/call,
  or reject the lower value with a clear message.
- **[P2] Delete confirmation copy says "permanent" and "cannot be undone" —
  it isn't.** `tenants-list.tsx:211-213`'s confirmation text claims a
  permanent, irreversible delete, but `tenantsApi.delete()`
  (`tenants.service.ts:117-119`) calls `POST /admin/tenants/:id/pending-deletion`
  — a reversible soft-delete with a 60-day retention window and an existing
  reactivate flow (`tenant-details-dialog.tsx`). Fix: reword the confirmation
  to match reality.
- **[P2] `tenant-edit-dialog.tsx` and `add-seats-dialog.tsx` swallow save
  errors silently.** Both call the API with `.then()`/`.finally()` and no
  `.catch()` — a failed save just stops the loading state with zero feedback.
  Contrast `src/components/shared/confirm-dialog.tsx:53-57`, which already
  handles this correctly. Fix: add matching `.catch()` blocks.
- **No create-tenant endpoint/action.** No `tenantsApi.create()` exists, and
  no "New tenant" button anywhere in the module — may be intentional if
  tenants only originate from public signup, worth confirming rather than
  assuming.
- **Dead code.** `modules/tenants/mock/seed.ts` and `modules/audit/mock/seed.ts`
  are no longer imported by anything — leftovers from before the real API was
  wired up.

## Admin — Plans

- **[P3] Hardcoded "(AED)" in price field labels.** `plan-form-dialog.tsx:124,134`
  — labels are literally `"Monthly price (AED)"` / `"Yearly price (AED)"`,
  baked into the text itself. Fix: pull from the platform's actual currency
  setting instead of a literal string.
- **[P2] `plan-form-dialog.tsx` swallows save errors silently.** Same
  no-`.catch()` pattern as the Tenants dialogs above (`handleSubmit`, lines
  78-91).
- Otherwise fully real CRUD (`create`/`update`/`list`), no other gaps found.

## Admin — Payments

- **[P2] Stale "coming soon" invoice-download copy, and no endpoint to back
  it.** `payment-details-dialog.tsx` and `payments-list.tsx`'s `handleDownload()`
  both still show `toast.info("... invoice download will be available once
the billing backend is connected")`. Confirmed: `payments.service.ts` only
  implements `list()` and `updateStatus()` — no invoice/receipt endpoint
  exists at all yet. Also no `get(id)` (the details dialog re-derives a
  single payment from the already-fetched list instead of fetching it
  directly), and no refund endpoint/action anywhere. Fix: implement the
  endpoint(s) and wire `handleDownload`/refund to them, or reword the copy if
  genuinely not planned soon.
- **[P2] `payment-details-dialog.tsx`'s `handleStatusChange` swallows errors
  silently.** Same no-`.catch()` pattern as above (lines 44-48).
- **[P3] Stale mock-only comment left in `payments/types.ts`.** File header
  (lines 2-5) still says "Frontend-only mock... Read-only: invoice/receipt
  generation and any refund action come from the backend later, not built
  here" — but the service now calls the real API. Fix: update/remove the
  comment.

## Admin — Settings

- **Legal tab (`privacyBody`/`termsBody`) has no persistence at all.**
  `settingsApi` only implements `get()` and `updateGeneral()` — no endpoint
  for Legal or Social Links content exists. Edits in `LegalTab` only mutate
  local state and are lost on reload. Self-disclosed via a toast description
  in `settings-tabs.tsx:72`, but still a real gap.
- **Social Links tab (`linkedin`/`twitter`/`instagram`) has the same gap.**
- **`updateGeneral()` drops three fields silently.** Only sends
  `platformName`, `maintenanceMode`, `maintenanceMessage`. `tagline`,
  `logoUrl`, and `contactEmail` are editable in `general-settings-tab.tsx`
  (including a logo upload control) but are never sent or read back —
  `mergeSettings()` always falls back to a local constant for these three, so
  edits appear to save (no error) but silently revert on next load.

## Admin — Audit Log

- **[P2] No pagination anywhere — frontend or backend.** `audit-log-list.tsx`
  doesn't use the shared `FilterableTable` like every other admin list page —
  it's a hand-rolled `Card` + `.map()` (lines 128-134) rendering the entire
  result set. `audit.service.ts`'s `list()` takes no page/limit/offset
  params either, and there's no server-side page size — the backend contract
  has no pagination to wire up even if the frontend added it. Audit Log is
  platform-wide activity across every tenant, the module most likely to grow
  large. Fix: needs both backend pagination support and a switch to
  `FilterableTable` (or equivalent) on the frontend.

## Admin — Shared / Cross-module

- **[P1] Two case-different copies of the admin sidebar component.**
  `src/app/(admin)/components/AdminSidebar.tsx` and `admin-sidebar.tsx` both
  exist — same component, two files, differing only in casing (a merge
  artifact). Works by accident on case-insensitive filesystems (Windows/macOS)
  but breaks on case-sensitive deploy targets (Linux/most CI). Fix: `grep -rn
"AdminSidebar\|admin-sidebar" src` to see which one is actually imported,
  delete the other — `admin-sidebar.tsx` is the correct casing per this
  project's kebab-case rule (AGENTS.md §8).
- **No dashboard/metrics summary endpoint.** `admin/page.tsx` fetches the
  full `tenants`, `plans`, `audit`, and `payments` lists client-side just to
  compute a handful of KPIs (`kpi-row.tsx`, `metrics.ts`). Not a problem at
  current data volumes, but a scalability gap once tenant/audit counts grow —
  a dedicated summary endpoint would avoid pulling full lists for a few
  numbers.

---

## Public — Auth Flows

- **OTP is never actually verified.** `verify-otp/verify-otp-form.tsx`'s
  `handleSubmit` only runs local schema validation (`z.string().length(6)`)
  and `router.push`es straight to `/reset-password?...&otp=...` — no API call
  is made on this screen at all. Any syntactically-valid 6-digit string
  passes. `src/lib/auth/auth.service.ts` has no `verifyOtp` endpoint defined
  — verification (if it happens) is deferred silently to
  `POST /auth/reset-password` on the next page. Needs a real verify-OTP
  endpoint and call here, or confirmation this deferral is intentional.
- **[P1, from earlier QA report] User is automatically logged out after
  5–10 minutes** — see BUG_07 below. No session-expiry/token-refresh logic
  exists anywhere in this codebase; likely the tested ngrok tunnel dropping,
  not an app bug — needs re-testing against a stable URL.
- Login, forgot-password, and reset-password are all confirmed genuinely
  wired to real endpoints — no mock/fake success paths in these three.

## Public — Signup

- **Plan-selection step can send an invalid `planId` to the real
  tenant-creation endpoint.** `signup/plan-step.tsx` imports `PLANS` from the
  static mock `components/plans-data.ts` (ids: `"starter"`, `"growth"`,
  `"enterprise"`) when a user reaches signup without a `?plan=` query param.
  That mock `plan.id` is sent as `planId` in the real `POST /auth/signup`
  payload. Unless the real backend has plans seeded with exactly these
  literal ids, this sends an invalid `planId` to a real, tenant-creating
  endpoint. Needs verification against actual backend plan ids — likely needs
  `plan-step.tsx` switched to the same live `usePublicPlans()` data
  `signup-flow.tsx` already uses elsewhere.
- **No payment gateway integration at all.** `payment-step.tsx` collects
  card details with client-side-only validation; `signup-flow.tsx`'s
  `handlePaymentSubmit` does an artificial delay then calls the real signup
  API — card details are never sent anywhere (self-documented in-code: "Card
  details aren't sent anywhere real yet"). Account creation itself is real;
  only payment capture is missing. Since users are told "you won't be charged
  yet," this may be intentional for now, but there's currently no way to ever
  charge a signed-up tenant without a separate flow.
- **[P3] Signup flow sets state during render, not in an effect.**
  `signup-flow.tsx:58` — `if (!plan && preselectedPlan) setPlan(preselectedPlan);`
  runs unconditionally every render, not inside `useEffect`. Harmless today
  (no-op after first render) but could cause an extra render or subtle bugs
  once the real plans query refetches with fresh object references. Fix:
  move into a `useEffect` keyed on `preselectedPlan`.

## Public — Pricing

- **[P2, from earlier QA report] Compare Plans table doesn't display all
  plans on mobile** — see BUG_02 below.
- **Comparison table uses static mock data, not live plans — separate root
  cause from BUG_02.** `pricing/components/comparison-table.tsx` imports the
  static `PLANS` directly, unlike `pricing-calculator.tsx` on the same page,
  which uses live data (`usePublicPlans()`) with a fallback. The "Compare
  plans" section shows hardcoded Starter/Growth/Enterprise data even when the
  real backend plans (fetched successfully elsewhere on the same page)
  differ — two data sources disagreeing on one page.
- **`TierCard` hardcodes a literal mock plan id to decide sales-assisted
  routing.** `tier-card.tsx`: `const isSalesAssisted = plan.id === "enterprise"`.
  Once real backend plans load (their ids won't be the literal string
  `"enterprise"`), this check silently fails — the tier meant to route to
  `/contact` (sales-assisted) instead shows "Choose {name}" linking to
  self-serve signup.
- **Currency hardcoded to AED in four places** (`tier-card.tsx`,
  `payment-step.tsx`, `plan-select-card.tsx`, `comparison-table.tsx`) rather
  than coming from `Plan`/backend data — `Plan` (`src/types/plan.ts`) has no
  currency field at all, so multi-currency would need each call site touched
  individually.
- **[P3, from earlier QA report] Seat-count input doesn't select-on-focus**
  — see BUG_03 below.
- **[from earlier QA report] Page scrolling stops after selecting a plan**
  — see BUG_08 below (not yet code-verified).
- **Per-plan seat-range clamping is completely gone — a real regression, not
  a leftover of the live-API switch.** Confirmed by diffing against
  `dev-nafis-v0.1` (the pure-UI reference branch): `Plan` used to have
  `minSeats`/`maxSeats` (e.g. Starter 3–10, Growth 10–30, Enterprise 30+
  unlimited), and `pricing-utils.ts` had a `clampSeatsForPlan()` function
  that capped each card's shown price to its own supported range — moving
  the shared seat stepper to, say, 500 still priced Starter at its own max
  (10) instead of extrapolating past what the plan is actually sold for,
  with an explanatory note on the card ("Priced for {N} seats — this plan's
  minimum/maximum"). The global stepper's floor (`MIN_SEATS`) was also
  computed dynamically as the lowest minimum any plan supports.

  Today: `minSeats`/`maxSeats` are gone from the `Plan` type entirely (not
  just unused — removed from the type and from the static mock data
  `plans-data.ts` too, so this wasn't only lost in the live-API path).
  `clampSeatsForPlan()` no longer exists in `pricing-utils.ts`. `tier-card.tsx`
  computes `total` straight from the raw, unclamped seat count, and
  `MIN_SEATS` is hardcoded to `1`. Right now a visitor can price any plan —
  including Starter — at a seat count far outside what it's actually sold
  for, with a likely-nonsensical extrapolated price and no messaging that
  the plan doesn't really support that size. Fix: reintroduce `minSeats`/
  `maxSeats` on `Plan` (both mock and real API shape), restore
  `clampSeatsForPlan()`, and wire the explanatory note back into `tier-card.tsx`.

## Public — Contact

- **No backend at all.** `contact/contact-form.tsx`'s `handleSubmit`
  explicitly simulates success (`setTimeout` delay), commented `// TEMPORARY:
no backend/contact service yet`. The form always shows "Message sent"
  regardless of whether anything was recorded.

## Public — Legal

- **[P1] `/privacy` and `/terms` render live, real placeholder copy.**
  `src/config/platform-settings.ts:19-49` — explicitly placeholder text:
  "This is a placeholder Privacy Policy... the final text will be reviewed
  and provided by legal before launch," with "Draft — not yet published" as
  the "Last updated" date. Self-aware placeholder, but live on a legally
  significant public page — a launch-blocker if it ships unnoticed.

---
