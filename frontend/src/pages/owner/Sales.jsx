import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import { listSales, createSale, updateSale, deleteSale } from "../../api/owner";
import { listOwnerProductsWithStats } from "../../api/owner";
import styles from "./Sales.module.css";

function formatSaleValue(sale) {
  if (sale.discount_type === "percentage") return `${sale.discount_value}% off`;
  return `$${parseFloat(sale.discount_value).toFixed(2)} off`;
}

function saleStatus(sale) {
  const now = Date.now();
  if (!sale.is_active) return { label: "Inactive", cls: "inactive" };
  const start = sale.starts_at ? new Date(sale.starts_at).getTime() : null;
  const end   = sale.ends_at   ? new Date(sale.ends_at).getTime()   : null;
  if (start && start > now) return { label: "Scheduled", cls: "scheduled" };
  if (end && end <= now) return { label: "Ended", cls: "ended" };
  return { label: "Live", cls: "live" };
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EMPTY_FORM = {
  name: "",
  discount_type: "percentage",
  discount_value: "",
  starts_at: "",
  ends_at: "",
  apply_to: "all",
  product_ids: [],
  is_active: true,
};

export default function Sales() {
  const { ownerCtx } = useOwner();
  const [sales, setSales]       = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formError, setFormError] = useState(null);

  const fetchSales = useCallback(async () => {
    setError(null);
    try {
      const [salesData, productsData] = await Promise.all([
        listSales(ownerCtx),
        listOwnerProductsWithStats(ownerCtx),
      ]);
      setSales(salesData.sales ?? []);
      setProducts(productsData.products ?? []);
    } catch (err) {
      setError(err.message);
      setSales([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSales(); }, [fetchSales]);

  function openCreate() {
    setEditingSale(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(sale) {
    setEditingSale(sale);
    setForm({
      name:           sale.name,
      discount_type:  sale.discount_type,
      discount_value: String(sale.discount_value),
      starts_at:      sale.starts_at ? sale.starts_at.slice(0, 16) : "",
      ends_at:        sale.ends_at   ? sale.ends_at.slice(0, 16)   : "",
      apply_to:       sale.apply_to,
      product_ids:    sale.product_ids || [],
      is_active:      sale.is_active,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSale(null);
    setFormError(null);
  }

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function toggleProduct(id) {
    setForm((prev) => {
      const ids = prev.product_ids.includes(id)
        ? prev.product_ids.filter((x) => x !== id)
        : [...prev.product_ids, id];
      return { ...prev, product_ids: ids };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    const val = parseFloat(form.discount_value);
    if (!form.name.trim()) return setFormError("Sale name is required");
    if (!val || val <= 0)  return setFormError("Discount value must be positive");
    if (form.discount_type === "percentage" && val > 100) return setFormError("Percentage cannot exceed 100");
    if (form.apply_to === "selected" && form.product_ids.length === 0) return setFormError("Select at least one product");

    setSaving(true);
    try {
      const body = {
        name:           form.name.trim(),
        discount_type:  form.discount_type,
        discount_value: val,
        starts_at:      form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at:        form.ends_at   ? new Date(form.ends_at).toISOString()   : null,
        apply_to:       form.apply_to,
        product_ids:    form.apply_to === "selected" ? form.product_ids : [],
        is_active:      form.is_active,
      };
      if (editingSale) {
        await updateSale(ownerCtx, editingSale.id, body);
      } else {
        await createSale(ownerCtx, body);
      }
      await fetchSales();
      closeForm();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sale) {
    if (!confirm(`Delete sale "${sale.name}"?`)) return;
    setDeletingId(sale.id);
    try {
      await deleteSale(ownerCtx, sale.id);
      setSales((prev) => prev.filter((s) => s.id !== sale.id));
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(sale) {
    try {
      const data = await updateSale(ownerCtx, sale.id, { is_active: !sale.is_active });
      setSales((prev) => prev.map((s) => s.id === sale.id ? data.sale : s));
    } catch (err) {
      alert("Failed: " + err.message);
    }
  }

  const publishedProducts = products.filter((p) => p.visibility === "published");

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Sales</h1>
          <p className={styles.subtitle}>Run time-limited sales on all products or selected items</p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>
          + New Sale
        </button>
      </div>

      {error && <p className={styles.errorMsg}>Failed to load: {error}</p>}

      {sales === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : sales.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>🏷️</span>
          <h2 className={styles.emptyTitle}>No sales yet</h2>
          <p className={styles.emptyDesc}>Create a sale to offer time-limited discounts on your products.</p>
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>+ Create Sale</button>
        </div>
      ) : (
        <div className={styles.saleList}>
          {sales.map((sale) => {
            const status = saleStatus(sale);
            return (
              <div key={sale.id} className={styles.saleRow}>
                <div className={styles.saleInfo}>
                  <div className={styles.saleTitleRow}>
                    <span className={styles.saleName}>{sale.name}</span>
                    <span className={`${styles.statusBadge} ${styles[`status_${status.cls}`]}`}>{status.label}</span>
                  </div>
                  <div className={styles.saleMeta}>
                    <span className={styles.saleValue}>{formatSaleValue(sale)}</span>
                    <span className={styles.sepDot}>·</span>
                    <span className={styles.saleApply}>
                      {sale.apply_to === "all" ? "All products" : `${(sale.product_ids || []).length} product(s)`}
                    </span>
                    {(sale.starts_at || sale.ends_at) && (
                      <>
                        <span className={styles.sepDot}>·</span>
                        <span className={styles.saleDates}>
                          {fmtDate(sale.starts_at)} → {fmtDate(sale.ends_at)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.saleActions}>
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => handleToggleActive(sale)}
                  >
                    {sale.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => openEdit(sale)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.btnSmall} ${styles.btnDanger}`}
                    onClick={() => handleDelete(sale)}
                    disabled={deletingId === sale.id}
                  >
                    {deletingId === sale.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit form modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={closeForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingSale ? "Edit Sale" : "New Sale"}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeForm}>✕</button>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Sale name <span className={styles.req}>*</span></label>
                <input
                  className={styles.input}
                  placeholder="e.g. Summer Sale"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Discount type</label>
                  <select className={styles.select} value={form.discount_type} onChange={(e) => setField("discount_type", e.target.value)}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount ($)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Discount value <span className={styles.req}>*</span></label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={form.discount_type === "percentage" ? "e.g. 20" : "e.g. 5.00"}
                    value={form.discount_value}
                    onChange={(e) => setField("discount_value", e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Starts at (optional)</label>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setField("starts_at", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Ends at (optional)</label>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setField("ends_at", e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Apply to</label>
                <select className={styles.select} value={form.apply_to} onChange={(e) => setField("apply_to", e.target.value)}>
                  <option value="all">All products</option>
                  <option value="selected">Selected products</option>
                </select>
              </div>

              {form.apply_to === "selected" && (
                <div className={styles.field}>
                  <label className={styles.label}>Select products</label>
                  <div className={styles.productPicker}>
                    {publishedProducts.length === 0 ? (
                      <p className={styles.noProducts}>No published products available.</p>
                    ) : publishedProducts.map((p) => (
                      <label key={p.id} className={styles.productCheckbox}>
                        <input
                          type="checkbox"
                          checked={form.product_ids.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                        />
                        <span>{p.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setField("is_active", e.target.checked)}
                  />
                  Active (sale is live if within date range)
                </label>
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.btnOutline} onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? "Saving…" : editingSale ? "Save changes" : "Create sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
