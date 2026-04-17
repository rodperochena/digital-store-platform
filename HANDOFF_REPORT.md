# HANDOFF_REPORT.md

**Audit date:** 2026-04-16  
**Auditor:** Forensic pass via full source code read + selective command execution  
**Branch at time of audit:** `checkpoint-3-tests-ci`  
**Repo root:** `/Users/rodrigoperochena/Documents/GitHub/digital-store-platform`

---

## 0. Quick State Summary

This is a multi-tenant digital-products SaaS (Gumroad/Lemonsqueezy-style) in active development, built with Node.js/Express + vanilla React. The backend is substantially complete for core flows (store creation, product management, Stripe checkout, digital delivery, buyer auth, owner auth, analytics). The frontend has a large number of owner-dashboard pages and a buyer-facing storefront. The majority of this work exists **uncommitted** — approximately 160 files are modified or untracked, representing everything built since commit `fee1623`. If the repo were wiped to the last commit, most of the feature surface would vanish.

---

## 1. Real Tech Stack

[VERIFIED — from `backend/package.json`, `frontend/package.json`, `.nvmrc`, migration files, source code]

| Layer | Technology | Evidence |
|---|---|---|
| Node version | 20.20.0 | `.nvmrc:1` |
| Backend runtime | Node.js + Express 4.22.1 | `backend/package.json:dependencies.express` |
| Frontend framework | React 18.3.1 + Vite 5.4.8 | `frontend/package.json:dependencies.react`, `devDependencies.vite` |
| Router (frontend) | React Router DOM 6.26.2 | `frontend/package.json:dependencies.react-router-dom` |
| Database | PostgreSQL (raw SQL, no ORM) | `backend/package.json:dependencies.pg@^8.18.0`; all queries use `pool.query()` |
| ORM/Query layer | **None — raw SQL via `node-postgres` (pg)** | Every `*.queries.js` file writes SQL directly |
| Owner auth | Custom: scrypt + server-side session tokens | `backend/src/lib/ownerAuth.js`; `backend/src/db/queries/owner.queries.js` |
| Buyer auth | Custom: scrypt + server-side session tokens (identical pattern) | `backend/src/lib/buyerAuth.js`; migration `028_buyer_accounts.sql` |
| Admin auth | Static `ADMIN_KEY` header (`x-admin-key`), timing-safe compare | `backend/src/middleware/admin.middleware.js` |
| Payment provider | Stripe (test-mode keys in .env.example, `stripe@^21.0.1`) | `backend/package.json`; `backend/src/lib/stripe.js`; `.env.example` |
| File storage | Supabase Storage (optional — server starts without it) | `backend/src/lib/storage.js`; `backend/src/app.js:ensureBucketsExist()` |
| Email | `log` (console) by default; `resend` HTTP integration optional | `backend/src/lib/mailer.js`; `MAILER_PROVIDER` env var |
| Deployment target | Not configured. No `Dockerfile`, no `docker-compose`, no Railway/Fly/Vercel config. | Directory listing — none of these files exist |
| Package manager | npm (backend: `backend/package-lock.json`; frontend: `frontend/package-lock.json`) | Both lockfiles present, no `pnpm-lock.yaml` or `yarn.lock` |
| TypeScript | **No.** Project is 100% JavaScript. | No `tsconfig.json` found anywhere in repo |
| Styling | CSS Modules | `frontend/src/pages/*.module.css` pattern throughout |
| Forms | Manual (`useState` + `onSubmit`) | All frontend form files read — no Formik, React Hook Form |
| Data fetching | Native `fetch()` | All `frontend/src/api/*.js` files; no Axios, TanStack Query, SWR |

---

## 2. Repo Structure

[VERIFIED — from full directory listing]

```
digital-store-platform/
├── .github/
│   └── workflows/
│       └── ci.yml              ← Backend-only CI (GitHub Actions, Postgres service)
├── .gitignore                  ← Ignores .env, .env.*, node_modules, backend/docs/
├── .nvmrc                      ← Node 20.20.0
├── HANDOFF_REPORT.md           ← This file (untracked, not in git history)
├── README.md                   ← Minimal; local dev instructions only
├── package-lock.json           ← Root-level lockfile (no root package.json — ORPHAN)
├── backend/
│   ├── .env                    ← EXISTS ON DISK (see §11 — potentially committed)
│   ├── .env.example            ← 34 env var names documented
│   ├── docs/                   ← Four large .txt dump files (gitignored)
│   ├── jest.config.js
│   ├── migrations/
│   │   ├── down/001–031        ← 31 down migrations
│   │   └── up/001–031          ← 31 up migrations
│   ├── package.json
│   ├── package-lock.json
│   ├── scripts/
│   │   ├── migrate.js
│   │   ├── routes_inventory.sh
│   │   ├── smoke.sh
│   │   └── ultra.sh
│   ├── server.js               ← Entry point (dotenv + startServer())
│   ├── src/
│   │   ├── app.js              ← Express app assembly
│   │   ├── config/
│   │   │   └── tenancy.constants.js
│   │   ├── db/
│   │   │   ├── ping.js
│   │   │   ├── pool.js
│   │   │   └── queries/        ← 20 query files (analytics, blog, buyer, campaigns,
│   │   │                           customers, dashboard, discounts, domains, fulfillment,
│   │   │                           notifications, orders, owner, pageviews, products,
│   │   │                           reviews, sales, stats, storefront, stores, subscribers,
│   │   │                           taxonomy)
│   │   ├── lib/
│   │   │   ├── buyerAuth.js
│   │   │   ├── campaignSender.js
│   │   │   ├── dnsVerifier.js
│   │   │   ├── fulfillment.js
│   │   │   ├── mailer.js
│   │   │   ├── ownerAuth.js
│   │   │   ├── storage.js
│   │   │   └── stripe.js
│   │   ├── middleware/         ← 10 middleware files (see §3.2)
│   │   └── routes/             ← 16 route files (see §3.1)
│   └── tests/                  ← 10 test files (see §9)
└── frontend/
    ├── .env                    ← EXISTS ON DISK (see §11)
    ├── .env.development        ← VITE_API_BASE='' (intentional for Vite proxy)
    ├── .env.example
    ├── .gitignore
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── vite.config.js.timestamp-*.mjs   ← 4 stale Vite cache files (not gitignored)
    └── src/
        ├── App.jsx             ← All route definitions
        ├── api/                ← 8 API client modules
        ├── components/         ← Alert, CartDrawer, CopyButton, SimpleChart, Spinner, WorldMap
        ├── context/            ← AppContext, BuyerContext, CartContext, OwnerContext
        ├── layout/             ← AdminLayout (dead?), OwnerLayout
        ├── main.jsx
        ├── pages/
        │   ├── buyer/          ← 5 pages: Login, Register, Dashboard, ForgotPassword, ResetPassword
        │   ├── owner/          ← 24 pages covering full dashboard
        │   ├── CheckoutPage.jsx, CheckoutSuccess.jsx
        │   ├── Connect.jsx     ← LEGACY admin tool (connects by store ID)
        │   ├── GetStarted.jsx  ← Owner onboarding (provision + claim-access flow)
        │   ├── OrdersPage.jsx  ← LEGACY admin page
        │   ├── ProductPage.jsx, ProductDetail.jsx  ← Two separate components on same route pattern
        │   ├── ProductsPage.jsx ← LEGACY admin page
        │   ├── ReviewSubmit.jsx
        │   ├── SimulatePurchase.module.css  ← ORPHAN: .jsx deleted, .css remains
        │   ├── StorePage.jsx   ← LEGACY admin page
        │   └── Storefront.jsx
        ├── styles/global.css
        └── utils/time.js
```

