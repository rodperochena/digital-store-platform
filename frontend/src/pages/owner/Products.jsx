import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import {
  listOwnerProductsWithStats, deleteOwnerProduct, duplicateProduct as apiDuplicate,
  exportProductsCsv, downloadProductsCsvTemplate, importProductsCsv,
  bulkUpdateProducts, bulkDeleteProducts, updateOwnerProduct,
} from "../../api/owner";
import styles from "./Products.module.css";

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_ICON_MAP = {
  "template": "📄", "ebook": "📚", "design-asset": "🎨",
  "photo-video": "📸", "audio-music": "🎵", "preset-filter": "🎛️",
  "font": "🔤", "software-code": "💻", "ai-prompt": "🤖",
  "printable": "🖨️", "spreadsheet": "📊", "other": "📦",
};
const TYPE_LABEL_MAP = {
  "template": "Template", "ebook": "Ebook", "design-asset": "Design Asset",
  "photo-video": "Photo / Video", "audio-music": "Audio", "preset-filter": "Preset",
  "font": "Font", "software-code": "Software", "ai-prompt": "AI Prompt",
  "printable": "Printable", "spreadsheet": "Spreadsheet", "other": "Other",
};

const THUMB_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899"];

// FIX 2: Display label mapping — DB values unchanged, only UI labels change
const VISIBILITY_LABELS = { published: "Active", draft: "Draft", unlisted: "Inactive" };
const VISIBILITY_COLORS = { published: "#22c55e", draft: "#9ca3af", unlisted: "#f59e0b" };
const STATUS_FILTER_OPTIONS = [
  { label: "All",      value: "all" },
  { label: "Active",   value: "published" },
  { label: "Draft",    value: "draft" },
  { label: "Inactive", value: "unlisted" },
];
const STATUS_OPTIONS = [
  { label: "Active",   value: "published" },
  { label: "Draft",    value: "draft" },
  { label: "Inactive", value: "unlisted" },
];

// ── Utilities ──────────────────────────────────────────────────────────────────

function thumbColor(str) {
  let h = 0;
  for (const c of (str || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return THUMB_COLORS[h % THUMB_COLORS.length];
}

function formatCurrency(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      minimumFractionDigits: 2,
    }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  }
}

// FIX 5: Relative time for recent updates, full date for older ones
function formatUpdatedDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return mins < 1 ? "just now" : `${mins}m ago`;
  }
  if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  }
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

function sortProducts(list, key, dir) {
  return [...list].sort((a, b) => {
    let va, vb;
    switch (key) {
      case "title":   va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); break;
      case "price":   va = a.price_cents   || 0; vb = b.price_cents   || 0; break;
      case "views":   va = a.view_count    || 0; vb = b.view_count    || 0; break;
      case "sales":   va = a.sales_count   || 0; vb = b.sales_count   || 0; break;
      case "revenue": va = a.revenue_cents || 0; vb = b.revenue_cents || 0; break;
      case "updated": va = new Date(a.updated_at); vb = new Date(b.updated_at); break;
      default:        va = new Date(a.created_at); vb = new Date(b.created_at);
    }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ?  1 : -1;
    return 0;
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error("Failed to read file"));
    r.readAsText(file);
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EmptyState({ navigate }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyEmoji}>🛍️</span>
      <h2 className={styles.emptyTitle}>Create your first product</h2>
      <p className={styles.emptyDesc}>Add a digital product to start selling. It only takes a minute.</p>
      <button type="button" className={styles.btnPrimary} onClick={() => navigate("/owner/products/new")}>
        + Create Product
      </button>
      <ul className={styles.emptyTips}>
        <li>💡 You can sell ebooks, templates, courses, software, and more</li>
        <li>💡 Upload your file anywhere and paste the download link</li>
        <li>💡 Buyers receive a secure, time-limited download link after payment</li>
      </ul>
    </div>
  );
}

