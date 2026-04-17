import { createContext, useContext, useState, useEffect } from "react";

const BuyerContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

export function BuyerProvider({ storeSlug, children }) {
  const [buyerToken, setBuyerToken] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Storage key is per-store to support multi-store logins in the same browser
  const storageKey = `buyer_session_${storeSlug}`;

  useEffect(() => {
    const savedToken = localStorage.getItem(storageKey);
    if (savedToken) {
      validateSession(savedToken);
    } else {
      setLoading(false);
    }
  }, [storeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function validateSession(token) {
    try {
      const res = await fetch(`${API_BASE}/api/buyer/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBuyerToken(token);
        setBuyer(data);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setLoading(false);
    }
  }

  function login(token, buyerData) {
    localStorage.setItem(storageKey, token);
    setBuyerToken(token);
    setBuyer(buyerData);
  }

  async function logout() {
    if (buyerToken) {
      try {
        await fetch(`${API_BASE}/api/buyer/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${buyerToken}` },
        });
      } catch {
        // fire-and-forget
      }
    }
    localStorage.removeItem(storageKey);
    setBuyerToken(null);
    setBuyer(null);
  }

  function updateBuyer(updates) {
    setBuyer((prev) => ({ ...prev, ...updates }));
  }

  return (
    <BuyerContext.Provider
      value={{
        token: buyerToken,
        buyer,
        loading,
        isLoggedIn: !!buyerToken && !!buyer,
        apiBase: API_BASE,
        storeSlug,
        login,
        logout,
        updateBuyer,
      }}
    >
      {children}
    </BuyerContext.Provider>
  );
}

export function useBuyer() {
  return useContext(BuyerContext);
}
