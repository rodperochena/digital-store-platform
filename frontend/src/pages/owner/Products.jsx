import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  listOwnerProducts,
  createOwnerProduct,
  updateOwnerProduct,
  deleteOwnerProduct,
} from "../../api/owner";
import styles from "./Products.module.css";

function formatPrice(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
}

export default function OwnerProducts() {
  const { ownerStore, ownerCtx } = useOwner();
  const slug = ownerStore?.slug ?? "";

  const [products, setProducts]     = useState(null);
  const [listError, setListError]   = useState(null);
  const [showForm, setShowForm]     = useState(false);

  // null = creating new; product object = editing existing
  const [editingProduct, setEditingProduct] = useState(null);

  // Form state
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice]             = useState("");
  const [imageUrl, setImageUrl]       = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [isActive, setIsActive]       = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const [lastCreated, setLastCreated] = useState(null);

  // Per-row action state
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchProducts = useCallback(async () => {
    setListError(null);
    try {
      const data = await listOwnerProducts(ownerCtx);
      setProducts(data.products ?? []);
    } catch (err) {
      setListError(err.message);
      setProducts([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPrice("");
    setImageUrl("");
    setDeliveryUrl("");
    setIsActive(true);
    setSaveError(null);
  }

  function openNewForm() {
    setEditingProduct(null);
    resetForm();
    setShowForm(true);
  }

  function openEditForm(p) {
    setEditingProduct(p);
    setTitle(p.title);
    setDescription(p.description ?? "");
    setPrice((p.price_cents / 100).toFixed(2));
    setImageUrl(p.image_url ?? "");
    setDeliveryUrl(p.delivery_url ?? "");
    setIsActive(p.is_active);
    setSaveError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProduct(null);
    resetForm();
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveError(null);

    const trimTitle = title.trim();
    if (!trimTitle) { setSaveError("Title is required."); return; }

    const parsedPrice = parseFloat(price);
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      setSaveError("Price must be a positive number (e.g. 9.99).");
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        // PATCH — send price in dollars; backend converts to cents
        const body = {
          title:     trimTitle,
          price:     parsedPrice,
          is_active: isActive,
          // null clears the column; omitting the key leaves it unchanged
          image_url: imageUrl.trim() || null,
        };
        if (description.trim()) body.description = description.trim();
        if (deliveryUrl.trim()) body.delivery_url = deliveryUrl.trim();

        const data = await updateOwnerProduct(editingProduct.id, body, ownerCtx);
        setProducts((prev) =>
          prev ? prev.map((p) => (p.id === editingProduct.id ? data.product : p)) : prev
        );
      } else {
        // POST — send price_cents
        const body = {
          title:       trimTitle,
          price_cents: Math.round(parsedPrice * 100),
          is_active:   isActive,
        };
        if (description.trim()) body.description = description.trim();
        if (imageUrl.trim())    body.image_url    = imageUrl.trim();
        if (deliveryUrl.trim()) body.delivery_url = deliveryUrl.trim();

        const data = await createOwnerProduct(body, ownerCtx);
        setLastCreated(data.product);
        await fetchProducts();
      }
      closeForm();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(p) {
    setTogglingId(p.id);
    try {
      const data = await updateOwnerProduct(p.id, { is_active: !p.is_active }, ownerCtx);
      setProducts((prev) =>
        prev ? prev.map((x) => (x.id === p.id ? data.product : x)) : prev
      );
    } catch {
      await fetchProducts();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(p) {
    setDeletingId(p.id);
    try {
      const result = await deleteOwnerProduct(p.id, ownerCtx);
      if (result.deleted) {
        setProducts((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
      } else {
        // Had order references — soft-deleted, update row
        setProducts((prev) =>
          prev ? prev.map((x) => (x.id === p.id ? result.product : x)) : prev
        );
      }
    } catch {
      await fetchProducts();
    } finally {
      setDeletingId(null);
    }
  }

  const storefrontUrl = slug ? `/store/${slug}` : null;
  const isEditing = Boolean(editingProduct);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Products</h1>
          <p className={styles.subtitle}>Manage your digital products.</p>
        </div>
        <div className={styles.headerActions}>
          {storefrontUrl && (
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.btnOutline}
            >
              Preview storefront ↗
            </a>
          )}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => (showForm ? closeForm() : openNewForm())}
          >
            {showForm ? "Cancel" : "+ New Product"}
          </button>
        </div>
      </div>

      {/* ── Success banner after create ── */}
      {lastCreated && (
        <div className={styles.successBanner}>
          <span>
            <strong>{lastCreated.title}</strong> created successfully.
          </span>
          <div className={styles.successActions}>
            {storefrontUrl && (
              <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.successLink}>
                Preview storefront ↗
              </a>
            )}
            <button type="button" className={styles.dismissLink} onClick={() => setLastCreated(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Create / Edit form ── */}
      {showForm && (
        <div className={styles.formCard}>
          <h2 className={styles.formHeading}>{isEditing ? "Edit Product" : "New Product"}</h2>

          {saveError && (
            <div className={styles.alertWrap}>
              <Alert type="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert>
            </div>
          )}

          <form onSubmit={handleSave} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="title">Title <span className={styles.req}>*</span></label>
              <input
                id="title"
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Startup Handbook"
                disabled={saving}
                maxLength={120}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="description">Description</label>
              <textarea
                id="description"
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this product include?"
                disabled={saving}
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="imageUrl">Image URL</label>
              <input
                id="imageUrl"
                type="url"
                className={styles.input}
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/product-image.jpg"
                disabled={saving}
                spellCheck={false}
              />
              {imageUrl.trim() && (
                <img
                  src={imageUrl.trim()}
                  alt="Preview"
                  className={styles.imagePreview}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  onLoad={(e)  => { e.currentTarget.style.display = ""; }}
                />
              )}
            </div>

            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="price">
                  Price ({(ownerStore?.currency || "usd").toUpperCase()}) <span className={styles.req}>*</span>
                </label>
                <input
                  id="price"
                  type="number"
                  className={styles.input}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="9.99"
                  disabled={saving}
                  min="0.01"
                  step="0.01"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="deliveryUrl">Delivery URL</label>
                <input
                  id="deliveryUrl"
                  type="url"
                  className={styles.input}
                  value={deliveryUrl}
                  onChange={(e) => setDeliveryUrl(e.target.value)}
                  placeholder="https://…"
                  disabled={saving}
                  spellCheck={false}
                />
                <span className={styles.hint}>Download link shown to buyer after payment.</span>
              </div>
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              <span>Visible on storefront</span>
            </label>

            <div className={styles.formFooter}>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving && <Spinner size={14} />}
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Product"}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Product list ── */}
      {listError && (
        <p className={styles.listError}>Failed to load products: {listError}</p>
      )}

      {products === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <p>No products yet.</p>
          {!showForm && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={openNewForm}
            >
              + Create your first product
            </button>
          )}
        </div>
      ) : (
        <div className={styles.productList}>
          {products.map((p) => (
            <div
              key={p.id}
              className={`${styles.productRow} ${!p.is_active ? styles.productRowInactive : ""}`}
            >
              <div className={styles.productMain}>
                <span className={styles.productTitle}>{p.title}</span>
                {!p.is_active && <span className={styles.inactivePill}>Inactive</span>}
              </div>
              <div className={styles.productMeta}>
                <span className={styles.productPrice}>{formatPrice(p.price_cents, p.currency)}</span>
                {p.description && (
                  <span className={styles.productDesc}>{p.description}</span>
                )}
              </div>
              <div className={styles.productActions}>
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => openEditForm(p)}
                  disabled={togglingId === p.id || deletingId === p.id}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => handleToggleActive(p)}
                  disabled={togglingId === p.id || deletingId === p.id}
                >
                  {togglingId === p.id
                    ? "…"
                    : p.is_active
                    ? "Deactivate"
                    : "Reactivate"}
                </button>
                <button
                  type="button"
                  className={`${styles.btnSmall} ${styles.btnSmallDanger}`}
                  onClick={() => handleDelete(p)}
                  disabled={togglingId === p.id || deletingId === p.id}
                >
                  {deletingId === p.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
