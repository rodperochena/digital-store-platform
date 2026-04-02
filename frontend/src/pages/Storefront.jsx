"use strict";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import styles from "./Storefront.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

async function fetchJSON(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof body.message === "string" ? body.message : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function fetchWithPost(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof body.message === "string" ? body.message : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function formatPrice(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
}

function ProductCard({ product, accentColor, onSelect, onBuy }) {
  const initial = product.title.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = product.image_url && !imgError;

  return (
    <div
      className={styles.productCard}
      style={{ "--card-accent": accentColor }}
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(product)}
    >
      <div className={styles.productThumb} style={showImage ? undefined : { background: accentColor + "18" }}>
        {showImage ? (
          <img
            src={product.image_url}
            alt={product.title}
            className={styles.thumbImg}
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={styles.productInitial} style={{ color: accentColor }}>{initial}</span>
        )}
      </div>
      <div className={styles.productBody}>
        <h2 className={styles.productTitle}>{product.title}</h2>
        {product.description && (
          <p className={styles.productDesc}>{product.description}</p>
        )}
      </div>
      <div className={styles.productFooter}>
        <span className={styles.productPrice} style={{ color: accentColor }}>
          {formatPrice(product.price_cents, product.currency)}
        </span>
        <button
          type="button"
          className={styles.buyBtn}
          style={{ background: accentColor }}
          onClick={(e) => { e.stopPropagation(); onBuy(product); }}
        >
          Buy now
        </button>
      </div>
    </div>
  );
}

function DetailModal({ product, accentColor, onClose, onBuy }) {
  const initial = product.title.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = product.image_url && !imgError;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{product.title}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div
          className={styles.detailThumb}
          style={showImage ? undefined : { background: accentColor + "18" }}
        >
          {showImage ? (
            <img
              src={product.image_url}
              alt={product.title}
              className={styles.thumbImg}
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={styles.detailInitial} style={{ color: accentColor }}>{initial}</span>
          )}
        </div>
        {product.description && (
          <p className={styles.detailDesc}>{product.description}</p>
        )}
        <div className={styles.detailFooter}>
          <span className={styles.modalPrice} style={{ color: accentColor }}>
            {formatPrice(product.price_cents, product.currency)}
          </span>
          <button
            type="button"
            className={styles.buyBtn}
            style={{ background: accentColor }}
            onClick={onBuy}
          >
            Buy now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Storefront() {
  const { slug } = useParams();

  const [store, setStore]           = useState(null);
  const [products, setProducts]     = useState(null);
  const [storeError, setStoreError] = useState(null);

  // Detail modal
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Checkout state
  const [buyingProduct, setBuyingProduct]     = useState(null);
  const [buyerEmail, setBuyerEmail]           = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storeMeta, productsData] = await Promise.all([
          fetchJSON(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`),
          fetchJSON(`${API_BASE}/api/store/${encodeURIComponent(slug)}/products`),
        ]);
        if (!cancelled) {
          setStore(storeMeta.store);
          setProducts(productsData.products ?? []);
        }
      } catch (err) {
        if (!cancelled) setStoreError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  function openCheckout(product) {
    setSelectedProduct(null);
    setBuyingProduct(product);
    setBuyerEmail("");
    setCheckoutError(null);
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setCheckoutError(null);

    const email = buyerEmail.trim();
    if (!email) {
      setCheckoutError("Email is required.");
      return;
    }

    setCheckoutLoading(true);
    try {
      const data = await fetchWithPost(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/checkout/session`,
        {
          items: [{ product_id: buyingProduct.id, quantity: 1 }],
          buyer_email: email,
        }
      );
      // Redirect to Stripe Checkout — do not mark order paid here
      window.location.href = data.checkout_url;
      // Loading state intentionally not reset: page is navigating away
    } catch (err) {
      setCheckoutError(err.message);
      setCheckoutLoading(false);
    }
  }

  if (storeError) {
    return (
      <div className={styles.shell}>
        <div className={styles.errorPage}>
          <h1>Store not found</h1>
          <p>{storeError}</p>
        </div>
      </div>
    );
  }

  if (!store || !products) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingPage}>
          <Spinner size={24} />
          <span>Loading store…</span>
        </div>
      </div>
    );
  }

  const accentColor = store.primary_color || "#0d6efd";

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header} style={{ borderBottomColor: accentColor }}>
        <div className={styles.headerInner}>
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className={styles.logo} />
          ) : (
            <div className={styles.logoPlaceholder} style={{ background: accentColor }}>
              {store.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className={styles.storeName}>{store.name}</h1>
        </div>
      </header>

      <main className={styles.main}>
        {products.length === 0 ? (
          <div className={styles.emptyProducts}>
            <p>No products available yet.</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                accentColor={accentColor}
                onSelect={setSelectedProduct}
                onBuy={openCheckout}
              />
            ))}
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerName}>{store.name}</span>
        <span className={styles.footerSep} aria-hidden="true">·</span>
        <span className={styles.footerPowered}>Powered by Digital Store</span>
      </footer>

      {/* Product detail modal */}
      {selectedProduct && !buyingProduct && (
        <DetailModal
          product={selectedProduct}
          accentColor={accentColor}
          onClose={() => setSelectedProduct(null)}
          onBuy={() => openCheckout(selectedProduct)}
        />
      )}

      {/* Checkout / email modal */}
      {buyingProduct && (
        <div className={styles.modalOverlay} onClick={() => setBuyingProduct(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{buyingProduct.title}</h2>
                <span className={styles.modalPrice} style={{ color: accentColor }}>
                  {formatPrice(buyingProduct.price_cents, buyingProduct.currency)}
                </span>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setBuyingProduct(null)}>×</button>
            </div>

            {checkoutError && (
              <div className={styles.checkoutAlert}>
                <Alert type="error" onDismiss={() => setCheckoutError(null)}>{checkoutError}</Alert>
              </div>
            )}

            <form onSubmit={handleCheckout} className={styles.checkoutForm} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="buyerEmail">Your email</label>
                <input
                  id="buyerEmail"
                  type="email"
                  className={styles.input}
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={checkoutLoading}
                  autoComplete="email"
                />
                <span className={styles.hint}>Your download link will be emailed after payment.</span>
              </div>

              <button
                type="submit"
                className={styles.checkoutBtn}
                style={{ background: accentColor }}
                disabled={checkoutLoading}
              >
                {checkoutLoading && <Spinner size={15} />}
                {checkoutLoading
                  ? "Redirecting to payment…"
                  : `Pay ${formatPrice(buyingProduct.price_cents, buyingProduct.currency)}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
