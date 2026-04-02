/**
 * Owner-facing API layer.
 * All calls use Bearer token auth via ownerFetch.
 * ctx = { sessionToken, apiBase }
 */
import { ownerFetch } from "./client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

// ── Public (no auth) ──────────────────────────────────────────────────────────

/** Check if a store username (slug) is available. Returns { available: boolean } */
export async function checkSlug(slug) {
  const res = await fetch(
    `${API_BASE}/api/owner/check-slug/${encodeURIComponent(slug)}`
  );
  if (!res.ok) throw new Error("Could not check availability");
  return res.json();
}

/** Check if an email is already registered. Returns { exists: boolean } */
export async function checkEmail(email) {
  const res = await fetch(
    `${API_BASE}/api/owner/check-email/${encodeURIComponent(email)}`
  );
  if (!res.ok) throw new Error("Could not check email");
  return res.json();
}

// ── Auth (no session required) ────────────────────────────────────────────────

export function claimAccess(body) {
  return ownerFetch(
    "/api/owner/claim-access",
    { method: "POST", body: JSON.stringify(body) },
    { apiBase: API_BASE }
  );
}

export function ownerLogin(body) {
  return ownerFetch(
    "/api/owner/login",
    { method: "POST", body: JSON.stringify(body) },
    { apiBase: API_BASE }
  );
}

// ── Auth (session required) ───────────────────────────────────────────────────

export function ownerLogout(ctx) {
  return ownerFetch("/api/owner/logout", { method: "POST" }, ctx);
}

export function getOwnerSession(ctx) {
  return ownerFetch("/api/owner/session", {}, ctx);
}

export function fetchOwnerStats(ctx) {
  return ownerFetch("/api/owner/stats", {}, ctx);
}

export function getOwnerAccount(ctx) {
  return ownerFetch("/api/owner/account", {}, ctx);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export function getOwnerStore(ctx) {
  return ownerFetch("/api/owner/store", {}, ctx);
}

export function updateOwnerStore(body, ctx) {
  return ownerFetch(
    "/api/owner/store",
    { method: "PATCH", body: JSON.stringify(body) },
    ctx
  );
}

export function updateOwnerAccount(body, ctx) {
  return ownerFetch(
    "/api/owner/account",
    { method: "PATCH", body: JSON.stringify(body) },
    ctx
  );
}

// ── Products ──────────────────────────────────────────────────────────────────

export function listOwnerProducts(ctx) {
  return ownerFetch("/api/owner/products", {}, ctx);
}

export function createOwnerProduct(body, ctx) {
  return ownerFetch(
    "/api/owner/products",
    { method: "POST", body: JSON.stringify(body) },
    ctx
  );
}

export function updateOwnerProduct(productId, data, ctx) {
  return ownerFetch(
    `/api/owner/products/${productId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    ctx
  );
}

export function deleteOwnerProduct(productId, ctx) {
  return ownerFetch(
    `/api/owner/products/${productId}`,
    { method: "DELETE" },
    ctx
  );
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function listOwnerOrders(ctx) {
  return ownerFetch("/api/owner/orders", {}, ctx);
}

export function getOwnerOrder(orderId, ctx) {
  return ownerFetch(`/api/owner/orders/${orderId}`, {}, ctx);
}

export function resendDelivery(orderId, ctx) {
  return ownerFetch(
    `/api/owner/orders/${orderId}/resend-delivery`,
    { method: "POST" },
    ctx
  );
}

// ── Dev-only: simulate payment ────────────────────────────────────────────────

export function devMarkOrderPaid(orderId, ctx) {
  return ownerFetch(
    `/api/dev/orders/${orderId}/mark-paid`,
    { method: "POST" },
    ctx
  );
}
