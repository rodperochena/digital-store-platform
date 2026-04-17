/**
 * Lightweight page-view tracking.
 * All calls are fire-and-forget — they never throw or reject.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function getOrCreateVisitorId() {
  try {
    let id = localStorage.getItem("dsp_visitor_id");
    if (!id) {
      // 16-char hex string
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("dsp_visitor_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Track a page view. Fire-and-forget — never throws.
 * @param {string} slug  - store slug
 * @param {{ pageType: 'storefront'|'product', productId?: string|null }} opts
 */
export function trackPageView(slug, { pageType, productId = null }) {
  try {
    const visitorId = getOrCreateVisitorId();
    const referrer  = typeof document !== "undefined" ? (document.referrer || null) : null;

    const headers = { "Content-Type": "application/json" };
    if (import.meta.env.DEV) {
      // Send a test country header so dev page views record ip_country
      // Falls back to "US" if no override is stored
      const testCountry = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("dsp_test_country")) || "US";
      headers["X-Test-Country"] = testCountry;
    }

    fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/track`, {
      method:  "POST",
      headers,
      body:    JSON.stringify({
        page_type:  pageType,
        product_id: productId  || null,
        referrer:   referrer   || null,
        visitor_id: visitorId  || null,
      }),
    }).catch(() => {});
  } catch {
    // never throw
  }
}