// FIX 2: Interactive StatusBadge — click to change visibility via fixed dropdown
function StatusBadge({ product, onStatusChange }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropPos,      setDropPos]      = useState({ top: 0, left: 0 });
  const badgeRef = useRef(null);

  const isDeactivated = product.is_active === false && !product.visibility;
  const color = isDeactivated ? "#ef4444" : (VISIBILITY_COLORS[product.visibility] ?? "#9ca3af");
  const label = isDeactivated ? "Deactivated" : (VISIBILITY_LABELS[product.visibility] ?? "Draft");

  // Close on outside click or scroll
  useEffect(() => {
    if (!showDropdown) return;
    function close(e) {
      if (
        !e.target.closest('[data-role="status-dropdown"]') &&
        !e.target.closest('[data-role="status-badge"]')
      ) {
        setShowDropdown(false);
      }
    }
    function closeOnScroll() { setShowDropdown(false); }
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [showDropdown]);

  function handleClick(e) {
    if (isDeactivated) return;
    e.stopPropagation();
    const rect = badgeRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left });
    setShowDropdown((v) => !v);
  }

  async function handleSelect(newVisibility) {
    setShowDropdown(false);
    await onStatusChange(product.id, newVisibility);
  }

  return (
    <>
      <button
        ref={badgeRef}
        type="button"
        data-role="status-badge"
        className={`${styles.statusBadge} ${isDeactivated ? styles.statusDeactivated : styles.statusClickable}`}
        onClick={handleClick}
        title={isDeactivated ? "This product was deactivated because it has order history" : "Click to change status"}
      >
        <span className={styles.statusDot} style={{ backgroundColor: color }} />
        {label}
        {!isDeactivated && <span className={styles.statusChevron}>▾</span>}
      </button>

      {showDropdown && (
        <div
          data-role="status-dropdown"
          className={styles.statusDropdown}
          style={{ position: "fixed", top: dropPos.top, left: dropPos.left, zIndex: 1100 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.statusOption} ${product.visibility === opt.value ? styles.statusOptionActive : ""}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className={styles.statusDot} style={{ backgroundColor: VISIBILITY_COLORS[opt.value] }} />
              {opt.label}
              {product.visibility === opt.value && <span className={styles.statusCheck}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── Inline price editor ────────────────────────────────────────────────────────
function InlinePrice({ product, currency, onPriceChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef(null);

  function startEditing() {
    setEditValue((product.price_cents / 100).toFixed(2));
    setIsEditing(true);
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  async function save() {
    const cleaned = editValue.replace(/[$,\s]/g, "").trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) { setIsEditing(false); return; }
    const newCents = Math.round(num * 100);
    if (newCents === product.price_cents) { setIsEditing(false); return; }
    await onPriceChange(product.id, newCents);
    setIsEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter")  { e.preventDefault(); save(); }
    if (e.key === "Escape") { setIsEditing(false); }
  }

  if (isEditing) {
    return (
      <div className={styles.inlinePriceEdit}>
        <span className={styles.inlinePriceCurrency}>
          {(currency || "usd").toUpperCase()}
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className={styles.inlinePriceInput}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
        />
      </div>
    );
  }

  const isPwyw = product.pricing_type === "pay_what_you_want";

  return (
    <span
      className={styles.priceClickable}
      onClick={isPwyw ? undefined : startEditing}
      title={isPwyw ? "Pay what you want" : "Click to edit price"}
      style={isPwyw ? { cursor: "default" } : undefined}
    >
      {isPwyw ? (
        <span>
          <span style={{ fontSize: "0.7rem", color: "#6b7280", display: "block", lineHeight: 1.2 }}>from</span>
          {formatCurrency(product.minimum_price_cents || 100, currency)}
        </span>
      ) : (
        formatCurrency(product.price_cents, currency)
      )}
    </span>
  );
}

// ── ProductRow ─────────────────────────────────────────────────────────────────
// FIX 1: ProductRow no longer renders the dropdown — only the trigger button.
// The dropdown is rendered at the parent level with position: fixed.
function ProductRow({
  p, selected, onSelect, onMenuOpen, onStatusChange, onPriceChange,
  deleting, duplicating, currency,
}) {
  const navigate  = useNavigate();
  const typeIcon  = p.product_type ? TYPE_ICON_MAP[p.product_type]  : null;
  const typeLabel = p.product_type ? TYPE_LABEL_MAP[p.product_type] : null;
  const color     = thumbColor(p.title);

  return (
    <tr className={`${styles.tr} ${selected ? styles.trSelected : ""}`}>
      {/* Checkbox */}
      <td className={`${styles.td} ${styles.colCheckbox}`}>
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(p.id, e.target.checked)} />
      </td>

      {/* Thumbnail */}
      <td className={styles.td}>
        <div className={styles.thumb}>
          {p.image_url ? (
            <img
              src={p.image_url} alt={p.title}
              className={styles.thumbImg}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <span className={styles.thumbInitial} style={{ background: color }}>
              {(p.title || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </td>

      {/* Product name — click navigates to edit page */}
      <td className={`${styles.td} ${styles.tdTitle} ${styles.colLeft}`}>
        <button
          type="button"
          className={styles.productTitleBtn}
          onClick={() => navigate(`/owner/products/${p.id}/edit`)}
        >
          {p.title}
        </button>
        <div className={styles.productMeta}>
          {typeIcon && <span className={styles.typeBadge}>{typeIcon} {typeLabel}</span>}
          {!p.delivery_url && !p.delivery_file_key && <span className={styles.noDelivery}>⚠ No delivery</span>}
        </div>
      </td>

      {/* Views */}
      <td className={`${styles.td} ${styles.tdNum} ${styles.colCenter}`}>
        {(p.view_count || 0).toLocaleString()}
      </td>

      {/* Price — click to edit inline */}
      <td className={`${styles.td} ${styles.colCenter}`}>
        <InlinePrice product={p} currency={currency} onPriceChange={onPriceChange} />
      </td>

      {/* Sales */}
      <td className={`${styles.td} ${styles.tdNum} ${styles.colCenter}`}>
        {(p.sales_count || 0).toLocaleString()}
      </td>

      {/* Revenue */}
      <td className={`${styles.td} ${styles.tdNum} ${styles.colCenter}`}>
        {formatCurrency(p.revenue_cents, currency)}
      </td>

      {/* Updated — FIX 5 */}
      <td className={`${styles.td} ${styles.tdDate} ${styles.colCenter}`}>
        {formatUpdatedDate(p.updated_at)}
      </td>

      {/* Status — FIX 2: clickable badge */}
      <td className={`${styles.td} ${styles.colCenter}`}>
        <StatusBadge product={p} onStatusChange={onStatusChange} />
      </td>

      {/* Actions trigger — FIX 1: no dropdown here, only the button */}
      <td className={`${styles.td} ${styles.tdMenu}`}>
        <button
          type="button"
          className={styles.menuTrigger}
          data-role="menu-trigger"
          onClick={(e) => onMenuOpen(e, p.id)}
          disabled={deleting || duplicating}
          title="Actions"
        >
          ⋯
        </button>
      </td>
    </tr>
  );
}

// FIX 3: Bulk Edit Modal — replaces inline status dropdown
function BulkEditModal({ count, currency, sharedPricingType, onClose, onSave }) {
  const [visibility, setVisibility] = useState("");
  const [priceStr,   setPriceStr]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const showPrice = sharedPricingType !== null;
  const isPwyw    = sharedPricingType === "pay_what_you_want";
  const priceLabel = isPwyw ? "Minimum Price" : "Price";

  async function handleSave() {
    setError(null);
    const updates = {};
    if (visibility) updates.visibility = visibility;
    if (showPrice && priceStr.trim()) {
      const p = parseFloat(priceStr.replace(/[$,\s]/g, ""));
      if (isNaN(p) || p < 0) { setError("Enter a valid price"); return; }
      if (isPwyw) {
        updates.minimum_price_cents = Math.max(100, Math.round(p * 100));
      } else {
        updates.price_cents = Math.round(p * 100);
      }
    }
    if (Object.keys(updates).length === 0) { setError("Change at least one field to save"); return; }
    setSaving(true);
    try {
      await onSave(updates);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Edit {count} products</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <p className={styles.modalSubtitle}>
          Only fields you change will be updated. Leave a field empty to keep current values.
        </p>

        <div className={styles.modalField}>
          <label className={styles.modalFieldLabel}>Status</label>
          <select
            className={styles.filterSelect}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="">Don't change</option>
            <option value="published">Active</option>
            <option value="draft">Draft</option>
            <option value="unlisted">Inactive</option>
          </select>
        </div>

        {showPrice ? (
          <div className={styles.modalField}>
            <label className={styles.modalFieldLabel}>{priceLabel}</label>
            <div className={styles.priceInputWrap}>
              <span className={styles.pricePrefix}>{(currency || "usd").toUpperCase()}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className={styles.priceInput}
                placeholder={isPwyw ? "1.00" : "0.00"}
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
              />
            </div>
            <p className={styles.modalFieldHint}>
              {isPwyw ? "Minimum price buyers must pay. Leave empty to keep current." : "Leave empty to keep current prices"}
            </p>
          </div>
        ) : (
          <p className={styles.modalMixedPriceNote}>
            Price cannot be edited in bulk — selected products have different pricing types.
          </p>
        )}

        {error && <p className={styles.importError}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnOutline} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// FIX 6: ImportModal updated to show warnings
function ImportModal({
  onClose, onDownloadTemplate,
  importFile, setImportFile,
  importDragging, setImportDragging,
  importLoading, importResult, importError,
  onImport, fileInputRef,
}) {
  function handleDrop(e) {
    e.preventDefault();
    setImportDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setImportFile(file);
  }

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Import Products from CSV</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <p className={styles.modalDesc}>
          Upload a CSV file to create products in bulk. Download the template for correct column names and valid values.
        </p>

        <button type="button" className={styles.templateLink} onClick={onDownloadTemplate}>
          📥 Download CSV template
        </button>

        {importResult ? (
          <div className={styles.importResult}>
            <p className={styles.importResultTitle}>
              ✅ {importResult.imported} imported
              {importResult.skipped > 0 && ` · ❌ ${importResult.skipped} skipped`}
              {importResult.warnings?.length > 0 && ` · ⚠️ ${importResult.warnings.length} warnings`}
            </p>

            {importResult.warnings && importResult.warnings.length > 0 && (
              <>
                <p className={styles.importSectionLabel}>Warnings:</p>
                <ul className={styles.importWarnings}>
                  {importResult.warnings.map((w, i) => (
                    <li key={i} className={styles.importWarningItem}>
                      Row {w.row} ({w.field}): {w.message}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {importResult.errors && importResult.errors.length > 0 && (
              <>
                <p className={styles.importSectionLabel}>Errors (rows skipped):</p>
                <ul className={styles.importErrors}>
                  {importResult.errors.map((err, i) => (
                    <li key={i}>Row {err.row}: {err.message || err.error}</li>
                  ))}
                </ul>
              </>
            )}

            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnPrimary} onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`${styles.dropZone} ${importDragging ? styles.dropZoneDragging : ""} ${importFile ? styles.dropZoneHasFile : ""}`}
              onDragOver={(e) => { e.preventDefault(); setImportDragging(true); }}
              onDragLeave={() => setImportDragging(false)}
              onDrop={handleDrop}
              onClick={() => !importFile && fileInputRef.current?.click()}
            >
              {importFile ? (
                <div className={styles.filePreview}>
                  <span className={styles.fileIcon}>📄</span>
                  <span className={styles.fileName}>{importFile.name}</span>
                  <span className={styles.fileSize}>({(importFile.size / 1024).toFixed(1)} KB)</span>
                  <button
                    type="button"
                    className={styles.fileRemove}
                    onClick={(e) => { e.stopPropagation(); setImportFile(null); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <span className={styles.dropIcon}>📁</span>
                  <p className={styles.dropText}>Drag & drop your CSV file here, or</p>
                  <button
                    type="button"
                    className={styles.btnOutline}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    Choose file
                  </button>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className={styles.fileInputHidden}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImportFile(f);
                e.target.value = "";
              }}
            />

            {importError && <p className={styles.importError}>{importError}</p>}

            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnOutline} onClick={onClose}>Cancel</button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!importFile || importLoading}
                onClick={onImport}
              >
                {importLoading ? "Importing…" : "Import Products"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OwnerProducts() {
  const { ownerStore, ownerCtx } = useOwner();
  const navigate = useNavigate();
  const slug     = ownerStore?.slug ?? "";
  const currency = ownerStore?.currency || "usd";

  // Data
  const [products,   setProducts]   = useState(null);
  const [listError,  setListError]  = useState(null);

  // Search / filter / sort
  const [searchRaw,    setSearchRaw]    = useState("");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey,      setSortKey]      = useState("created");
  const [sortDir,      setSortDir]      = useState("desc");

  // Selection + bulk
  const [selected,      setSelected]      = useState(new Set());
  const [bulkLoading,   setBulkLoading]   = useState(false);
  const [showBulkEdit,  setShowBulkEdit]  = useState(false);

  // FIX 1: Fixed-position action menu
  const [activeMenuId,  setActiveMenuId]  = useState(null);
  const [menuPosition,  setMenuPosition]  = useState({ top: 0, right: 0 });

  // Per-row states
  const [deletingId,    setDeletingId]    = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [copiedId,      setCopiedId]      = useState(null);

  // Import modal
  const [showImport,     setShowImport]     = useState(false);
  const [importFile,     setImportFile]     = useState(null);
  const [importDragging, setImportDragging] = useState(false);
  const [importLoading,  setImportLoading]  = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [importError,    setImportError]    = useState(null);
  const fileInputRef = useRef(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchRaw), 300);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // FIX 1: Close fixed dropdown on outside click or scroll
  useEffect(() => {
    if (!activeMenuId) return;
    function handleOutside(e) {
      if (
        !e.target.closest('[data-role="action-menu"]') &&
        !e.target.closest('[data-role="menu-trigger"]')
      ) {
        setActiveMenuId(null);
      }
    }
    function handleScroll() { setActiveMenuId(null); }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [activeMenuId]);

  // FIX 1: Open menu at button position
  function openMenu(e, productId) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setActiveMenuId(productId);
  }

  // Fetch
  const fetchProducts = useCallback(async () => {
    setListError(null);
    try {
      const data = await listOwnerProductsWithStats(ownerCtx);
      setProducts(data.products ?? []);
      setSelected(new Set());
    } catch (err) {
      setListError(err.message);
      setProducts([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    if (!products) return [];
    const q = searchQuery.toLowerCase();
    return sortProducts(
      products.filter((p) => {
        const matchesSearch = !q || p.title.toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || p.visibility === statusFilter;
        return matchesSearch && matchesStatus;
      }),
      sortKey,
      sortDir
    );
  }, [products, searchQuery, statusFilter, sortKey, sortDir]);

  // FIX 2: Status counts for subtitle
  const counts = products ? {
    active:   products.filter((p) => p.visibility === "published").length,
    draft:    products.filter((p) => p.visibility === "draft").length,
    inactive: products.filter((p) => p.visibility === "unlisted").length,
  } : null;

  // Sort handlers
  function handleColumnSort(col) {
    if (sortKey === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("desc"); }
  }
  function sortIndicator(col) {
    if (sortKey !== col) return null;
    return <span className={styles.sortArrow}>{sortDir === "asc" ? " ▲" : " ▼"}</span>;
  }

  // Selection
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  function handleSelectAll(checked) {
    setSelected(checked ? new Set(filtered.map((p) => p.id)) : new Set());
  }
  function handleSelectOne(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  // Inline price edit
  async function handlePriceChange(productId, newPriceCents) {
    try {
      await updateOwnerProduct(productId, { price_cents: newPriceCents }, ownerCtx);
      await fetchProducts();
    } catch (err) {
      console.error("Failed to update price:", err);
    }
  }

  // FIX 2: Inline status change via badge dropdown
  async function handleStatusChange(productId, newVisibility) {
    try {
      await updateOwnerProduct(productId, { visibility: newVisibility }, ownerCtx);
      // Optimistic local update — also refresh to pick up derived fields
      setProducts((prev) =>
        prev
          ? prev.map((p) =>
              p.id === productId ? { ...p, visibility: newVisibility } : p
            )
          : prev
      );
      await fetchProducts();
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  }

  // Single-product actions
  async function handleDelete(p) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    setActiveMenuId(null);
    setDeletingId(p.id);
    try {
      await deleteOwnerProduct(p.id, ownerCtx);
      setProducts((prev) => prev ? prev.filter((x) => x.id !== p.id) : prev);
    } catch {
      await fetchProducts();
    } finally { setDeletingId(null); }
  }

  async function handleDuplicate(p) {
    setActiveMenuId(null);
    setDuplicatingId(p.id);
    try {
      await apiDuplicate(p.id, ownerCtx);
      await fetchProducts();
    } catch (err) {
      alert("Duplicate failed: " + err.message);
    } finally { setDuplicatingId(null); }
  }

  function handleCopyLink(p) {
    const url = `${window.location.origin}/store/${slug}/product/${p.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(p.id);
      setTimeout(() => { setCopiedId(null); setActiveMenuId(null); }, 1500);
    });
  }

  // FIX 3: Bulk edit — 1 product → navigate; 2+ → modal
  function handleBulkEdit() {
    if (selected.size === 1) {
      const id = [...selected][0];
      navigate(`/owner/products/${id}/edit`);
    } else {
      setShowBulkEdit(true);
    }
  }

  async function handleBulkSave(updates) {
    setBulkLoading(true);
    try {
      await bulkUpdateProducts(ownerCtx, [...selected], updates);
      setShowBulkEdit(false);
      setSelected(new Set());
      await fetchProducts();
    } catch (err) {
      throw err;
    } finally { setBulkLoading(false); }
  }

  async function handleBulkDelete() {
    const n = selected.size;
    if (!confirm(`Delete ${n} product${n > 1 ? "s" : ""}? Products with order history will be deactivated instead.`)) return;
    setBulkLoading(true);
    try {
      await bulkDeleteProducts(ownerCtx, [...selected]);
      await fetchProducts();
    } catch (err) {
      alert("Bulk delete failed: " + err.message);
    } finally { setBulkLoading(false); }
  }

  // Export
  async function handleExport() {
    try {
      const blob = await exportProductsCsv(ownerCtx);
      triggerDownload(blob, `products-export-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  }

  // Import modal
  function openImportModal() {
    setImportFile(null); setImportResult(null); setImportError(null);
    setShowImport(true);
  }
  function closeImportModal() {
    setShowImport(false); setImportFile(null); setImportResult(null); setImportError(null);
  }
  async function handleDownloadTemplate() {
    try {
      const blob = await downloadProductsCsvTemplate(ownerCtx);
      triggerDownload(blob, "product-import-template.csv");
    } catch (err) {
      alert("Failed to download template: " + err.message);
    }
  }
  async function handleImportSubmit() {
    if (!importFile) return;
    setImportLoading(true); setImportError(null);
    try {
      const csvContent = await readFileAsText(importFile);
      const result     = await importProductsCsv(ownerCtx, csvContent);
      setImportResult(result);
      await fetchProducts();
    } catch (err) {
      setImportError(err.message);
    } finally { setImportLoading(false); }
  }

  // Derived
  const storefrontUrl = slug ? `/store/${slug}` : null;
  const sortLabel = {
    created: "newest first", title: "alphabetical",
    price: "price", views: "most viewed", sales: "most sold", revenue: "most revenue", updated: "recently updated",
  }[sortKey] || "newest first";

  // The active product for the fixed dropdown
  const activeMenuProduct = activeMenuId ? (products || []).find((p) => p.id === activeMenuId) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Section 1: Page header ────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Products</h1>
          <p className={styles.subtitle}>
            {products === null
              ? "Loading…"
              : counts
                ? `${products.length} ${products.length === 1 ? "product" : "products"} · ${counts.active} active, ${counts.draft} draft, ${counts.inactive} inactive`
                : `Sorted by ${sortLabel}`}
          </p>
        </div>
        <div className={styles.headerActions}>
          {storefrontUrl && (
            <a href={storefrontUrl} target="_blank" rel="noreferrer" className={styles.btnOutline}>
              Preview storefront ↗
            </a>
          )}
          <button type="button" className={styles.btnPrimary} onClick={() => navigate("/owner/products/new")}>
            + New Product
          </button>
        </div>
      </div>

      {listError && <p className={styles.listError}>Failed to load products: {listError}</p>}

      {products === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : products.length === 0 ? (
        <EmptyState navigate={navigate} />
      ) : (
        <>
          {/* ── Section 2: Toolbar ───────────────────────────── */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="search"
                  className={styles.searchInput}
                  placeholder="Search products…"
                  value={searchRaw}
                  onChange={(e) => setSearchRaw(e.target.value)}
                />
              </div>
              {/* FIX 2: Status filter uses display labels from STATUS_FILTER_OPTIONS */}
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* FIX 3: Bulk bar — Edit button replaces inline status dropdown */}
            {selected.size > 0 && (
              <div className={styles.bulkBar}>
                <span className={styles.bulkCount}>{selected.size} selected</span>
                <button
                  type="button"
                  className={styles.bulkEditBtn}
                  disabled={bulkLoading}
                  onClick={handleBulkEdit}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.bulkDelete}
                  onClick={handleBulkDelete}
                  disabled={bulkLoading}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className={styles.bulkDeselect}
                  onClick={() => setSelected(new Set())}
                  disabled={bulkLoading}
                >
                  Deselect all
                </button>
              </div>
            )}

            <div className={styles.toolbarRight}>
              <button type="button" className={styles.btnGhost} onClick={openImportModal}>Import</button>
              <button type="button" className={styles.btnGhost} onClick={handleExport}>Export</button>
              <select
                className={styles.sortSelect}
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(":");
                  setSortKey(k); setSortDir(d);
                }}
              >
                <option value="created:desc">Newest first</option>
                <option value="created:asc">Oldest first</option>
                <option value="price:asc">Price: Low to High</option>
                <option value="price:desc">Price: High to Low</option>
                <option value="views:desc">Most viewed</option>
                <option value="sales:desc">Most sold</option>
                <option value="revenue:desc">Most revenue</option>
                <option value="title:asc">Alphabetical</option>
                <option value="updated:desc">Recently updated</option>
              </select>
            </div>
          </div>

          {/* ── Section 3: Product table ─────────────────────── */}
          {filtered.length === 0 ? (
            <div className={styles.emptyFilter}>
              <p>No products match your search.</p>
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => { setSearchRaw(""); setStatusFilter("all"); }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead className={styles.tableHead}>
                  <tr>
                    {/* FIX 4: Consistent alignment with colCheckbox / colCenter / colLeft */}
                    <th className={`${styles.th} ${styles.thCheck} ${styles.colCheckbox}`}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className={`${styles.th} ${styles.thImg}`} />
                    <th className={`${styles.th} ${styles.thTitle} ${styles.colLeft}`} onClick={() => handleColumnSort("title")}>
                      Product{sortIndicator("title")}
                    </th>
                    <th className={`${styles.th} ${styles.thNum} ${styles.colCenter}`} onClick={() => handleColumnSort("views")}>
                      Views{sortIndicator("views")}
                    </th>
                    <th className={`${styles.th} ${styles.thPrice} ${styles.colCenter}`} onClick={() => handleColumnSort("price")}>
                      Price{sortIndicator("price")}
                    </th>
                    <th className={`${styles.th} ${styles.thNum} ${styles.colCenter}`} onClick={() => handleColumnSort("sales")}>
                      Sales{sortIndicator("sales")}
                    </th>
                    <th className={`${styles.th} ${styles.thNum} ${styles.colCenter}`} onClick={() => handleColumnSort("revenue")}>
                      Revenue{sortIndicator("revenue")}
                    </th>
                    <th className={`${styles.th} ${styles.thDate} ${styles.colCenter}`} onClick={() => handleColumnSort("updated")}>
                      Updated{sortIndicator("updated")}
                    </th>
                    <th className={`${styles.th} ${styles.thStatus} ${styles.colCenter}`}>Status</th>
                    <th className={`${styles.th} ${styles.thActions}`} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <ProductRow
                      key={p.id}
                      p={p}
                      selected={selected.has(p.id)}
                      onSelect={handleSelectOne}
                      onMenuOpen={openMenu}
                      onStatusChange={handleStatusChange}
                      onPriceChange={handlePriceChange}
                      deleting={deletingId === p.id}
                      duplicating={duplicatingId === p.id}
                      currency={currency}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── FIX 1: Fixed-position action dropdown (outside the table) ── */}
      {activeMenuProduct && (
        <div
          className={styles.actionMenu}
          data-role="action-menu"
          style={{ position: "fixed", top: menuPosition.top, right: menuPosition.right }}
        >
          <button
            type="button"
            className={styles.actionMenuItem}
            onClick={() => { setActiveMenuId(null); navigate(`/owner/products/${activeMenuProduct.id}/edit`); }}
          >
            ✏️ Edit
          </button>
          <button
            type="button"
            className={styles.actionMenuItem}
            onClick={() => handleDuplicate(activeMenuProduct)}
            disabled={duplicatingId === activeMenuProduct.id}
          >
            {duplicatingId === activeMenuProduct.id ? "…" : "📋 Duplicate"}
          </button>
          <button
            type="button"
            className={styles.actionMenuItem}
            onClick={() => { setActiveMenuId(null); window.open(`/store/${slug}/product/${activeMenuProduct.id}`, "_blank"); }}
          >
            👁 View in store
          </button>
          <button
            type="button"
            className={styles.actionMenuItem}
            onClick={() => handleCopyLink(activeMenuProduct)}
          >
            🔗 {copiedId === activeMenuProduct.id ? "Copied!" : "Copy share link"}
          </button>
          <div className={styles.actionMenuDivider} />
          <button
            type="button"
            className={`${styles.actionMenuItem} ${styles.actionMenuItemDanger}`}
            onClick={() => handleDelete(activeMenuProduct)}
            disabled={deletingId === activeMenuProduct.id}
          >
            {deletingId === activeMenuProduct.id ? "…" : "🗑 Delete"}
          </button>
        </div>
      )}

      {/* ── FIX 3: Bulk Edit Modal ───────────────────────────────── */}
      {showBulkEdit && (() => {
        const selectedProducts = (products || []).filter((p) => selected.has(p.id));
        const types = new Set(selectedProducts.map((p) => p.pricing_type || "fixed"));
        const sharedPricingType = types.size === 1 ? [...types][0] : null;
        return (
          <BulkEditModal
            count={selected.size}
            currency={currency}
            sharedPricingType={sharedPricingType}
            onClose={() => setShowBulkEdit(false)}
            onSave={handleBulkSave}
          />
        );
      })()}

      {/* ── Section 4: Import modal ───────────────────────────────── */}
      {showImport && (
        <ImportModal
          onClose={closeImportModal}
          onDownloadTemplate={handleDownloadTemplate}
          importFile={importFile}
          setImportFile={setImportFile}
          importDragging={importDragging}
          setImportDragging={setImportDragging}
          importLoading={importLoading}
          importResult={importResult}
          importError={importError}
          onImport={handleImportSubmit}
          fileInputRef={fileInputRef}
        />
      )}
    </div>
  );
}
