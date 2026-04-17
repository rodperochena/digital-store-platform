"use strict";
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const CartContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

export function CartProvider({ storeSlug, children }) {
  // enrichedItems shape: [{ productId, title, price_cents, image_url, currency, quantity }]
  const [enrichedItems, setEnrichedItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = `cart_${storeSlug}`;

  // On mount: restore from localStorage and fetch fresh product data
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setHydrated(true);
      return;
    }
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      setHydrated(true);
      return;
    }
    if (!Array.isArray(saved) || saved.length === 0) {
      setHydrated(true);
      return;
    }

    // Fetch fresh product data so prices/images are always current
    Promise.all(
      saved.map(({ productId, quantity }) =>
        fetch(
          `${API_BASE}/api/store/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productId)}`
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => (data?.product ? { ...data.product, quantity } : null))
          .catch(() => null)
      )
    ).then((results) => {
      const items = results
        .filter(Boolean)
        .map((p) => ({
          productId: p.id,
          title: p.title,
          price_cents: p.price_cents,
          image_url: p.image_url ?? null,
          currency: p.currency,
          quantity: p.quantity,
        }));
      setEnrichedItems(items);
      setHydrated(true);
    });
  }, [storeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist minimal data to localStorage after any change (post-hydration)
  useEffect(() => {
    if (!hydrated) return;
    const minimal = enrichedItems.map(({ productId, quantity }) => ({ productId, quantity }));
    if (minimal.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(minimal));
    }
  }, [enrichedItems, hydrated, storageKey]);

  const addItem = useCallback((product) => {
    setEnrichedItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId:   product.id,
          title:       product.title,
          price_cents: product.price_cents,
          image_url:   product.image_url ?? null,
          currency:    product.currency,
          quantity:    1,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setEnrichedItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setEnrichedItems((prev) => prev.filter((i) => i.productId !== productId));
    } else {
      setEnrichedItems((prev) =>
        prev.map((i) => (i.productId === productId ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setEnrichedItems([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const itemCount = useMemo(
    () => enrichedItems.reduce((sum, i) => sum + i.quantity, 0),
    [enrichedItems]
  );

  const subtotalCents = useMemo(
    () => enrichedItems.reduce((sum, i) => sum + i.price_cents * i.quantity, 0),
    [enrichedItems]
  );

  return (
    <CartContext.Provider
      value={{ items: enrichedItems, addItem, removeItem, updateQuantity, clearCart, itemCount, subtotalCents, hydrated }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
