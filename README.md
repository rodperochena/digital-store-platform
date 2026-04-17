# Digital Store Platform

## Project Overview

Digital Store Platform is a multi-tenant SaaS for selling digital products. Each store gets its own slug-based URL, product catalog, and order management dashboard. Buyers complete checkout through Stripe, receive their files via a time-limited delivery link, and store owners manage everything through a React dashboard.

The platform handles the full lifecycle: store setup → product publishing → checkout → payment via Stripe webhook → file delivery by email → owner analytics.

**Tech stack:** Node.js, Express, PostgreSQL (hosted on Supabase), Stripe (payments), Resend (transactional email), React, Vite, CSS Modules.

---

## Repository Structure

```
digital-store-platform/
├── backend/
│   ├── migrations/
│   │   ├── up/          # Sequential SQL migration files (apply forward)
│   │   └── down/        # Rollback SQL for each migration
│   ├── scripts/
│   │   └── migrate.js   # Migration runner — reads up/ or down/ and tracks state in schema_migrations
│   ├── src/
│   │   ├── app.js       # Express app factory — wires middleware and routes
│   │   ├── server.js    # Process entry point — binds port, handles SIGTERM/SIGINT
│   │   ├── config/      # Shared constants (slug rules, reserved names)
│   │   ├── db/
│   │   │   ├── pool.js        # pg Pool singleton shared by all query files
│   │   │   └── queries/       # One file per domain — all SQL lives here, no inline queries in routes
│   │   ├── lib/               # Self-contained service modules (Stripe, mailer, fulfillment, storage, etc.)
│   │   ├── middleware/        # Express middleware (auth, CORS, rate limiting, error handling, etc.)
│   │   └── routes/            # Route definitions — one file per domain, thin handlers only
│   ├── tests/                 # Jest + Supertest integration tests (hit real DB)
│   ├── .env.example           # Template for all required environment variables
│   ├── jest.config.js
│   ├── package.json
│   └── server.js              # Entry point (loads .env, calls src/server.js)
│
└── frontend/
    ├── src/
    │   ├── api/          # All fetch calls to the backend — grouped by domain
    │   ├── components/   # Shared UI components (charts, alerts, spinners, etc.)
    │   ├── context/      # React context providers (owner session, etc.)
    │   ├── layout/       # Page shell components (owner dashboard layout, etc.)
    │   ├── pages/
    │   │   ├── owner/    # Owner dashboard pages (Analytics, Orders, Products, etc.)
    │   │   └── buyer/    # Buyer-facing pages (login, account, order history)
    │   ├── styles/       # Global CSS variables and base styles
    │   └── utils/        # Shared helpers (time formatting, currency, etc.)
    ├── .env              # VITE_API_BASE pointing to the backend
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Prerequisites

- **Node.js v20+** (the project uses `node --watch-path` which requires v18+; v20 is recommended)
- **PostgreSQL** — the project uses Supabase as the managed host, but any Postgres 14+ instance works
- **Stripe account** in test mode — you need a secret key and a webhook secret
- **Resend account** — only required when `MAILER_PROVIDER=resend`; local dev can use `MAILER_PROVIDER=log`

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in the values below.

### Server

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port the backend listens on. Defaults to `5051`. |
| `HOST` | No | Bind address. Defaults to `127.0.0.1`. |

### Database

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Full Postgres connection string. Get it from Supabase → Settings → Database → Connection string (Transaction pooler recommended). |
| `DATABASE_SSL` | No | Set to `true` for Supabase or any managed host. Set to `false` for a local Postgres with no SSL. |
| `DB_POOL_MAX` | No | Maximum connections in the pool. Default: `10`. |
| `DB_IDLE_TIMEOUT_MS` | No | Milliseconds before an idle connection is closed. Default: `30000`. |
| `DB_CONN_TIMEOUT_MS` | No | Milliseconds before a connection attempt times out. Default: `5000`. |
| `DB_KEEPALIVE_DELAY_MS` | No | TCP keepalive delay in milliseconds. Default: `10000`. |

### Tenancy

| Variable | Required | Description |
|---|---|---|
| `TENANCY_BASE_DOMAIN` | **Yes** | The domain stores are hosted under. Use `localhost` for local dev; use `yourplatform.com` in production. |

### Admin Auth

| Variable | Required | Description |
|---|---|---|
| `ADMIN_KEY` | **Yes** | Secret key required for platform-level admin routes (creating stores, enabling stores). Change this from the default before deploying. |

### CORS

| Variable | Required | Description |
|---|---|---|
| `CORS_ORIGIN` | No | Comma-separated list of allowed browser origins. Example: `http://localhost:3000`. Not needed if only serving from the same origin. |
| `CORS_CREDENTIALS` | No | Set to `1` to allow cookies/credentials in cross-origin requests. Default: `0`. |

### Proxy

| Variable | Required | Description |
|---|---|---|
| `TRUST_PROXY` | No | Set to `1` if running behind a reverse proxy (Render, Heroku, Nginx, Cloudflare). Enables correct `req.ip` parsing. |

