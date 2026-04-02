import { apiFetch } from "./client";

export function listProducts(storeId, ctx) {
  return apiFetch(`/api/stores/${storeId}/products`, {}, ctx);
}

export function createProduct(storeId, body, ctx) {
  return apiFetch(
    `/api/stores/${storeId}/products`,
    { method: "POST", body: JSON.stringify(body) },
    ctx
  );
}