**Structural issues:**
- Root `package-lock.json` with no root `package.json` — orphan, should be deleted.
- `frontend/src/pages/SimulatePurchase.module.css` — orphan CSS file, no `.jsx` counterpart.
- `frontend/src/App.jsx` imports `DashboardLegacy` for `/owner/dashboard`; `Dashboard.jsx` exists but is not routed anywhere. [VERIFIED: `App.jsx` line with `import OwnerDashboard from "./pages/owner/DashboardLegacy"`]
- Legacy admin routes (`/`, `/store/:storeId`, `/orders`) still mounted in `App.jsx` alongside the new owner dashboard. Two incompatible UI paradigms coexist.
- `frontend/src/layout/AdminLayout.jsx` exists; unclear if it serves the legacy routes or is also dead.

---

## 3. Backend

### 3.1 Routes / Endpoints

[VERIFIED — from full read of `backend/src/routes/index.js` and all route files]

**Legend:** Auth = required auth type; Scoped = filtered by tenant in query

#### Health

| Method | Path | File | What it does | Auth | Scoped |
|---|---|---|---|---|---|
| GET | `/api/health` | `health.routes.js` | DB ping, returns `{status:"ok"}` or 503 | None | No |

#### Stores (Admin-key protected)

| Method | Path | What it does | Auth | Scoped |
|---|---|---|---|---|
| POST | `/api/stores` | Create new store (name, slug, currency) | `x-admin-key` | No |
| PATCH | `/api/stores/:id/enable` | Set `is_enabled = true` | `x-admin-key` | By store ID |
| GET | `/api/stores/:id/settings` | Get store settings row | `x-admin-key` | By store ID |
| PATCH | `/api/stores/:id/settings` | Update store settings | `x-admin-key` | By store ID |

#### Products (Admin-key protected — separate from owner product management)

| Method | Path | What it does | Auth | Scoped |
|---|---|---|---|---|
| POST | `/api/stores/:storeId/products` | Create product | `x-admin-key` | By storeId param |
| GET | `/api/stores/:storeId/products` | List products | `x-admin-key` | By storeId param |

#### Public Orders / Checkout (legacy path — rate-limited, no auth)

| Method | Path | What it does |
|---|---|---|
| POST | `/api/stores/:storeId/orders` | Create pending order (no Stripe) |
| POST | `/api/store/:slug/orders` | Same via slug |
| POST | `/api/storefront/orders` | Same via Host header tenant |

#### Stripe Routes

| Method | Path | File:Line | What it does | Auth | Scoped |
|---|---|---|---|---|---|
| POST | `/api/store/:slug/checkout/session` | `stripe.routes.js:80` | Create Stripe Checkout session, create pending order | Rate-limited | By slug |
| POST | `/api/store/:slug/validate-discount` | `stripe.routes.js:259` | Validate discount code without creating order | Rate-limited | By slug |
| POST | `/api/webhook/stripe` | `stripe.routes.js:302` | Stripe webhook handler (raw body, signature-verified) | Stripe sig | By session metadata |

#### Delivery

| Method | Path | File:Line | What it does | Auth | Scoped |
|---|---|---|---|---|---|
| GET | `/api/deliver/:token` | `delivery.routes.js:34` | Hash token → fulfillment lookup → 302 redirect to file | None (token is auth) | By fulfillment |

#### Tracking

| Method | Path | What it does | Auth |
|---|---|---|---|
| GET | `/api/track/open/:token` | 1×1 GIF response + async DB update for email open tracking | None |

#### Storefront (public, rate-limited)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/store/:subdomain/meta` | Store metadata |
| GET | `/api/store/:subdomain/products` | Public product list (delivery_url excluded) |
| GET | `/api/store/:subdomain/products/:productId` | Single public product |
| GET | `/api/store/:subdomain/active-sale` | Current active sale |
| GET | `/api/store/:subdomain/blog` | Published blog posts |
| GET | `/api/store/:subdomain/blog/:slug` | Single blog post |
| POST | `/api/store/:subdomain/track` | Record page view |
| POST | `/api/store/:subdomain/subscribe` | Subscribe to mailing list |
| GET | `/api/store/:subdomain/check-email-optin` | Check subscription status |
| GET | `/api/review/:token` | Get review form data |
| POST | `/api/review/:token` | Submit product review |
| GET | `/api/unsubscribe/:token` | Unsubscribe form |
| POST | `/api/unsubscribe/:token` | Confirm unsubscribe |

#### Storefront via Host header (for custom domains)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/storefront/meta` | Store meta via Host header |
| GET | `/api/storefront/products` | Product list via Host header |
| GET | `/api/storefront/products/:productId` | Single product via Host header |

#### Owner Routes (all at `/api/owner/*`, owner session required unless noted)

| Method | Path | What it does | Auth |
|---|---|---|---|
| POST | `/api/owner/claim-access` | First-time setup: bootstrap token + new password | None (bootstrap token) |
| POST | `/api/owner/login` | Password login, returns session token | None |
| POST | `/api/owner/logout` | Revoke session | Owner session |
| GET | `/api/owner/session` | Validate session + return store/account | Owner session |
| GET | `/api/owner/store` | Get store settings | Owner session |
| PATCH | `/api/owner/store` | Update store settings | Owner session |
| GET | `/api/owner/products` | List products with stats | Owner session |
| POST | `/api/owner/products` | Create product | Owner session |
| GET | `/api/owner/products/:id` | Get product | Owner session |
| PATCH | `/api/owner/products/:id` | Update product | Owner session |
| DELETE | `/api/owner/products/:id` | Delete/deactivate product | Owner session |
| POST | `/api/owner/products/:id/duplicate` | Duplicate product | Owner session |
| POST | `/api/owner/products/reorder` | Reorder products | Owner session |
| POST | `/api/owner/products/bulk-update` | Bulk update fields | Owner session |
| POST | `/api/owner/products/bulk-delete` | Bulk delete | Owner session |
| POST | `/api/owner/upload/deliverable` | Upload file to Supabase Storage | Owner session |
| POST | `/api/owner/upload/product-image` | Upload product image | Owner session |
| GET | `/api/owner/orders` | List orders (enriched) | Owner session |
| GET | `/api/owner/orders/:id` | Order detail with items + fulfillment | Owner session |
| POST | `/api/owner/orders/:id/resend-delivery` | Re-send delivery email | Owner session |
| GET | `/api/owner/stats` | Quick revenue/order stats | Owner session |
| GET | `/api/owner/dashboard` | Full dashboard data | Owner session |
| GET | `/api/owner/notifications` | List notifications | Owner session |
| GET | `/api/owner/notifications/unread-count` | Count unread | Owner session |
| POST | `/api/owner/notifications/:id/read` | Mark read | Owner session |
| POST | `/api/owner/notifications/read-all` | Mark all read | Owner session |
| GET | `/api/owner/analytics` | Analytics summary + charts | Owner session |
| GET | `/api/owner/page-views` | Page view analytics | Owner session |
| GET/POST | `/api/owner/discounts` | List / Create discount codes | Owner session |
| PATCH/DELETE | `/api/owner/discounts/:id` | Update / Delete discount | Owner session |
| GET | `/api/owner/reviews` | List product reviews | Owner session |
| PATCH | `/api/owner/reviews/:id` | Approve/reject review | Owner session |
| DELETE | `/api/owner/reviews/:id` | Delete review | Owner session |
| GET/POST | `/api/owner/blog` | List / Create blog posts | Owner session |
| GET/PATCH/DELETE | `/api/owner/blog/:id` | Blog post CRUD | Owner session |
| GET/POST | `/api/owner/sales` | List / Create sale promotions | Owner session |
| PATCH/DELETE | `/api/owner/sales/:id` | Update / Delete sale | Owner session |
| GET | `/api/owner/subscribers` | List email subscribers | Owner session |
| DELETE | `/api/owner/subscribers/:id` | Delete subscriber | Owner session |
| GET/POST | `/api/owner/campaigns` | List / Create campaigns | Owner session |
| GET/PATCH/DELETE | `/api/owner/campaigns/:id` | Campaign CRUD | Owner session |
| POST | `/api/owner/campaigns/:id/send` | Send campaign to subscribers | Owner session |
| POST | `/api/owner/campaigns/:id/duplicate` | Duplicate campaign | Owner session |
| GET | `/api/owner/customers` | List customers/contacts | Owner session |
| GET | `/api/owner/customers/summary` | Customer aggregate stats | Owner session |
| POST | `/api/owner/customers/backfill` | Backfill store_customers from orders | Owner session |
| GET/POST/DELETE | `/api/owner/domains` | Custom domain CRUD | Owner session |
| POST | `/api/owner/domains/verify` | Trigger DNS CNAME verification | Owner session |
| GET/PATCH | `/api/owner/account` | Owner account info / update | Owner session |
| POST | `/api/owner/change-password` | Change password | Owner session |
| POST | `/api/owner/forgot-password` | Initiate password reset | None |
| POST | `/api/owner/reset-password` | Complete password reset | None |
| POST | `/api/owner/onboarding/complete` | Mark onboarding done | Owner session |
| GET | `/api/owner/check-slug/:slug` | Slug availability check | None |
| GET | `/api/owner/check-email/:email` | Owner email availability check | None |

