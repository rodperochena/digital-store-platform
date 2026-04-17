import { createContext, useContext, useState, useEffect } from "react";

const OwnerContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function loadStr(key, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(key, value) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else if (typeof value === "string") {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore storage errors
  }
}

export function OwnerProvider({ children }) {
  const [sessionToken, _setSessionToken] = useState(() => loadStr("owner_session_token"));
  const [ownerStore, _setOwnerStore]     = useState(() => loadJSON("owner_store"));
  const [onboardingDone, _setOnboardingDone] = useState(
    () => loadStr("owner_onboarding_done") === "true"
  );
  // "unknown" | "valid" | "invalid"
  const [sessionStatus, setSessionStatus] = useState("unknown");

  // On mount (and whenever sessionToken changes): validate against backend.
  // Network errors are treated as valid (benefit of the doubt).
  useEffect(() => {
    if (!sessionToken) {
      setSessionStatus("unknown");
      return;
    }

    fetch(`${API_BASE}/api/owner/session`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((res) => {
        if (res.ok) {
          setSessionStatus("valid");
          return res.json();
        } else {
          setSessionStatus("invalid");
          return null;
        }
      })
      .then((data) => {
        if (data?.store?.onboarding_completed_at) {
          _setOnboardingDone(true);
          persist("owner_onboarding_done", "true");
        }
        if (data?.store) {
          persist("owner_store", data.store);
          _setOwnerStore(data.store);
        }
      })
      .catch(() => {
        // Network unreachable — do not penalise the user
        setSessionStatus("valid");
      });
  }, [sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSessionToken(v) {
    persist("owner_session_token", v);
    _setSessionToken(v);
  }

  function setOwnerStore(v) {
    persist("owner_store", v);
    _setOwnerStore(v);
  }

  function setOnboardingDone(v) {
    persist("owner_onboarding_done", v ? "true" : "false");
    _setOnboardingDone(Boolean(v));
  }

  function clearOwnerSession() {
    try {
      localStorage.removeItem("owner_session_token");
      localStorage.removeItem("owner_store");
      localStorage.removeItem("owner_onboarding_done");
    } catch {
      // ignore
    }
    _setSessionToken("");
    _setOwnerStore(null);
    _setOnboardingDone(false);
    setSessionStatus("unknown");
  }

  // Derived owner context object for ownerFetch calls
  const ownerCtx = { sessionToken, apiBase: API_BASE };

  return (
    <OwnerContext.Provider
      value={{
        apiBase: API_BASE,
        sessionToken,
        setSessionToken,
        ownerStore,
        setOwnerStore,
        onboardingDone,
        setOnboardingDone,
        sessionStatus,
        clearOwnerSession,
        ownerCtx,
      }}
    >
      {children}
    </OwnerContext.Provider>
  );
}

export function useOwner() {
  return useContext(OwnerContext);
}
