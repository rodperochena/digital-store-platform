import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import { listProducts, createProduct } from "../api/products";
import styles from "./ProductsPage.module.css";

const URL_RE = /^https?:\/\/.+/;

function formatPrice(cents, currency) {
  const amount = cents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ProductsPage() {
  const { adminKey, apiBase, activeStore } = useApp();

  // ── product list ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState(null); // null = not yet fetched
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  // ── create form ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  // Hooks must be unconditional — guard comes after all hook calls
  const ctx = { adminKey, apiBase };
  const storeId = activeStore?.id;

  const fetchProducts = useCallback(async () => {
    if (!storeId) return;
    setListLoading(true);
    setListError(null);
    try {
      const data = await listProducts(storeId, ctx);
      setProducts(data.products);
    } catch (err) {
      setListError(err.message);
    } finally {
      setListLoading(false);
    }
  }, [storeId, adminKey, apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── guard (after all hooks) ───────────────────────────────────────────────
  if (!activeStore) {
    return <Navigate to="/admin/store" replace />;
  }

  // ── handlers ──────────────────────────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const trimTitle = title.trim();
    const trimDesc = description.trim();
    const trimUrl = deliveryUrl.trim();
    const parsedPrice = parseFloat(price);

    if (!trimTitle) {
      setCreateError("Title is required.");
      return;
    }
    if (trimTitle.length > 120) {
      setCreateError("Title must be 120 characters or fewer.");
      return;
    }
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      setCreateError("Price must be a positive number.");
      return;
    }
    if (trimDesc.length > 5000) {
      setCreateError("Description must be 5000 characters or fewer.");
      return;
    }
    if (trimUrl && !URL_RE.test(trimUrl)) {
      setCreateError("Delivery URL must start with http:// or https://");
      return;
    }

    const price_cents = Math.round(parsedPrice * 100);
    if (price_cents <= 0) {
      setCreateError("Price must result in at least 1 cent.");
      return;
    }

    const body = { title: trimTitle, price_cents, is_active: isActive };
    if (trimDesc) body.description = trimDesc;
    if (trimUrl) body.delivery_url = trimUrl;

    setCreateLoading(true);
    try {
      await createProduct(storeId, body, ctx);
      setCreateSuccess("Product created.");
      setTitle("");
      setPrice("");
      setDescription("");
      setDeliveryUrl("");
      setIsActive(true);
      await fetchProducts();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  const currency = activeStore.currency || "USD";

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Products</h1>
      <p className={styles.storeBadge}>
        Store: <strong>{activeStore.name}</strong> · {activeStore.slug}
      </p>

      {/* ── create form ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Add Product</h2>

        {createError && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setCreateError(null)}>
              {createError}
            </Alert>
          </div>
        )}
        {createSuccess && (
          <div className={styles.alertWrap}>
            <Alert type="success" onDismiss={() => setCreateSuccess(null)}>
              {createSuccess}
            </Alert>
          </div>
        )}

        <form onSubmit={handleCreate} className={styles.form} noValidate>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="title">
                Title
              </label>
              <input
                id="title"
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Product name"
                disabled={createLoading}
                maxLength={120}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="price">
                Price ({currency})
              </label>
              <input
                id="price"
                type="number"
                className={styles.input}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="9.99"
                min="0.01"
                step="0.01"
                disabled={createLoading}
              />
              <span className={styles.hint}>Entered in dollars, stored as cents.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">
              Description <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description visible to customers"
              rows={3}
              disabled={createLoading}
              maxLength={5000}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="deliveryUrl">
              Delivery URL <span className={styles.optional}>(optional, admin-only)</span>
            </label>
            <input
              id="deliveryUrl"
              type="url"
              className={styles.input}
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              placeholder="https://…"
              disabled={createLoading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className={styles.checkRow}>
            <input
              id="isActive"
              type="checkbox"
              className={styles.checkbox}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={createLoading}
            />
            <label htmlFor="isActive" className={styles.checkLabel}>
              Active — visible in storefront
            </label>
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={createLoading}>
            {createLoading && <Spinner size={15} />}
            {createLoading ? "Creating…" : "Add Product"}
          </button>
        </form>
      </section>

      {/* ── product list ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.listHeadingRow}>
          <h2 className={styles.listHeading}>Products</h2>
          {products !== null && (
            <span className={styles.count}>{products.length} total</span>
          )}
        </div>

        {listError && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setListError(null)}>
              {listError}
            </Alert>
          </div>
        )}

        {listLoading && products === null && (
          <div className={styles.listLoading}>
            <Spinner size={20} /> Loading products…
          </div>
        )}

        {!listLoading && products !== null && products.length === 0 && (
          <div className={styles.empty}>No products yet. Add one above.</div>
        )}

        {products !== null && products.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Price</th>
                <th>Status</th>
                <th>Delivery URL</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className={styles.titleCell}>{p.title}</td>
                  <td>{formatPrice(p.price_cents, activeStore.currency)}</td>
                  <td>
                    {p.is_active ? (
                      <span className={styles.badgeActive}>Active</span>
                    ) : (
                      <span className={styles.badgeInactive}>Inactive</span>
                    )}
                  </td>
                  <td>
                    {p.delivery_url ? (
                      <span className={styles.deliveryUrl}>{p.delivery_url}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