#### Admin Orders

| Method | Path | What it does | Auth |
|---|---|---|---|
| GET | `/api/stores/:storeId/orders` | List orders | `x-admin-key` |
| GET | `/api/stores/:storeId/orders/:orderId` | Get order | `x-admin-key` |
| PATCH | `/api/stores/:storeId/orders/:orderId/mark-paid` | Manually mark paid | `x-admin-key` |
| PATCH | `/api/stores/:storeId/orders/:orderId/attach-payment-intent` | Attach PI | `x-admin-key` |
| PATCH | `/api/stores/:storeId/orders/:orderId/mark-paid-by-payment-intent` | Mark paid by PI | `x-admin-key` |

#### Buyer Routes (all at `/api/buyer/*`)

| Method | Path | What it does | Auth |
|---|---|---|---|
| POST | `/api/buyer/register` | Create buyer account (store-scoped) | None |
| POST | `/api/buyer/login` | Login, returns session token | None |
| POST | `/api/buyer/forgot-password` | Initiate buyer password reset | None |
| POST | `/api/buyer/reset-password` | Complete buyer password reset | None |
| GET | `/api/buyer/session` | Validate buyer session | Buyer session |
| POST | `/api/buyer/logout` | Revoke buyer session | Buyer session |
| GET | `/api/buyer/profile` | Get buyer profile | Buyer session |
| POST | `/api/buyer/profile` | Update buyer profile | Buyer session |
| POST | `/api/buyer/change-password` | Change buyer password | Buyer session |
| GET | `/api/buyer/orders` | List buyer's orders | Buyer session |
| GET | `/api/buyer/orders/:orderId` | Get specific buyer order | Buyer session |

#### Dev Routes (have NODE_ENV guard — return 404 in non-development)

| Method | Path | What it does | Auth |
|---|---|---|---|
| POST | `/api/dev/provision-store` | Create store + bootstrap owner_account | `devOnly` guard |
| POST | `/api/dev/orders/:orderId/mark-paid` | Mark order paid (bypass Stripe) | `devOnly` + owner session |

#### Demo Routes (**NO NODE_ENV GATE — always active in all environments**)

| Method | Path | File:Line | What it does | Auth |
|---|---|---|---|---|
| POST | `/api/store/:slug/checkout/demo` | `demo.routes.js:56` | Create + immediately mark paid (bypasses Stripe entirely) | Rate-limited only |
| GET | `/api/store/:slug/orders/:orderId/summary` | `demo.routes.js:186` | Public order summary (includes buyer_email) | None |

#### Taxonomy

| Method | Path | What it does | Auth |
|---|---|---|---|
| GET | `/api/taxonomy` | List types, categories, tags | None |

**Total: ~95 endpoints**

### 3.2 Middleware / Guards

[VERIFIED — from reading all 10 middleware files]

| Middleware | File | What it checks |
|---|---|---|
| `requireAdminKey` | `admin.middleware.js` | `x-admin-key` header; timing-safe `crypto.timingSafeEqual` against SHA-256 hash of `ADMIN_KEY` |
| `requireOwnerSession` | `ownerAuth.middleware.js` | `Authorization: Bearer <token>`; SHA-256 hash, DB lookup in `owner_sessions`, checks `revoked_at` and `expires_at`; attaches `req.ownerStoreId`, `req.ownerAccountId` |
| `requireBuyerSession` | `buyerAuth.middleware.js` | Identical pattern to owner; uses `buyer_sessions`; attaches `req.buyerStoreId`, `req.buyerAccountId` |
| `corsMiddleware` | `cors.middleware.js` | Allowlist from `CORS_ORIGIN` env; localhost convenience in dev; null-origin gating |
| `tenantResolver` | `tenant.middleware.js` | Every request: custom domain DB lookup or subdomain extraction; sets `req.tenant` |
| `publicLimiter` | `rateLimit.middleware.js` | IP+tenant key; disableable via `RL_PUBLIC_DISABLED=1` |
| `checkoutLimiter` | `rateLimit.middleware.js` | Stricter limit on checkout/payment endpoints; disableable via `RL_CHECKOUT_DISABLED=1` |
| `requestId` | `requestId.middleware.js` | UUID per request; sets `req.id`, `x-request-id` response header |
| `validateBody(schema)` | `validate.middleware.js` | Zod parse; sets `req.validatedBody`; 400 with field errors on failure |
| `requireUuidParam(name)` | `validate.middleware.js` | UUID regex check on named route param |

