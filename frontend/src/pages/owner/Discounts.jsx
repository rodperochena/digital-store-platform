import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import {
  listDiscountCodes,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
} from "../../api/owner";
import styles from "./Discounts.module.css";

const EMPTY_FORM = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  max_uses: "",
  min_order_cents: "",
  expires_at: "",
  active: true,
};

function formatValue(type, value) {
  if (type === "percentage") return `${value}%`;
  return `$${Number(value).toFixed(2)} off`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function Discounts() {
  const { ownerCtx } = useOwner();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await listDiscountCodes(ownerCtx);
      setCodes(data.codes ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ownerCtx]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(code) {
    setEditingId(code.id);
    setForm({
      code: code.code,
      description: code.description ?? "",
      discount_type: code.discount_type,
      discount_value: String(code.discount_value),
      max_uses: code.max_uses != null ? String(code.max_uses) : "",
      min_order_cents: code.min_order_cents ? String(Math.round(code.min_order_cents / 100)) : "",
      expires_at: code.expires_at ? code.expires_at.slice(0, 10) : "",
      active: code.active,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  function handleField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const value = parseFloat(form.discount_value);
    if (!form.code.trim()) { setFormError("Code is required"); return; }
    if (isNaN(value) || value <= 0) { setFormError("Discount value must be a positive number"); return; }
    if (form.discount_type === "percentage" && value > 100) { setFormError("Percentage cannot exceed 100"); return; }

    const body = {
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      discount_type: form.discount_type,
      discount_value: value,
      max_uses: form.max_uses ? parseInt(form.max_uses, 10) : undefined,
      min_order_cents: form.min_order_cents ? Math.round(parseFloat(form.min_order_cents) * 100) : 0,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
      active: form.active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateDiscountCode(editingId, body, ownerCtx);
      } else {
        await createDiscountCode(body, ownerCtx);
      }
      closeForm();
      await load();
    } catch (e) {
      setFormError(e.message ?? "Failed to save discount code");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this discount code? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteDiscountCode(id, ownerCtx);
      setCodes((c) => c.filter((x) => x.id !== id));
    } catch (e) {
      alert(e.message ?? "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(code) {
    try {
      const updated = await updateDiscountCode(code.id, { active: !code.active }, ownerCtx);
      setCodes((c) => c.map((x) => (x.id === code.id ? updated.code : x)));
    } catch (e) {
      alert(e.message ?? "Failed to update");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.heading}>Discount Codes</h1>
          <p className={styles.subtitle}>
            Create percentage or fixed-amount discount codes for your customers.
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>
          + New Code
        </button>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* ── Modal form ── */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={closeForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? "Edit Code" : "New Discount Code"}</h2>
              <button type="button" className={styles.closeBtn} onClick={closeForm}>✕</button>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Code</label>
                  <input
                    className={styles.input}
                    placeholder="SUMMER20"
                    value={form.code}
                    onChange={(e) => handleField("code", e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Type</label>
                  <select
                    className={styles.input}
                    value={form.discount_type}
                    onChange={(e) => handleField("discount_type", e.target.value)}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount ($)</option>
                  </select>
                </div>
              </div>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    {form.discount_type === "percentage" ? "Discount %" : "Discount Amount ($)"}
                  </label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0.01"
                    max={form.discount_type === "percentage" ? "100" : undefined}
                    step="0.01"
                    placeholder={form.discount_type === "percentage" ? "20" : "10.00"}
                    value={form.discount_value}
                    onChange={(e) => handleField("discount_value", e.target.value)}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Min order ($) <span className={styles.optional}>optional</span></label>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={form.min_order_cents}
                    onChange={(e) => handleField("min_order_cents", e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label className={styles.label}>Max uses <span className={styles.optional}>optional</span></label>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Unlimited"
                    value={form.max_uses}
                    onChange={(e) => handleField("max_uses", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Expires <span className={styles.optional}>optional</span></label>
                  <input
                    className={styles.input}
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => handleField("expires_at", e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Description <span className={styles.optional}>optional</span></label>
                <input
                  className={styles.input}
                  placeholder="Internal note about this code"
                  value={form.description}
                  onChange={(e) => handleField("description", e.target.value)}
                />
              </div>

              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => handleField("active", e.target.checked)}
                />
                Active (customers can use this code)
              </label>

              <div className={styles.formActions}>
                <button type="button" className={styles.btnSecondary} onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Create Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : codes.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No discount codes yet</p>
          <p className={styles.emptyDesc}>Create your first code to offer discounts to customers.</p>
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>
            + New Code
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Uses</th>
                <th>Min Order</th>
                <th>Expires</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className={!code.active ? styles.rowInactive : ""}>
                  <td>
                    <span className={styles.codeTag}>{code.code}</span>
                    {code.description && (
                      <span className={styles.codeDesc}>{code.description}</span>
                    )}
                  </td>
                  <td className={styles.discountCell}>{formatValue(code.discount_type, code.discount_value)}</td>
                  <td className={styles.usesCell}>
                    {code.use_count}
                    {code.max_uses != null ? ` / ${code.max_uses}` : ""}
                  </td>
                  <td>{code.min_order_cents > 0 ? `$${(code.min_order_cents / 100).toFixed(2)}` : "—"}</td>
                  <td>{formatDate(code.expires_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.statusPill} ${code.active ? styles.pillActive : styles.pillInactive}`}
                      onClick={() => handleToggle(code)}
                      title={code.active ? "Click to deactivate" : "Click to activate"}
                    >
                      {code.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className={styles.actions}>
                    <button type="button" className={styles.editBtn} onClick={() => openEdit(code)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(code.id)}
                      disabled={deletingId === code.id}
                    >
                      {deletingId === code.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
