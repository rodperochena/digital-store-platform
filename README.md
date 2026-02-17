# Digital Store Platform

Multi-tenant digital storefront API built with Node.js + Express + PostgreSQL.

Supports:
- Admin APIs for stores, products, and orders
- Public storefront APIs via path-based routing and host-based tenant routing
- Standardized validation and error responses

## Run locally

```bash
cd backend
npm install
npm run dev

Server runs at:
- http://127.0.0.1:5051

---

## Key endpoints

### Health
- GET /api/health

### Stores
- POST /api/stores
- PATCH /api/stores/:storeId/enable

### Products
- POST /api/stores/:storeId/products
- GET  /api/stores/:storeId/products

### Orders
- POST  /api/stores/:storeId/orders
- GET   /api/stores/:storeId/orders?limit=10
- GET   /api/stores/:storeId/orders/:orderId
- PATCH /api/stores/:storeId/orders/:orderId/mark-paid
- PATCH /api/stores/:storeId/orders/:orderId/attach-payment-intent

---

## Storefront APIs

### Path-based routing
- GET /api/store/:slug/meta
- GET /api/store/:slug/products
- GET /api/store/:slug/products/:productId

### Host-based tenant routing
- GET /api/storefront/meta
- GET /api/storefront/products

Example:

```bash
curl -H "Host: dup-test-2.localhost" http://127.0.0.1:5051/api/storefront/meta

## Error Response Format
### All errors follow a standard structure
{
  "error": true,
  "code": "BAD_REQUEST",
  "message": "Invalid storeId",
  "path": "/api/stores/not-a-uuid/orders"
}

#Author: Rodrigo Perochena

