import { apiFetch } from "./client";

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