### Supabase Storage (file uploads)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | **Yes** (for uploads) | Your Supabase project URL, e.g. `https://<project-id>.supabase.co`. Found in Supabase → Settings → API. |
| `SUPABASE_SERVICE_KEY` | **Yes** (for uploads) | Service-role key (not the anon key). Found in Supabase → Settings → API → `service_role`. This key bypasses RLS — never expose it to the browser. |

### Stripe

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Yes** | Secret key from Stripe dashboard. Use `sk_test_...` for test mode. Found at dashboard.stripe.com/test/apikeys. |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Webhook signing secret. Get it from `stripe listen --print-secret` (local dev) or the Stripe dashboard (production). |
| `APP_BASE_URL` | **Yes** | Frontend URL used as the base for Stripe's `success_url` and `cancel_url`. Example: `http://localhost:3000`. |
| `FRONTEND_URL` | **Yes** | Frontend URL used in password reset emails. Usually the same as `APP_BASE_URL`. Example: `http://localhost:3000`. |

### Fulfillment / Delivery Email

| Variable | Required | Description |
|---|---|---|
| `BACKEND_URL` | **Yes** | Backend's public URL, used to build delivery download links in emails. Example: `http://localhost:5051`. |
| `DELIVERY_TOKEN_TTL_HOURS` | No | How long delivery links stay valid, in hours. Default: `72`. |
| `MAILER_PROVIDER` | **Yes** | `log` (prints to console, no emails sent) or `resend` (sends real emails). Use `log` for local dev. |
| `MAILER_FROM` | **Yes** (for resend) | Sender email address shown to buyers. Example: `noreply@yourdomain.com`. |
| `RESEND_API_KEY` | **Yes** (for resend) | API key from resend.com. Only needed when `MAILER_PROVIDER=resend`. |

### Custom Domains

| Variable | Required | Description |
|---|---|---|
| `PLATFORM_CNAME_TARGET` | No | The hostname store owners should point their custom domain's CNAME to. Example: `stores.yourplatform.com`. |
| `PLATFORM_DOMAIN` | No | Your platform's own domain, used to distinguish custom domains from platform-hosted ones. Example: `yourplatform.com`. |

### Rate Limiting

| Variable | Required | Description |
|---|---|---|
| `RL_PUBLIC_DISABLED` | No | Set to `1` to disable the public API rate limiter. Useful in CI. |
| `RL_CHECKOUT_DISABLED` | No | Set to `1` to disable the checkout rate limiter. Useful in CI. |
| `RL_PUBLIC_WINDOW_MS` | No | Window size for public rate limiter in ms. Default: `60000`. |
| `RL_PUBLIC_MAX` | No | Max requests per window for public routes. Default: `300`. |
| `RL_CHECKOUT_WINDOW_MS` | No | Window size for checkout rate limiter in ms. Default: `60000`. |
| `RL_CHECKOUT_MAX` | No | Max requests per window for checkout. Default: `30`. |

---

## How to Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/your-org/digital-store-platform.git
cd digital-store-platform
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend (separate terminal)
cd ../frontend
npm install
```

### 3. Set up environment variables

```bash
cd backend
cp .env.example .env
# Edit .env and fill in DATABASE_URL, STRIPE_SECRET_KEY, etc.
```

For local dev, the minimum required values are:
- `DATABASE_URL` — your Supabase connection string
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — from your Stripe test dashboard
- `MAILER_PROVIDER=log` — so emails print to console instead of sending

### 4. Run database migrations

```bash
cd backend
npm run migrate
```

This applies all pending migrations in order. Safe to run multiple times — already-applied migrations are skipped.

### 5. Start the backend

```bash
cd backend
npm run dev
# Server starts at http://127.0.0.1:5051
```

For Stripe webhooks in local dev, run the Stripe CLI in a separate terminal:

```bash
stripe listen --forward-to http://127.0.0.1:5051/api/webhook/stripe
```

### 6. Start the frontend

```bash
cd frontend
npm run dev
# App starts at http://localhost:3000
```

---

## Database Migrations

Migrations live in `backend/migrations/up/` and are numbered sequentially. The migration runner tracks which ones have been applied in a `schema_migrations` table. Migrations must run in order — never skip one.

```bash
# Apply all pending migrations
npm run migrate

# Apply migrations up to a specific point
npm run migrate:up

