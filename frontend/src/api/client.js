/**
 * apiFetch — internal admin tool API calls.
 * ctx = { adminKey, apiBase }
 * Uses x-admin-key header.
 */
export async function apiFetch(path, options = {}, ctx = {}) {
  const { adminKey = "", apiBase = "" } = ctx;
  const url = `${apiBase}${path}`;

  const headers = {
    "Content-Type": "application/json",
    ...(adminKey ? { "x-admin-key": adminKey } : {}),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.message === "string") message = body.message;
    } catch {
      // ignore parse error
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * ownerFetch — owner-facing API calls.
 * ctx = { sessionToken, apiBase }
 * Uses Authorization: Bearer header.
 */
export async function ownerFetch(path, options = {}, ctx = {}) {
  const { sessionToken = "", apiBase = "" } = ctx;
  const url = `${apiBase}${path}`;

  const headers = {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.message === "string") message = body.message;
    } catch {
      // ignore parse error
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Verify backend reachability via GET /api/health.
 */
export async function checkHealth(apiBase) {
  let res;
  try {
    res = await fetch(`${apiBase}/api/health`);
  } catch {
    throw new Error("Cannot reach server. Check the API base URL.");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = body.db === "fail" ? "database is down" : `HTTP ${res.status}`;
    throw new Error(`Backend reachable but ${detail}.`);
  }

  return body;
}
