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

export function fetchDashboardStats(ctx) {
  return ownerFetch("/api/owner/dashboard-stats", {}, ctx);
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

export function changePassword(ctx, { currentPassword, newPassword }) {
  return ownerFetch(
    "/api/owner/account/password",
    { method: "PATCH", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) },
    ctx
  );
}

// ── Products ──────────────────────────────────────────────────────────────────

export function listOwnerProducts(ctx) {
  return ownerFetch("/api/owner/products", {}, ctx);
}

export function getOwnerProduct(productId, ctx) {
  return ownerFetch(`/api/owner/products/${productId}`, {}, ctx);
}

export function listOwnerProductsWithStats(ctx) {
  return ownerFetch("/api/owner/products-with-stats", {}, ctx);
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

/**
 * Upload a deliverable file (ZIP, PDF, EPUB, …).
 * Returns { key, size, name, sizeDisplay }.
 */
export async function uploadDeliverableFile(file, ctx) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${ctx.apiBase}/api/owner/products/upload-deliverable`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.sessionToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Upload failed");
  return data;
}

/**
 * Upload a product cover image.
 * Returns { url } — a public image URL.
 */
export async function uploadProductImage(file, productId, ctx) {
  const formData = new FormData();
  formData.append("image", file);
  if (productId) formData.append("product_id", productId);
  const res = await fetch(`${ctx.apiBase}/api/owner/products/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.sessionToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Image upload failed");
  return data;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function listOwnerOrders(ctx, { search, status, dateFrom, dateTo, productId, sortBy } = {}) {
  const params = new URLSearchParams();
  if (search)    params.set("search",     search);
  if (status)    params.set("status",     status);
  if (dateFrom)  params.set("date_from",  dateFrom);
  if (dateTo)    params.set("date_to",    dateTo);
  if (productId) params.set("product_id", productId);
  if (sortBy)    params.set("sort_by",    sortBy);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return ownerFetch(`/api/owner/orders${qs}`, {}, ctx);
}

export function getOrdersSummary(ctx, { search, status, dateFrom, dateTo, productId } = {}) {
  const params = new URLSearchParams();
  if (search)    params.set("search",     search);
  if (status)    params.set("status",     status);
  if (dateFrom)  params.set("date_from",  dateFrom);
  if (dateTo)    params.set("date_to",    dateTo);
  if (productId) params.set("product_id", productId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return ownerFetch(`/api/owner/orders/summary${qs}`, {}, ctx);
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

// ── Analytics ─────────────────────────────────────────────────────────────────

export function fetchAnalytics(ctx, period = "30d") {
  return ownerFetch(`/api/owner/analytics?period=${encodeURIComponent(period)}`, {}, ctx);
}

export function getAnalyticsOverview(ctx, { period = "30d", productId, startDate, endDate, groupBy } = {}) {
  const params = new URLSearchParams({ period });
  if (productId) params.set("product_id", productId);
  if (startDate && endDate) {
    // Send full-day ISO timestamps using local timezone boundaries
    const s = new Date(startDate.length === 10 ? startDate + "T00:00:00" : startDate);
    const e = new Date(endDate.length   === 10 ? endDate   + "T23:59:59.999" : endDate);
    params.set("start_date", s.toISOString());
    params.set("end_date",   e.toISOString());
  }
  if (groupBy) params.set("group_by", groupBy);
  return ownerFetch(`/api/owner/analytics/overview?${params.toString()}`, {}, ctx);
}

export function getAnalyticsViews(ctx, { period = "30d", productId } = {}) {
  const params = new URLSearchParams({ period });
  if (productId) params.set("product_id", productId);
  return ownerFetch(`/api/owner/analytics/views?${params.toString()}`, {}, ctx);
}

// ── Discounts ──────────────────────────────────────────────────────────────────

export function listDiscountCodes(ctx) {
  return ownerFetch("/api/owner/discounts", {}, ctx);
}

export function createDiscountCode(body, ctx) {
  return ownerFetch("/api/owner/discounts", { method: "POST", body: JSON.stringify(body) }, ctx);
}

export function updateDiscountCode(id, body, ctx) {
  return ownerFetch(`/api/owner/discounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }, ctx);
}

export function deleteDiscountCode(id, ctx) {
  return ownerFetch(`/api/owner/discounts/${id}`, { method: "DELETE" }, ctx);
}

// ── Customers ──────────────────────────────────────────────────────────────────

export function backfillCustomers(ctx) {
  return ownerFetch("/api/owner/customers/backfill", { method: "POST" }, ctx);
}

export function getCustomersSummary(ctx) {
  return ownerFetch("/api/owner/customers/summary", {}, ctx);
}

export function listCustomers(ctx, { search, filter, sortBy } = {}) {
  const params = new URLSearchParams();
  if (search)  params.set("search",   search);
  if (filter)  params.set("filter",   filter);
  if (sortBy)  params.set("sort_by",  sortBy);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return ownerFetch(`/api/owner/customers${qs}`, {}, ctx);
}

export async function exportCustomersCsv(ctx) {
  const base = ctx.apiBase ?? import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";
  const res = await fetch(`${base}/api/owner/customers/export-csv`, {
    headers: {
      Authorization: `Bearer ${ctx.sessionToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

// ── Product extras ─────────────────────────────────────────────────────────────

export function duplicateProduct(productId, ctx) {
  return ownerFetch(
    `/api/owner/products/${productId}/duplicate`,
    { method: "POST" },
    ctx
  );
}

export function reorderProducts(order, ctx) {
  return ownerFetch(
    "/api/owner/products/reorder",
    { method: "PATCH", body: JSON.stringify({ order }) },
    ctx
  );
}

// ── Password reset ─────────────────────────────────────────────────────────────

export function requestPasswordReset(email) {
  return ownerFetch(
    "/api/owner/forgot-password",
    { method: "POST", body: JSON.stringify({ email }) },
    { apiBase: API_BASE }
  );
}

export function resetPassword(token, password) {
  return ownerFetch(
    "/api/owner/reset-password",
    { method: "POST", body: JSON.stringify({ token, password }) },
    { apiBase: API_BASE }
  );
}

// ── Notifications ──────────────────────────────────────────────────────────────

export function getNotifications(ctx, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (unreadOnly) params.set("unread_only", "true");
  return ownerFetch(`/api/owner/notifications?${params.toString()}`, {}, ctx);
}

export function getUnreadCount(ctx) {
  return ownerFetch("/api/owner/notifications/unread-count", {}, ctx);
}

export function markNotificationRead(ctx, notificationId) {
  return ownerFetch(`/api/owner/notifications/${notificationId}/read`, { method: "PATCH" }, ctx);
}

export function markAllNotificationsRead(ctx) {
  return ownerFetch("/api/owner/notifications/read-all", { method: "PATCH" }, ctx);
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export function listReviews(ctx, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  return ownerFetch(`/api/owner/reviews?${params.toString()}`, {}, ctx);
}

export function updateReview(ctx, reviewId, { is_approved }) {
  return ownerFetch(`/api/owner/reviews/${reviewId}`, { method: "PATCH", body: JSON.stringify({ is_approved }) }, ctx);
}

export function deleteReview(ctx, reviewId) {
  return ownerFetch(`/api/owner/reviews/${reviewId}`, { method: "DELETE" }, ctx);
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export function listSales(ctx) {
  return ownerFetch("/api/owner/sales", {}, ctx);
}

export function createSale(ctx, body) {
  return ownerFetch("/api/owner/sales", { method: "POST", body: JSON.stringify(body) }, ctx);
}

export function updateSale(ctx, saleId, body) {
  return ownerFetch(`/api/owner/sales/${saleId}`, { method: "PATCH", body: JSON.stringify(body) }, ctx);
}

export function deleteSale(ctx, saleId) {
  return ownerFetch(`/api/owner/sales/${saleId}`, { method: "DELETE" }, ctx);
}

// ── Subscribers ───────────────────────────────────────────────────────────────

export function listSubscribers(ctx, { limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  return ownerFetch(`/api/owner/subscribers?${params.toString()}`, {}, ctx);
}

export function countSubscribers(ctx) {
  return ownerFetch("/api/owner/subscribers/count", {}, ctx);
}

export function deleteSubscriber(ctx, subscriberId) {
  return ownerFetch(`/api/owner/subscribers/${subscriberId}`, { method: "DELETE" }, ctx);
}

export function exportSubscribersCSV(ctx) {
  const { apiBase, sessionToken } = ctx;
  const base = apiBase ?? API_BASE;
  return fetch(`${base}/api/owner/subscribers/export-csv`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }
    return res.blob();
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export function completeOnboarding(ctx) {
  return ownerFetch("/api/owner/complete-onboarding", { method: "POST" }, ctx);
}

// ── Blog posts ────────────────────────────────────────────────────────────────

export function listBlogPosts(ctx, { status, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (status) params.set("status", status);
  return ownerFetch(`/api/owner/blog?${params.toString()}`, {}, ctx);
}

export function getBlogPost(ctx, postId) {
  return ownerFetch(`/api/owner/blog/${postId}`, {}, ctx);
}

export function createBlogPost(ctx, data) {
  return ownerFetch("/api/owner/blog", { method: "POST", body: JSON.stringify(data) }, ctx);
}

export function updateBlogPost(ctx, postId, data) {
  return ownerFetch(`/api/owner/blog/${postId}`, { method: "PATCH", body: JSON.stringify(data) }, ctx);
}

export function deleteBlogPost(ctx, postId) {
  return ownerFetch(`/api/owner/blog/${postId}`, { method: "DELETE" }, ctx);
}

export function checkBlogSlugAvailable(ctx, slug, excludePostId = null) {
  const params = new URLSearchParams();
  if (excludePostId) params.set("exclude", excludePostId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return ownerFetch(`/api/owner/blog/check-slug/${encodeURIComponent(slug)}${qs}`, {}, ctx);
}

// ── Custom domains ────────────────────────────────────────────────────────────

export function getDomain(ctx) {
  return ownerFetch("/api/owner/domain", {}, ctx);
}

export function addDomain(ctx, domain) {
  return ownerFetch("/api/owner/domain", { method: "POST", body: JSON.stringify({ domain }) }, ctx);
}

export function verifyDomain(ctx) {
  return ownerFetch("/api/owner/domain/verify", { method: "POST" }, ctx);
}

export function removeDomain(ctx) {
  return ownerFetch("/api/owner/domain", { method: "DELETE" }, ctx);
}

// ── Email campaigns ───────────────────────────────────────────────────────────

export function listCampaigns(ctx, { limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  return ownerFetch(`/api/owner/campaigns?${params.toString()}`, {}, ctx);
}

export function getCampaign(ctx, campaignId) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}`, {}, ctx);
}

export function createCampaign(ctx, data) {
  return ownerFetch("/api/owner/campaigns", { method: "POST", body: JSON.stringify(data) }, ctx);
}

export function updateCampaign(ctx, campaignId, data) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify(data) }, ctx);
}

export function deleteCampaign(ctx, campaignId) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}`, { method: "DELETE" }, ctx);
}

export function sendCampaign(ctx, campaignId) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}/send`, { method: "POST" }, ctx);
}

export function getCampaignStats(ctx, campaignId) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}/stats`, {}, ctx);
}

export function duplicateCampaign(ctx, campaignId) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}/duplicate`, { method: "POST" }, ctx);
}

export function previewCampaign(ctx, campaignId, to) {
  return ownerFetch(`/api/owner/campaigns/${campaignId}/preview`, { method: "POST", body: JSON.stringify({ to }) }, ctx);
}

// ── Orders CSV export ─────────────────────────────────────────────────────────

export async function exportOrdersCsv(ctx, { search, status, dateFrom, dateTo, productId, sortBy } = {}) {
  const base = ctx.apiBase ?? import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";
  const params = new URLSearchParams();
  if (search)    params.set("search",     search);
  if (status)    params.set("status",     status);
  if (dateFrom)  params.set("date_from",  dateFrom);
  if (dateTo)    params.set("date_to",    dateTo);
  if (productId) params.set("product_id", productId);
  if (sortBy)    params.set("sort_by",    sortBy);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${base}/api/owner/orders/export-csv${qs}`, {
    headers: { Authorization: `Bearer ${ctx.sessionToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

// ── Products CSV import / export ──────────────────────────────────────────────

export async function exportProductsCsv(ctx) {
  const base = ctx.apiBase ?? import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";
  const res = await fetch(`${base}/api/owner/products/export-csv`, {
    headers: { Authorization: `Bearer ${ctx.sessionToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

export async function downloadProductsCsvTemplate(ctx) {
  const base = ctx.apiBase ?? import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";
  const res = await fetch(`${base}/api/owner/products/csv-template`, {
    headers: { Authorization: `Bearer ${ctx.sessionToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.blob();
}

export function importProductsCsv(ctx, csvContent) {
  return ownerFetch(
    "/api/owner/products/import-csv",
    { method: "POST", body: JSON.stringify({ csvContent }) },
    ctx
  );
}

export function bulkUpdateProducts(ctx, productIds, updates) {
  return ownerFetch(
    "/api/owner/products/bulk-update",
    { method: "PATCH", body: JSON.stringify({ product_ids: productIds, updates }) },
    ctx
  );
}

export function bulkDeleteProducts(ctx, productIds) {
  return ownerFetch(
    "/api/owner/products/bulk-delete",
    { method: "POST", body: JSON.stringify({ product_ids: productIds }) },
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
