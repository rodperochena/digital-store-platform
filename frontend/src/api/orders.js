import { apiFetch } from "./client";

export function listOrders(storeId, ctx) {
  return apiFetch(`/api/stores/${storeId}/orders`, {}, ctx);
}

export function getOrder(storeId, orderId, ctx) {
  return apiFetch(`/api/stores/${storeId}/orders/${orderId}`, {}, ctx);
}

export function markOrderPaid(storeId, orderId, ctx) {
  return apiFetch(
    `/api/stores/${storeId}/orders/${orderId}/mark-paid`,
    { method: "PATCH" },
    ctx
  );
}

export function attachPaymentIntent(storeId, orderId, paymentIntentId, ctx) {
  return apiFetch(
    `/api/stores/${storeId}/orders/${orderId}/attach-payment-intent`,
    { method: "PATCH", body: JSON.stringify({ stripe_payment_intent_id: paymentIntentId }) },
    ctx
  );
}