**There is NO centralized tenancy guard.** Each owner-session-protected route relies on `req.ownerStoreId` (from the session's `store_id`) for query scoping. No middleware enforces this — it is a convention that every handler must follow. Any new endpoint that fails to use `req.ownerStoreId` in its query is a cross-tenant leak. [VERIFIED: reviewed pattern in `owner.routes.js` — all existing endpoints use `req.ownerStoreId` consistently]

### 3.3 Business Logic

Business logic lives **directly in route handlers** with no service layer. The pattern is:

- **Route handlers** (`*.routes.js`): Input validation, auth, orchestration, response shaping
- **Query files** (`db/queries/*.queries.js`): SQL + embedded business rules (idempotency, transactions, constraint handling)
- **Lib files** (`lib/*.js`): Cross-cutting concerns (crypto, email, file storage, Stripe singleton, fulfillment orchestration)

Complex flows (checkout → order → Stripe session → webhook → mark-paid → fulfillment → email) are orchestrated in route handlers and `lib/fulfillment.js`. There is no service layer. This is manageable at current scale; it will create test friction and refactoring pain as complexity grows.

---

## 4. Database

### 4.1 Schema

[VERIFIED — from reading all 31 migration files]

| Table | PK | Tenant Scope | Key Relationships | Notes |
|---|---|---|---|---|
| `schema_migrations` | `id TEXT` | No | — | Migration tracking table |
| `stores` | `UUID` | Root entity | — | `slug UNIQUE`; all other tables FK to this |
| `users` | `UUID` | `store_id FK` | → stores | Legacy from initial schema; appears unused in current code |
| `products` | `UUID` | `store_id FK` | → stores | `delivery_url` OR `delivery_file_key` for delivery; `pricing_type CHECK('fixed','pay_what_you_want')` |
| `orders` | `UUID` | `store_id FK` | → stores, products (via items) | `status CHECK('pending','paid','failed','refunded')`; `stripe_checkout_session_id UNIQUE` |
| `order_items` | `UUID` | Implicit via `order_id` | → orders CASCADE, → products | No direct `store_id`; scoped through order |
| `order_fulfillments` | `UUID` | `store_id FK`, `order_id UNIQUE FK` | → orders CASCADE | UNIQUE on `order_id` = one fulfillment per order (idempotency) |
| `owner_accounts` | `UUID` | `store_id UNIQUE FK` | → stores CASCADE | One owner per store; bootstrap token fields; scrypt password hash |
| `owner_sessions` | `UUID` | `store_id FK` | → owner_accounts CASCADE | `token_hash UNIQUE`; `expires_at`; `revoked_at` |
| `buyer_accounts` | `UUID` | `store_id FK` | → stores | `UNIQUE(store_id, email)` — same email = different accounts per store |
| `buyer_sessions` | `UUID` | `store_id FK` | → buyer_accounts CASCADE | Identical structure to owner_sessions |
| `buyer_password_reset_tokens` | `UUID` | Implicit | → buyer_accounts | 1-hour TTL |
| `password_reset_tokens` | `UUID` | Implicit | → owner_accounts | 1-hour TTL |
| `store_customers` | `UUID` | `store_id FK` | → stores | `UNIQUE(store_id, email)`; denormalized aggregate (order_count, total_spent_cents) |
| `discount_codes` | `UUID` | `store_id FK` | → stores | `percent` or `fixed`; max_uses, expiry; **NO UNIQUE on (store_id, code)** |
| `product_reviews` | `UUID` | `store_id FK` | → products CASCADE, → orders | `review_token UNIQUE`; trigger updates product avg_rating and review_count |
| `store_sales` | `UUID` | `store_id FK` | → stores | `product_ids uuid[]`; time-bounded |
| `store_subscribers` | `UUID` | `store_id FK` | → stores | `UNIQUE(store_id, email)`; `unsubscribe_token UNIQUE` |
| `page_views` | `UUID` | `store_id FK` | → stores, products | Analytics events |
| `owner_notifications` | `UUID` | `store_id FK` | → stores | In-app notifications |
| `blog_posts` | `UUID` | `store_id FK` | → stores | `UNIQUE(store_id, slug)` |
| `email_campaigns` | `UUID` | `store_id FK` | → stores | Draft → sent lifecycle |
| `email_campaign_recipients` | `UUID` | `store_id FK` | → campaigns | `open_tracking_token UNIQUE` |
| `custom_domains` | `UUID` | `store_id FK` | → stores | `domain TEXT UNIQUE` globally; partial unique index: one active domain per store |
| `taxonomy_types` | `UUID` | None (platform-wide) | — | Seed data: 12 types |
| `taxonomy_categories` | `UUID` | None | → taxonomy_types | Seed data |
| `taxonomy_tags` | `UUID` | None | — | Seed data |

### 4.2 Migrations

[VERIFIED — all 31 migrations read]

- **31 migrations**, numbered `001`–`031`, sequential
- Tracked in `schema_migrations` table; migration runner checks before applying
- Migration runner: `backend/scripts/migrate.js`
- Down migrations exist for all 31
- **Seed data only in** `016_taxonomy_product_fields.sql` (taxonomy rows inline)
- `npm test` runs `migrate:up` before running tests — idempotent by design
- Migration 026 re-applies migration 025's columns idempotently because 025 did not self-record in `schema_migrations` — a minor historical defect now papered over [VERIFIED: 026 comment + code]

**Defect in migration 005/006:** Migration 005 adds `NOT NULL` to `stores.is_enabled`. Migration 006 immediately drops it. The net result is `is_enabled` has no NOT NULL constraint. [VERIFIED: reading both migrations]

### 4.3 Integrity

[VERIFIED — from migration SQL]

**Foreign keys at DB level:** Yes. All major relationships have FK constraints in SQL.

**`ON DELETE CASCADE`** applies on:
- `products.store_id → stores.id CASCADE`
- `orders.store_id → stores.id CASCADE`
- `order_items.order_id → orders.id CASCADE`
- `order_fulfillments.order_id → orders.id CASCADE`
- `owner_accounts.store_id → stores.id CASCADE`
- `owner_sessions.owner_account_id → owner_accounts.id CASCADE`
- `buyer_sessions.buyer_account_id → buyer_accounts.id CASCADE`
- `store_customers.store_id → stores.id CASCADE`
- `discount_codes.store_id → stores.id CASCADE`
- `product_reviews.product_id → products.id CASCADE`

**Cascade risk:** Deleting a `store` hard-deletes all its products, orders, order_items, fulfillments, owner accounts, sessions, customers, discount codes, reviews. No soft-delete protection. This cascade is live at the DB level and there is no application-level guard against store deletion (no endpoint exists for it currently, but the risk exists if one is added carelessly).

**Uniqueness constraints:**
- `stores.slug` — UNIQUE
- `owner_accounts.store_id` — UNIQUE (one owner per store)
- `owner_accounts.email` — partial unique index on `LOWER(email) WHERE is_claimed = TRUE`
- `buyer_accounts(store_id, email)` — UNIQUE
- `orders.stripe_checkout_session_id` — UNIQUE (prevents duplicate Stripe webhook processing at DB level)
- `order_fulfillments.order_id` — UNIQUE (one delivery per order; idempotency guarantee)
- `custom_domains.domain` — UNIQUE globally
- `store_subscribers(store_id, email)` — UNIQUE
- **`discount_codes(store_id, code)` — NO UNIQUE CONSTRAINT** [VERIFIED: migration 015 does not define one]

**RLS:** Enabled on all tables via migration 026. Policy grants `postgres` and `service_role` full access. Anon role is blocked except on taxonomy tables. RLS protects against Supabase PostgREST direct API access — it does NOT enforce store scoping for the backend's own queries (the backend user has full access to all rows).

**Indexes (from migration 031):** 14 performance indexes covering: `orders(store_id, status)`, `orders(store_id, buyer_email)`, `order_items(order_id)`, `order_items(product_id)`, `products(store_id, visibility)`, `products(store_id, sort_order)`, `page_views(store_id, created_at)`, `page_views(store_id, product_id)`, `owner_sessions(token_hash)`, `buyer_sessions(token_hash)`, `store_subscribers(store_id, is_active)`, `product_reviews(product_id, is_approved)`, `owner_notifications(store_id, is_read)`, `email_campaign_recipients(campaign_id)`.

---

## 5. Frontend

[VERIFIED — from `frontend/src/App.jsx` and key page/context files]

### Routes / Pages

**Public buyer-facing:**
- `/store/:slug` — `Storefront.jsx`
- `/store/:slug/product/:productId` — `ProductDetail.jsx` + `ProductPage.jsx` (two components on overlapping patterns — unclear which is canonical)
- `/store/:slug/checkout` — `CheckoutPage.jsx` (uses demo endpoint, not Stripe)
- `/store/:slug/checkout/success` — `CheckoutSuccess.jsx`
- `/store/:slug/login`, `/register`, `/account`, `/forgot-password`, `/reset-password` — buyer auth flow
- `/store/:slug/blog`, `/store/:slug/blog/:postSlug` — blog
- `/store/:slug/review/:token` — review submission
- `/unsubscribe/:token`, `/review/:token` — standalone token flows

**Owner dashboard (`/owner/*`, 24 pages):**
login, claim-access, onboarding, home, dashboard (legacy), analytics, products, product-creator, orders, customers, discounts, sales, subscribers, campaigns, email-composer, blog-posts, blog-editor, reviews, storefront-editor, settings, forgot-password, reset-password, custom-domains

**Legacy admin routes still mounted in `App.jsx` (never removed):**
- `/` → `Connect.jsx`
- `/store/:storeId` → `StorePage.jsx`
- `/orders` → `OrdersPage.jsx`

These conflict with the owner dashboard paradigm. They have no owner session auth guard.

### Admin / Public / Owner / Buyer Separation

- **Owner:** `/owner/*` — `OwnerContext` (localStorage), `OwnerLayout`, owner API
- **Buyer:** `/store/:slug/*` — `BuyerContext` (localStorage, per-store), `CartContext`
- **Platform admin:** No UI. ADMIN_KEY only via HTTP.
- **Legacy admin:** Unprotected routes still in App.jsx

### State Management

- `OwnerContext`: `localStorage` persistence of `owner_session_token` + `owner_store`. Session validated at mount. **Network failures silently keep users logged in.** [VERIFIED: `OwnerContext.jsx`]
- `BuyerContext`: Per-store buyer session, similar pattern.
- `CartContext`: In-memory cart; `clearCart()` called synchronously before navigate on checkout.
- No global state library (no Zustand, Redux, Recoil).

### Styling / Forms / Data Fetching

- Styling: CSS Modules (`.module.css` per page). Global CSS in `src/styles/global.css`. No Tailwind.
- Forms: Manual `useState` + `onSubmit`. No form library.
- Data fetching: Native `fetch()`. No Axios, TanStack Query, SWR, or Server Actions.

---

## 6. Auth and Multi-Tenancy

### 6.1 Authentication

**Owner auth:**
1. **Provision** (platform admin): `POST /api/dev/provision-store` creates store + `owner_accounts` row with `is_claimed=false`, hashed bootstrap token. Returns raw bootstrap token.
2. **Claim** (owner): `POST /api/owner/claim-access` with bootstrap token + new password. Verifies token hash, scrypt-hashes password, sets `is_claimed=true`, clears bootstrap fields. Returns session token.
3. **Login**: `POST /api/owner/login` with slug + password. Returns session token.
4. **Session**: `Authorization: Bearer <raw_token>`. Raw token = 32 random bytes (hex). Stored as SHA-256 hash in `owner_sessions`. TTL: **7 days** (hardcoded in `owner.queries.js` — not an env var). No refresh tokens. Absolute expiry.
5. **Password reset**: `forgot-password` → email with token → `reset-password`. Token TTL: 1 hour.

**Buyer auth:** Identical mechanism. Buyers are per-store: same email = separate `buyer_accounts` rows per store.

**scrypt parameters:** N=16384, r=8, p=1, keyLen=64. Acceptable but not aggressive. ~500ms/hash, hence `jest.setTimeout(30000)` in auth tests. [VERIFIED: `backend/src/lib/ownerAuth.js`]

**Token generation:** `crypto.randomBytes(32)` → hex. SHA-256 for storage. Raw token never persisted. [VERIFIED: `ownerAuth.js`]

### 6.2 Authorization

Roles:
- **Platform admin:** Static `ADMIN_KEY` in env. No DB record. Global — can access any store's data via admin endpoints. No audit log.
- **Store owner:** One per store. Identified by `owner_sessions` token. All operations scoped to `req.ownerStoreId`.
- **Buyer:** Per-store. Identified by `buyer_sessions` token. Scoped to `req.buyerStoreId`. Can only see own orders.
- **Anonymous:** No auth. Can browse storefront, submit orders, use delivery links.

There is no middleware-level role hierarchy. Each endpoint explicitly chooses its auth middleware.

### 6.3 Multi-Tenancy

**Isolation mechanism:** Manual `store_id` filtering in every query. RLS grants the backend user full access to all rows — DB-level isolation is not enforced at query time.

**How "which store" is resolved:**
- Owner endpoints: `req.ownerStoreId` from the session record (session IS the store binding — no URL param used)
- Buyer endpoints: `req.buyerStoreId` from buyer session
- Public storefront: slug path param → `resolveEnabledStoreIdBySlug(slug)`
- Host-header routes: `tenantResolver` → `req.tenant.slug` or `req.tenant.store`
- Admin endpoints: `:storeId` or `:id` URL param (admin key is trusted)

**Cross-tenant leak analysis** [VERIFIED — reviewed `owner.routes.js` handler pattern]:
- All owner routes use `req.ownerStoreId` as the store scope in every DB call. No URL-param override is possible. A store owner cannot access another store's data by manipulating the URL.
- Buyer order detail: scoped by `req.buyerStoreId` AND order UUID. [INFERENCE from pattern — `buyer.routes.js` not read line-by-line]
- **Demo checkout** (`POST /api/store/:slug/checkout/demo`): creates real paid orders for any enabled store. Slug is public. Anyone can get free downloads from any enabled store. [VERIFIED: `demo.routes.js:56`]
- **Order summary** (`GET /api/store/:slug/orders/:orderId/summary`): returns `buyer_email` with no auth. UUID guessing is impractical but this is still a privacy design decision to document. [VERIFIED: `demo.routes.js:222`]

---

## 7. Checkout and Payments

[VERIFIED — from reading `stripe.routes.js`, `demo.routes.js`, `fulfillment.js`]

### Real Stripe Flow

1. `POST /api/store/:slug/checkout/session` — validates store + products, creates pending order in DB, creates Stripe Checkout Session with `order_id` and `store_id` in session metadata, returns `checkout_url`
2. User pays on Stripe-hosted page
3. `POST /api/webhook/stripe` receives `checkout.session.completed`:
   - **Signature verified:** `stripe.webhooks.constructEvent(req.body, sig, webhookSecret)` [VERIFIED: `stripe.routes.js:314`]
   - Raw body preserved via `express.raw()` mounted BEFORE `express.json()` in `app.js`
   - Calls `markOrderPaid()` — idempotent (`UPDATE WHERE status='pending'`)
   - Fire-and-forget: discount usage increment, product sales count, seller notification email, marketing opt-in update, store_customers upsert, fulfillment trigger

**Webhook idempotency:** YES at multiple levels:
- `markOrderPaid()` uses `UPDATE WHERE status='pending'` — repeated calls are no-ops
- `order_fulfillments.ON CONFLICT (order_id) DO NOTHING` — no duplicate emails
- `orders.stripe_checkout_session_id UNIQUE` — DB prevents duplicate session processing
[VERIFIED: `orders.queries.js`, `fulfillment.queries.js`, migration 004]

**After successful payment:** Order marked paid → fulfillment email sent with time-limited download token → buyer clicks link → `GET /api/deliver/:token` → 302 redirect to file (Supabase signed URL or external URL)

**Demo flow (no Stripe):** `POST /api/store/:slug/checkout/demo` creates order + immediately marks paid + triggers fulfillment. **Always active in all environments.** [VERIFIED: `routes/index.js`, `demo.routes.js`]

**Refunds:** Not implemented. No webhook handler for `payment_intent.refunded` or `charge.refund.created`. `refunded` status exists in the `orders.status` CHECK constraint but no code transitions to it.

**Failed payments:** Not implemented. No handler for `payment_intent.payment_failed`. Orders stay in `pending` indefinitely.

**PWYW:** Backend: price validation enforced at checkout session creation. [VERIFIED: `stripe.routes.js:125-135`]. Frontend implementation for entering custom price: [NOT VERIFIABLE — not read]

**Discount codes:** Validated at session creation; Stripe coupon created on-the-fly; usage incremented on webhook. [VERIFIED: `stripe.routes.js:217-225`]

---

## 8. Products and Orders

[VERIFIED — from `products.queries.js`, `orders.queries.js`, `delivery.routes.js`, `fulfillment.js`]

### Products

- Digital only. No physical product support.
- Two delivery mechanisms: `delivery_url` (external URL) or `delivery_file_key` (Supabase Storage private bucket)
- `delivery_url` is **excluded from all public API responses** [VERIFIED: `storefront.queries.js` SELECT list]
- File upload: multer, 25MB limit, explicit MIME type allowlist [VERIFIED: `storage.js:33-52`]
- Visibility: `published`, `draft`, `unlisted` (unlisted still accessible by direct URL/ID)
- Soft delete: products with order history set `is_active = false`; hard delete otherwise

### Orders

States: `pending` → `paid` (webhook or demo) | `failed` (no code transitions here) | `refunded` (no code transitions here)

`pending` orders are created at checkout session creation. The frontend is explicitly NOT trusted to mark orders paid. [VERIFIED: `stripe.routes.js:3` comment]

### Delivery

1. `triggerFulfillment()`: generates 32-byte token, hashes for storage, sends email with `GET /api/deliver/<raw_token>` link. [VERIFIED: `fulfillment.js:180-201`]
2. Delivery endpoint: hashes token → DB lookup → expiry check → 302 redirect:
   - `delivery_file_key` present: generates 1-hour Supabase signed URL
   - `delivery_url` present: redirects to external URL directly
3. **CRITICAL: Only `deliverable[0]` is served.** Multi-item orders deliver only the first product's file. [VERIFIED: `delivery.routes.js:71`]
4. Marks `order_fulfillments.opened_at` on first access (fire-and-forget)

### Entitlements

**No entitlement concept exists.** A purchase does not create a persistent "buyer can re-download product X" record. After the delivery link expires (72h default), the buyer must contact the seller, who can trigger a resend (`POST /api/owner/orders/:id/resend-delivery`). There is no self-service re-download in the buyer portal.

---

## 9. Tests

[VERIFIED — from reading all 10 test files, `jest.config.js`, `jest.env.js`, `jest.afterEnv.js`]

**Framework:** Jest 30.2.0 + Supertest 7.2.2  
**Test type:** All integration tests (hit real DB or mock Stripe SDK — no unit tests)  
**Total test files:** 10  
**Estimated test cases:** ~45

### Test Files

| File | What it covers |
|---|---|
| `health.test.js` | `GET /api/health` → 200 with `status` field |
| `admin.auth.test.js` | `POST /api/stores` without admin key → 401 |
| `cors.localhost.test.js` | CORS allowlist for localhost origins |
| `request-id.test.js` | `x-request-id` header injection; error JSON includes `request_id` |
| `tenancy.meta.test.js` | Host-header tenant resolution via subdomain |
| `disabled-store.orders.test.js` | Disabled store → 404 on order creation |
| `owner.auth.test.js` | Claim-access (success, wrong token, already-claimed, short password); login (success, wrong password, nonexistent, unclaimed); session validation + expiry; logout; cross-store order isolation; `delivery_url` excluded from public API |
| `stripe.checkout.test.js` | Stripe SDK mocked; checkout session (invalid store, disabled, wrong product, missing email, success); webhook (invalid sig, valid completed, idempotent, missing metadata, wrong store_id, unknown event type) |
| `fulfillment.test.js` | `triggerFulfillment` (creates record+email, idempotent, no-op on unpaid, marks failed on email error); delivery endpoint (valid → 302, invalid → 404, expired → 410, marks opened); resend delivery (200, 404, 401); order includes fulfillment status |
| `helpers.js` | Test utility: creates test stores, products, sessions |

### Test Run Status — ❌ ALL TESTS BROKEN

[VERIFIED — `npm test` was run against a live DB instance with all migrations applied]

```
✅ No pending migrations.
Test Suites: 0 of 9 total
Tests:       0 total
Time:        3.443 s
TypeError: ● Invalid transformer module:
  ".../node_modules/babel-jest/build/index.js" specified in the "transform"
  object of Jest configuration must export a `process` or `processAsync`
  or `createTransformer` function.
```

**0 tests ran. 0 passed. 0 failed. All 9 test suites were skipped due to a setup crash.**

**Root cause:** `jest@30.3.0` (resolved from `^30.2.0`) introduced a breaking change in transformer loading. Jest defaults to using `babel-jest` as its transform even though `jest.config.js` specifies no `transform` key. `babel-jest@30.3.0` exports `{ createTransformer, default }` — the function IS present — but `jest@30.3.0`'s transformer-loading code rejects it anyway (likely checks `default.process` / `default.createTransformer` rather than top-level). The project is plain CJS Node.js and never required Babel transformation; the dependency was incidental.

**Fix required (not applied in this audit):** Add `transform: {}` to `jest.config.js` to disable the default babel transform entirely.

**Impact:** CI (`ci.yml`) also runs `npm test`. With this bug, CI exits with 0 test suites and misleadingly reports success on the migrate step. The badge/check is meaningless. No tests have been validated by CI since `jest@30.3.0` was resolved.

### Test Quality Issues (verified from source)

**Incomplete cleanup:** `jest.afterEnv.js` deletes only `order_items`, `orders`, `products`, `stores` for `__TEST_STORE_IDS__`. Does NOT clean `owner_accounts`, `owner_sessions`, `order_fulfillments`, `store_customers`, `buyer_accounts`, `buyer_sessions`, `page_views`, `owner_notifications`, `discount_codes`. These accumulate across local test runs. [VERIFIED: `tests/jest.afterEnv.js`]

CI creates a fresh Postgres container per run, so accumulation only affects local development. But repeated local `npm test` invocations will pollute the test DB.

**CI env gap:** CI does not set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`. File upload and real email tests would need to stub these. `MAILER_PROVIDER=log` is set in `jest.env.js` as default, so email is console-logged in tests.

### Coverage Gaps

The following areas have NO tests:
- All buyer auth routes
- Discount code CRUD
- Blog post CRUD
- Sales/promotions CRUD
- Email campaigns
- Product file upload (Supabase-dependent)
- All analytics endpoints
- Custom domain management
- Review submission
- Demo checkout endpoint
- Admin order management endpoints
- Store settings PATCH (`/api/owner/store`)
- Taxonomy
- Tracking pixel

---

## 10. Commands

[VERIFIED — from `backend/package.json` and `frontend/package.json`]

### Backend (`backend/`)

| Script | Command | Status |
|---|---|---|
| `npm start` | `node server.js` | [INFERENCE: ✅ if env vars set — server was running at :5051 during session] |
| `npm run dev` | `node --watch-path=src server.js` | [INFERENCE: ✅ in dev] |
| `npm run migrate` | `node scripts/migrate.js` | [INFERENCE: ✅ if DATABASE_URL set] |
| `npm run migrate:up` | `node scripts/migrate.js up` | [INFERENCE: ✅ if DATABASE_URL set] |
| `npm run migrate:status` | `node scripts/migrate.js status` | [INFERENCE: ✅ if DATABASE_URL set] |
| `npm test` | `npm run migrate:up && jest --runInBand` | ❌ BROKEN: migrations run (✅), then Jest crashes with `babel-jest` transformer error — **0 tests run** |
| `npm run test:ci` | `jest --runInBand --forceExit` | ❌ BROKEN: same `babel-jest` transformer crash |

**No lint, typecheck, or format scripts defined.** No ESLint config, no Prettier, no TypeScript. Zero static analysis tooling.

### Frontend (`frontend/`)

| Script | Command | Status |
|---|---|---|
| `npm run dev` | `vite` | [INFERENCE: ✅ — was running during session] |
| `npm run build` | `vite build` | [NOT VERIFIED: not run in audit] |
| `npm run preview` | `vite preview --port 4000` | [INFERENCE: ✅ — was running at :4000] |

---

## 11. Critical Risks

### 🔴 CRITICAL

**C1: Demo checkout endpoint is live in all environments — anyone can get free downloads**  
`POST /api/store/:slug/checkout/demo` is mounted unconditionally in `routes/index.js`. No `NODE_ENV` check. Creates a real paid order and triggers a real fulfillment email for any enabled store. Any person who knows a store slug (public information on the storefront) can receive product delivery emails without paying.  
Evidence: `backend/src/routes/index.js` (demoRouter mount); `backend/src/routes/demo.routes.js:56`  
[VERIFIED]

**C2: Order summary endpoint returns buyer email without authentication**  
`GET /api/store/:slug/orders/:orderId/summary` returns `buyer_email` in the JSON response. No auth required. The UUID is the only protection. Order IDs appear in URLs (browser history, server logs). If an order UUID leaks, the buyer's email is exposed.  
Evidence: `backend/src/routes/demo.routes.js:222-231`  
[VERIFIED]

**C3: Multi-item orders deliver only the first product's file**  
`delivery.routes.js:71` takes `deliverable[0]` and does nothing with the rest. A buyer purchasing two different digital products in one cart receives only one. This is a silent functional failure — no error is shown.  
Evidence: `backend/src/routes/delivery.routes.js:71`  
[VERIFIED]

**C4: `backend/.env` appears to be tracked in git**  
`backend/.env` shows as "Changes not staged for commit" in `git status` (not as "Untracked"). This means git has a prior version of this file indexed. If secrets (DATABASE_URL with credentials, ADMIN_KEY, SUPABASE keys) were in the file when it was committed, they are in git history.  
**Immediate action required:** Run `git log --oneline -- backend/.env` and `git show HEAD:backend/.env` (redact before sharing). If committed, rotate all secrets and purge with `git filter-repo`.  
[INFERENCE — based on `git status` output showing file as tracked-modified, not untracked]

**C5: ADMIN_KEY is a static global secret with no rotation or audit**   
All administrative operations (store creation, enabling stores, order management) use a single `ADMIN_KEY` env var. If it leaks, all stores are at risk. No rotation mechanism, no per-operation audit log, no expiry.  
Evidence: `backend/src/middleware/admin.middleware.js`  
[VERIFIED]

**C6: The entire test suite is broken — 0 tests run**  
`npm test` crashes immediately after migrations with a `babel-jest` transformer API error (`TypeError: Invalid transformer module`). `jest@30.3.0` resolved from `^30.2.0` introduced a breaking change. **No tests have been executing in CI or locally since this version was resolved.** The CI badge is false — it exits 0 because the migration step passes, but Jest ran nothing. Fix: add `transform: {}` to `jest.config.js`.  
Evidence: live run output: `Test Suites: 0 of 9 total, Tests: 0 total`  
[VERIFIED]

**C7: ~160 uncommitted files — recent feature surface is not in git**  
Everything built since commit `fee1623` (migrations 013–031, buyer auth, all advanced query files, all advanced routes, most frontend pages including buyer flows, campaigns, analytics, reviews, etc.) is either untracked or unstaged. The branch is also 2 commits ahead of origin and not pushed. A disk failure or accidental `git checkout .` would destroy the majority of the project's recent work.  
Evidence: `git status` at session start  
[VERIFIED]

### 🟠 HIGH

**H1: No refund or failed-payment handling**  
No Stripe webhook handlers for `payment_intent.payment_failed`, `charge.refund.created`, or `checkout.session.expired`. Orders in `pending` after session expiry never transition. The `refunded` and `failed` order states exist in the schema but no code transitions to them programmatically. Refunds require direct DB manipulation.  
Evidence: `stripe.routes.js:322` — only `checkout.session.completed` handled  
[VERIFIED]

**H2: Test cleanup incomplete — data accumulates across local runs**  
`jest.afterEnv.js` deletes only 4 tables. `owner_accounts`, `owner_sessions`, `buyer_accounts`, `buyer_sessions`, `order_fulfillments`, `store_customers`, `page_views`, `owner_notifications` accumulate. Tests can interfere across runs on the same local DB.  
Evidence: `backend/tests/jest.afterEnv.js`  
[VERIFIED]

**H3: OwnerContext silently keeps users logged in on network failure**  
If `GET /api/owner/session` fails due to a network error (not a 401), the catch block in `OwnerContext.jsx` does not set `sessionStatus = "invalid"`. An expired or invalid token that can't reach the server will not log the user out.  
Evidence: `frontend/src/context/OwnerContext.jsx`  
[VERIFIED]

**H4: Custom domain DB lookup on every request — no caching**  
`tenantResolver` middleware fires a DB query for every request with a non-platform `Host` header. A `TODO` comment acknowledges this: "Add in-memory cache for custom domain lookups (TTL 5 min)." At scale, every page view for custom-domain stores hits the DB twice (domain lookup + actual query).  
Evidence: `backend/src/middleware/tenant.middleware.js:135`  
[VERIFIED]

**H5: No TypeScript — no type safety**  
The entire backend and frontend are plain JavaScript. No `tsconfig.json`, no type checking. Type errors in query function arguments, missing fields in API responses, wrong shape of `req.validatedBody` — none of these are caught at build time.  
[VERIFIED]

**H6: No ESLint, no Prettier, no static analysis**  
Neither `backend/package.json` nor `frontend/package.json` define lint or format scripts. No `.eslintrc`. Code quality is entirely manual.  
[VERIFIED]

**H7: Delivery architecture broken for multi-product carts**  
The email contains one link. That link serves one file (item[0]). There is no plan in the current architecture for delivering multiple files from a single token. This must be redesigned before multi-item orders are a first-class feature — the fix requires changes to both `fulfillment.js` and `delivery.routes.js`.

### 🟡 MEDIUM

**M1: Legacy admin UI routes unmaintained and unprotected in `App.jsx`**  
`/` (Connect.jsx), `/store/:storeId` (StorePage), `/orders` (OrdersPage) are still mounted. They have no owner session auth guard. A new engineer will not understand which UI is canonical.  
Evidence: `frontend/src/App.jsx`  
[VERIFIED]

**M2: `DashboardLegacy.jsx` is the routed dashboard; `Dashboard.jsx` is dead code**  
`/owner/dashboard` mounts `DashboardLegacy`. `Dashboard.jsx` exists but is not routed.  
Evidence: `frontend/src/App.jsx`  
[VERIFIED]

**M3: Orphan files**  
`frontend/src/pages/SimulatePurchase.module.css` (no .jsx); root `package-lock.json` (no root package.json); 4 `vite.config.js.timestamp-*.mjs` files (not gitignored).  
[VERIFIED]

**M4: Session TTL hardcoded in query file**  
`SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000` hardcoded in `backend/src/db/queries/owner.queries.js`. Should be an env var.  
[VERIFIED]

**M5: `discount_codes` has no unique constraint on (store_id, code)**  
Migration 015 does not define `UNIQUE(store_id, code)`. Duplicate codes within a store are possible via race condition or application bug.  
Evidence: `backend/migrations/up/015_discount_codes.sql`  
[VERIFIED]

**M6: `console.log` / `console.error` as the only logging mechanism**  
No structured logging in prod paths (fulfillment, webhook, email). `pino` and `pino-http` are in `dependencies` but not necessarily wired for all request paths. Output is unstructured strings, hard to aggregate in production.

**M7: Owner cannot self-register — requires admin bootstrap step**  
`/get-started` (GetStarted.jsx) calls `POST /api/dev/provision-store` which has a `devOnly` guard (`NODE_ENV !== "development"` → 404). In production, new owners cannot register without a platform admin manually creating a store record. This is an architectural blocker for any self-serve onboarding.

---

## 12. Gaps Against a Multi-Tenant Digital Products SaaS

| Feature | Status | Notes |
|---|---|---|
| Owner onboarding | 🟡 PARTIAL | GetStarted.jsx + claim-access flow exists. BUT: store creation requires platform admin (`provision-store` is dev-only). Owner cannot self-register in production. |
| Store creation and configuration | ✅ IMPLEMENTED | Stores table, settings CRUD, branding, currency, pause, personality fields |
| Digital product upload | ✅ IMPLEMENTED | File upload (Supabase Storage, 25MB) + external URL, PWYW pricing |
| Product management | ✅ IMPLEMENTED | CRUD, bulk ops, reorder, duplicate, visibility, tags, SEO fields |
| Real checkout | ✅ IMPLEMENTED | Stripe Checkout hosted page with discount codes and sale pricing |
| Real payments | 🟡 PARTIAL | Webhook verified and idempotent; no failed payment or refund handling |
| Secure file delivery | 🟡 PARTIAL | Time-limited token delivery works; BUT only item[0] per order; no re-download portal |
| Owner dashboard with metrics | ✅ IMPLEMENTED | Revenue, orders, customers, page views, analytics charts |
| Orders panel | ✅ IMPLEMENTED | Enriched order list, detail view, resend delivery |
| Buyer management | ✅ IMPLEMENTED | store_customers aggregate, buyer_accounts, order history |
| Refunds / support | ❌ MISSING | No refund flow, no webhook handler, no status transition via UI |
| Transactional emails | 🟡 PARTIAL | Delivery ✅, seller notification ✅, password reset ✅. All via `MAILER_PROVIDER=log` by default — real email requires `RESEND_API_KEY` in env |
| Platform admin (superuser) | ❌ MISSING | No web UI. ADMIN_KEY + curl only. No audit log. |
| Self-serve owner registration | ❌ MISSING | `provision-store` is dev-only. Production onboarding requires manual admin step. |
| Review system | 🟡 PARTIAL | Full CRUD backend + frontend editor. Display on public storefront — [NOT VERIFIABLE] |
| Blog | 🟡 PARTIAL | Full CRUD. No scheduling, no preview-as-published |
| Email campaigns | 🟡 PARTIAL | Campaign CRUD + send to subscribers + open tracking. Click tracking schema exists but implementation [NOT VERIFIABLE] |
| Sales / promotions | ✅ IMPLEMENTED | `store_sales` table, computed at checkout, time-bounded |
| Discount codes | ✅ IMPLEMENTED | Percent/fixed, max uses, expiry, min order, storefront validation |
| Custom domains | 🟡 PARTIAL | Schema, DNS CNAME verification, Host-header routing. Requires manual propagation wait. |
| Subscriber / mailing list | ✅ IMPLEMENTED | Subscribe, unsubscribe token, `store_subscribers` table |
| Buyer account + portal | 🟡 PARTIAL | Register/login/orders exist. No self-serve re-download. |
| PWYW pricing | 🟡 PARTIAL | Backend enforced; frontend UI for custom price entry [NOT VERIFIABLE] |
| Analytics | ✅ IMPLEMENTED | Revenue, orders, geography, customers, page views, referrers |
| Notifications | ✅ IMPLEMENTED | In-app notifications (sale, delivery sent/failed, etc.) |

---

## 13. Files That Must Not Be Broken Without an Explicit Plan

| File | Why it is critical |
|---|---|
| `backend/src/app.js` | Express app assembly; Stripe webhook must be mounted with `express.raw()` BEFORE `express.json()` — breaking this breaks all webhook signature verification |
| `backend/src/routes/stripe.routes.js` | Stripe webhook signature verification, order payment lifecycle, seller notifications, fulfillment trigger |
| `backend/src/routes/delivery.routes.js` | The only mechanism through which buyers access their purchased files; token validation + expiry enforcement |
| `backend/src/lib/fulfillment.js` | Post-payment orchestration: token generation, email, idempotency, error isolation |
| `backend/src/lib/ownerAuth.js` | scrypt parameters + token generation; used by BOTH owner and buyer auth (via separate modules that import from here) |
| `backend/src/middleware/ownerAuth.middleware.js` | Session validation for all owner endpoints; breaking this = all owner APIs unprotected |
| `backend/src/middleware/admin.middleware.js` | Timing-safe admin key check; degrading to non-timing-safe creates a timing oracle |
| `backend/src/db/queries/orders.queries.js` | `createOrder`, `markOrderPaid`, `attachPaymentIntent` — core payment lifecycle; idempotency logic lives here |
| `backend/src/db/queries/storefront.queries.js` | Deliberately excludes `delivery_url` from SELECT; breaking this leaks download URLs to buyers |
| `backend/src/db/queries/fulfillment.queries.js` | `ON CONFLICT (order_id) DO NOTHING` idempotency; breaking this can cause double-delivery |
| `backend/migrations/up/*.sql` (all 31) | Sequential schema; breaking any migration breaks all subsequent deployments |
| `backend/scripts/migrate.js` | Only mechanism for schema deployment; idempotency relies on `schema_migrations` table check |
| `backend/tests/jest.afterEnv.js` | Test cleanup; gaps cause test pollution and cascading failures across test files |
| `frontend/src/context/OwnerContext.jsx` | Owner session persistence + validation; breaking = all owners locked out of dashboard |
| `frontend/src/context/BuyerContext.jsx` | Buyer session; breaking = buyers locked out |
| `.github/workflows/ci.yml` | Only CI definition; breaking it = no automated test runs |

---

## 14. Briefing for Claude Chat

**What it is:** A multi-tenant digital products SaaS (Gumroad/Lemonsqueezy-style). Store owners sell downloadable files (PDFs, ZIPs, presets, etc.) to buyers. Each store has a slug-based URL (`/store/:slug`), its own branding, products, and isolated buyer accounts.

**Stack:** Node.js 20 + Express (no framework beyond Express); React 18 + Vite + React Router 6; PostgreSQL with raw SQL via node-postgres (no ORM); Stripe for payments; Supabase Storage for file hosting (optional); Resend or console for email. 100% JavaScript — no TypeScript anywhere.

**Auth:** Custom scrypt-based sessions. Owner accounts: one per store, claimed via bootstrap token. Buyer accounts: per-store isolation, same email = different accounts per store. Sessions stored server-side in DB (token_hash), 7-day TTL. Admin operations use a static `ADMIN_KEY` env var.

**What is done:** Full DB schema (31 migrations), Stripe Checkout with signature-verified webhook and idempotent payment processing, time-limited token-based digital delivery (Supabase Storage or external URL), complete owner dashboard API (products, orders, analytics, blog, campaigns, reviews, discounts, sales, subscribers, custom domains), GitHub Actions CI running integration tests against real Postgres.

**What is missing or incomplete:** Stripe refund/failed-payment handling; multi-item delivery (only first product served per order); buyer re-download portal; platform admin UI (curl only); self-serve owner registration (dev-only endpoint blocks production use); no TypeScript; no ESLint.

**Critical risks:** Demo checkout endpoint live in all environments (free downloads for anyone); ~160 files uncommitted (recent feature surface not in git); `backend/.env` may be in git history (verify and rotate if so); ADMIN_KEY is a static global secret with no rotation; OwnerContext network failures silently keep users logged in.

**Settled decisions:** Stripe for payments; Supabase Storage for files; scrypt for password hashing; raw SQL (no ORM); CSS Modules; native fetch.

**Open decisions:** Whether to add TypeScript; how to enable self-serve owner registration in production; whether to gate demo routes by environment (the right answer is: gate them); how to redesign multi-file delivery; which email provider to commit to (Resend vs others).

---

## 15. Meta: About This Handoff

### What could not be verified

- **Test pass/fail counts:** `npm test` was successfully run against a live DB (migrations applied cleanly). Result: `Test Suites: 0 of 9, Tests: 0 total` — the suite crashes before running a single test due to a `babel-jest` transformer incompatibility (see C6). Individual test file content and coverage were assessed by reading source code.
- **Whether `backend/.env` was committed to git history:** Appearing as tracked-modified (not untracked) in `git status` is the basis for the C4 risk flag, but `git log -- backend/.env` was not run. This must be verified manually.
- **Frontend build:** `vite build` was not run. Build errors, if any, are unknown.
- **Click tracking implementation:** Whether `email_campaign_recipients.click_count` is actually incremented anywhere was not verified — `owner.routes.js` is 800+ lines and was read only through line 150.
- **Review display on public storefront:** Whether approved reviews are rendered in `Storefront.jsx` was not verified in this audit pass.
- **PWYW frontend UI:** Whether `ProductPage.jsx` / `CheckoutPage.jsx` shows a custom price input for PWYW products — backend enforcement is verified; UI is not.
- **`buyer.routes.js` full read:** Session scoping pattern was inferred from consistent pattern in owner routes. Not read line-by-line.

### Parts of repo not reviewed in depth

- `backend/docs/` — four large code dump files; gitignored; not relevant to current state
- `frontend/src/pages/owner/` — 24 files. Key ones (Dashboard, Products, Analytics, Settings) reviewed in prior session. Not re-read in this audit pass; structure inferred from App.jsx and API surface.
- `backend/src/db/queries/analytics.queries.js`, `dashboard.queries.js`, `campaigns.queries.js`, `blog.queries.js` — SQL content not fully reviewed; tenant scoping assumed from consistent codebase pattern

### Observations

The codebase is internally consistent and the core architecture choices are intentional. The main operational risk is the gap between committed state and current working state (~160 uncommitted files). A close second is the demo checkout endpoint, which is a live vulnerability on all enabled stores.

The raw-SQL approach produces clear, predictable queries but will create maintenance friction as the schema grows. The absence of TypeScript is a meaningful choice — the query function argument shapes are large and varied, and there is no safety net at call sites.

The test suite is meaningful for what it covers (auth flows, webhook idempotency, delivery token lifecycle) but covers less than 30% of the endpoint surface. CI is correctly configured to run against a real DB, which gives the existing tests real confidence value.
