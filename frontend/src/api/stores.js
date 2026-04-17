import { apiFetch } from "./client";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

async function publicFetch(url) {
  const res  = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export function listPublicBlogPosts(slug, { limit = 10, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  return publicFetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog?${params.toString()}`);
}

export function getPublicBlogPost(slug, postSlug) {
  return publicFetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog/${encodeURIComponent(postSlug)}`);
}

export function getRecentPublicBlogPosts(slug, limit = 3) {
  return publicFetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog/recent?limit=${limit}`);
}

export function createStore(body, ctx) {
  return apiFetch("/api/stores", { method: "POST", body: JSON.stringify(body) }, ctx);
}

export function enableStore(storeId, ctx) {
  return apiFetch(`/api/stores/${storeId}/enable`, { method: "PATCH" }, ctx);
}

export function getStoreSettings(storeId, ctx) {
  return apiFetch(`/api/stores/${storeId}/settings`, {}, ctx);
}

export function updateStoreSettings(storeId, body, ctx) {
  return apiFetch(
    `/api/stores/${storeId}/settings`,
    { method: "PATCH", body: JSON.stringify(body) },
    ctx
  );
}