# Check which migrations have been applied
npm run migrate:status
```

### Migration history

| # | File | What it does |
|---|---|---|
| 001 | `init_schema_migrations` | Creates the `schema_migrations` tracking table |
| 002 | `core_schema` | Creates stores, users, products, orders, and order_items — the foundation of the data model |
| 003 | `store_branding` | Adds currency, primary_color, and logo_url to stores |
| 004 | `orders_payment_intent_unique` | Adds a partial unique index on Stripe PaymentIntent ID per store to prevent duplicate payments |
| 005 | `enforce_stores_is_enabled` | Backfills NULL is_enabled values to FALSE and enforces NOT NULL |
| 006 | `fix_stores_is_enabled_not_null_default` | Reverts the NOT NULL constraint added in 005 (was too strict at that stage) |
| 007 | `owner_auth` | Adds owner_accounts and owner_sessions tables for per-store password auth |
| 008 | `orders_buyer_email_checkout_session` | Adds buyer_email and stripe_checkout_session_id to orders |
| 009 | `order_fulfillments` | Adds order_fulfillments table for tracking delivery token state and email send status |
| 010 | `products_image_url` | Adds a single image_url column to products (later superseded by image_urls array in 025) |
| 011 | `owner_name_fields` | Adds first_name and last_name to owner_accounts |
| 012 | `owner_email_unique` | Enforces case-insensitive email uniqueness on owner_accounts |
| 013 | `store_personality` | Adds tagline, description, and social link columns to stores |
| 014 | `storefront_config` | Adds JSONB storefront_config, secondary_color, and font_family to stores |
| 015 | `discount_codes` | Adds discount_codes table and wires it to orders; adds sales_count to products |
| 016 | `taxonomy_product_fields` | Creates taxonomy_types, taxonomy_categories, and taxonomy_tags tables with seed data; adds product classification columns |
| 017 | `password_reset_customers_sort_pause_onboarding` | Adds password reset tokens, store_customers table, product sort order, store pause mode, and onboarding tracking |
| 018 | `page_views` | Adds page_views table for storefront and product view analytics |
| 019 | `notifications` | Adds owner_notifications table for the in-dashboard notification bell |
| 020 | `reviews_sales_subscribers` | Adds product_reviews (with auto-update trigger for stats), store_sales, and store_subscribers tables |
| 021 | `blog_posts` | Adds blog_posts table with slug uniqueness per store and SEO fields |
| 022 | `email_campaigns` | Adds email_campaigns and email_campaign_recipients tables for broadcast email |
| 023 | `custom_domains` | Adds custom_domains table with a partial unique index ensuring one active domain per store |
| 024 | `fix_review_rating_constraint` | Widens the rating CHECK to allow 0 as a sentinel value for pending review invitations |
| 025 | `file_upload_pwyw` | Adds Supabase Storage file columns and pay-what-you-want pricing fields to products |
| 026 | `rls_indexes_apply_025` | Enables Row Level Security on all tables and adds missing foreign key indexes |
| 027 | `product_seo_cta_fields` | Adds short_description, seo_title, seo_description, slug, and cta_text to products |
| 028 | `buyer_accounts` | Adds buyer_accounts, buyer_sessions, and buyer_password_reset_tokens for buyer-side auth |
| 029 | `customer_country` | Adds a 2-char country column to buyer_accounts and store_customers |
| 030 | `orders_buyer_country` | Adds buyer_country to orders so purchase geography is captured at checkout |

---

## Running Tests

Tests are integration tests — they hit a real database. You need a working `DATABASE_URL` and `MAILER_PROVIDER=log` set in `backend/.env` (or exported in your shell).

```bash
# Run the full test suite
cd backend
npm test

# Run a single test file
npx jest tests/owner.auth.test.js

# Run with verbose output
npx jest --verbose
```

The test runner creates and tears down test stores automatically. Rate limiters are automatically disabled in test mode.

> **Note:** `MAILER_PROVIDER=log` must be set when running tests. If it's set to `resend`, tests will attempt to send real emails and will likely fail.

---

## Architecture Notes

### Multi-tenancy via store_id

Every table that holds store-specific data has a `store_id` column. Every query scopes by `store_id` explicitly — there is no shared state between stores. The slug is used for public-facing URLs; all internal operations use the UUID.

### Server-side sessions over JWT

Owner sessions are stored in `owner_sessions` in the database. The raw token is never stored — only a SHA-256 hash of it. This means sessions can be revoked immediately by deleting the row, which JWTs can't do without a blocklist. The trade-off is a DB read on every authenticated request, which is acceptable given our load profile.

### Append-only orders

Orders are never deleted. Status transitions (pending → paid → refunded) are the only mutations allowed. This gives us a reliable audit trail and makes reconciliation with Stripe straightforward.

### Delivery URLs are never exposed publicly

The `delivery_url` field on products (legacy) and the Supabase Storage key are never sent to buyers directly. Instead, the fulfillment system generates a time-limited token, stores its hash, and sends a link to `/api/deliver/:token`. The backend validates the token, fetches the file, and streams it — the buyer never sees the real file location.

### Stripe webhook as source of truth for payments

The checkout flow creates a pending order, redirects the buyer to Stripe, and waits. The `checkout.session.completed` webhook is the only thing that marks an order as paid and triggers fulfillment. The frontend success page is cosmetic — it never marks anything paid. This means if a webhook is delayed, the order stays pending until it arrives, which is the correct behavior.

### Fire-and-forget emails

Delivery emails, seller notification emails, and campaign emails are all sent asynchronously after the HTTP response has been returned. Errors are logged but never bubble up to the caller. This keeps response times fast and avoids coupling order fulfillment to email provider uptime. The downside is that email failures are silent to the buyer — the dashboard and notification system are how owners learn about failures.

---

## Team

- **Rodrigo Perochena** — Project Manager and Backend Development
- **Ryan Devilmat** — Frontend Development
- **Andrew Doubrava** — Integrations and Email Services
- **Noah Barker** — System Design, Testing, and Documentation
