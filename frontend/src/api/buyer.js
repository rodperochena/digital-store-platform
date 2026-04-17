const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (import.meta.env.DEV) headers["X-Test-Country"] = "US";
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function put(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function buyerRegister(slug, email, password, displayName, marketingOptIn) {
  return post("/api/buyer/register", {
    slug,
    email,
    password,
    display_name: displayName || undefined,
    marketing_opt_in: !!marketingOptIn,
  });
}

export async function buyerLogin(slug, email, password) {
  return post("/api/buyer/login", { slug, email, password });
}

export async function buyerForgotPassword(slug, email) {
  // Always returns { ok: true } — no error thrown on missing account (no enumeration)
  const res = await fetch(`${API_BASE}/api/buyer/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, email }),
  });
  return res.json().catch(() => ({ ok: true }));
}

export async function buyerResetPassword(token, password) {
  return post("/api/buyer/reset-password", { token, password });
}

// ── Session & Profile ─────────────────────────────────────────────────────────

export async function getBuyerProfile(token) {
  return get("/api/buyer/profile", token);
}

export async function updateBuyerProfile(token, updates) {
  return put("/api/buyer/profile", updates, token);
}

export async function buyerChangePassword(token, currentPassword, newPassword) {
  return post("/api/buyer/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  }, token);
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function getBuyerOrders(token) {
  return get("/api/buyer/orders", token);
}

export async function getBuyerOrder(token, orderId) {
  return get(`/api/buyer/orders/${orderId}`, token);
}
