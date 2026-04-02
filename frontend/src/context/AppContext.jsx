import { createContext, useContext, useState } from "react";

const AppContext = createContext(null);

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage errors
  }
}

export function AppProvider({ children }) {
  const [adminKey, _setAdminKey] = useState(() => load("adminKey", ""));
  const [apiBase, _setApiBase] = useState(
    () => load("apiBase", import.meta.env.VITE_API_BASE || "http://127.0.0.1:5051")
  );
  const [activeStore, _setActiveStore] = useState(() => {
    try {
      const raw = localStorage.getItem("activeStore");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  function setAdminKey(v) {
    save("adminKey", v);
    _setAdminKey(v);
  }

  function setApiBase(v) {
    save("apiBase", v);
    _setApiBase(v);
  }

  function setActiveStore(v) {
    try {
      if (v === null || v === undefined) {
        localStorage.removeItem("activeStore");
      } else {
        localStorage.setItem("activeStore", JSON.stringify(v));
      }
    } catch {
      // ignore
    }
    _setActiveStore(v);
  }

  return (
    <AppContext.Provider
      value={{ adminKey, setAdminKey, apiBase, setApiBase, activeStore, setActiveStore }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
