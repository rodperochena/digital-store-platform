import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import { fetchTypes, fetchCategories, searchTags as apiSearchTags } from "../../api/taxonomy";
import { createOwnerProduct, updateOwnerProduct, getOwnerProduct, deleteOwnerProduct, uploadDeliverableFile, uploadProductImage } from "../../api/owner";
import styles from "./ProductCreator.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON_MAP = {
  "template":      "📄",
  "ebook":         "📚",
  "design-asset":  "🎨",
  "photo-video":   "📸",
  "audio-music":   "🎵",
  "preset-filter": "🎛️",
  "font":          "🔤",
  "software-code": "💻",
  "ai-prompt":     "🤖",
  "printable":     "🖨️",
  "spreadsheet":   "📊",
  "other":         "📦",
};

const TITLE_PLACEHOLDERS = {
  "template":      "e.g., Monthly Budget Planner Template",
  "ebook":         "e.g., My First Novel",
  "design-asset":  "e.g., Premium Icon Pack",
  "photo-video":   "e.g., Aerial City Stock Photos",
  "audio-music":   "e.g., Chill Lofi Beats Pack",
  "preset-filter": "e.g., Cinematic Lightroom Presets",
  "font":          "e.g., Rustic Display Font Family",
  "software-code": "e.g., SaaS Starter Boilerplate",
  "ai-prompt":     "e.g., 50 ChatGPT Marketing Prompts",
  "printable":     "e.g., Weekly Planner Printable",
  "spreadsheet":   "e.g., Monthly Budget Tracker",
  "other":         "e.g., Complete Productivity Bundle",
};

const TAG_GROUP_COLORS = {
  tool:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  format:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  audience: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
};

// DB values unchanged; only display labels updated
const VISIBILITY_OPTIONS = [
  { value: "published", dot: "🟢", label: "Active",   desc: "Visible on your storefront and purchasable" },
  { value: "draft",     dot: "⚫", label: "Draft",    desc: "Only visible to you — not purchasable" },
  { value: "unlisted",  dot: "🟡", label: "Inactive", desc: "Hidden from storefront; accessible via direct link" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectUrlProvider(url) {
  if (!url) return null;
  if (url.includes("drive.google.com")) return { label: "Google Drive link detected", color: "#15803d" };
  if (url.includes("dropbox.com"))      return { label: "Dropbox link detected",      color: "#15803d" };
  if (url.startsWith("http"))           return { label: "Custom link",                color: "#6b7280" };
  return null;
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function formatPrice(cents, currency) {
  if (cents === 0) return "Free";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

// ── DescriptionToolbar ────────────────────────────────────────────────────────

function DescriptionToolbar({ textareaRef, onChange }) {
  function insertMarkdown(before, after = "") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    const text  = textarea.value;
    const selectedText = text.substring(start, end) || "text";
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 10);
  }

  return (
    <div className={styles.descToolbar}>
      <button type="button" className={styles.descToolbarBtn}
        onClick={() => insertMarkdown("**", "**")} title="Bold">
        <strong>B</strong>
      </button>
      <button type="button" className={styles.descToolbarBtn}
        onClick={() => insertMarkdown("*", "*")} title="Italic">
        <em>I</em>
      </button>
      <button type="button" className={styles.descToolbarBtn}
        onClick={() => insertMarkdown("\n- ", "")} title="Bullet list">
        ☰
      </button>
      <button type="button" className={styles.descToolbarBtn}
        onClick={() => insertMarkdown("[", "](https://)")} title="Insert link">
        🔗
      </button>
      <button type="button" className={styles.descToolbarBtn}
        onClick={() => insertMarkdown("\n## ", "")} title="Heading">
        H
      </button>
    </div>
  );
}

// ── InlineTypeSelector ────────────────────────────────────────────────────────

function InlineTypeSelector({
  types, categories, selectedType, selectedCategory,
  typeSearch, onTypeSearch, onTypeSelect, onCategorySelect,
  expanded, setExpanded,
}) {
  const [step, setStep] = useState(() => selectedType ? 2 : 1);

  // Reset step when re-expanding
  useEffect(() => {
    if (expanded) setStep(selectedType ? 2 : 1);
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compact summary (collapsed state)
  if (!expanded) {
    const icon    = TYPE_ICON_MAP[selectedType?.slug] || "📦";
    const summary = selectedType
      ? `${icon} ${selectedType.label}${selectedCategory ? ` → ${selectedCategory.label}` : ""}`
      : "No type selected";
    return (
      <div className={styles.formSection}>
        <div className={styles.typeSummaryRow}>
          <div>
            <span className={styles.formSectionTitle} style={{ fontSize: "0.8125rem", fontWeight: 400 }}>
              Product Type
            </span>
            <span className={styles.typeSummaryText}>{summary}</span>
          </div>
          <button type="button" className={styles.changeLink} onClick={() => setExpanded(true)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  const filteredTypes = typeSearch
    ? types.filter((t) => t.label.toLowerCase().includes(typeSearch.toLowerCase()))
    : types;

  // Step 1: type grid
  if (step === 1) {
    return (
      <div className={styles.formSection}>
        <div className={styles.typeSectionHeader}>
          <h2 className={styles.formSectionTitle}>Product Type</h2>
          <input
            className={styles.typeSearchInline}
            placeholder="Search types…"
            value={typeSearch}
            onChange={(e) => onTypeSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.typeGridInline}>
          {filteredTypes.map((type) => (
            <button key={type.slug} type="button"
              className={`${styles.typeCard} ${selectedType?.slug === type.slug ? styles.typeCardSelected : ""}`}
              onClick={() => { onTypeSelect(type); setStep(2); }}>
              <span className={styles.typeIcon}>{TYPE_ICON_MAP[type.slug] || type.icon || "📦"}</span>
              <span className={styles.typeLabel}>{type.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.typeSectionFooter}>
          <button type="button" className={styles.skipBtn} onClick={() => setExpanded(false)}>
            Skip — continue without type
          </button>
        </div>
      </div>
    );
  }

  // Step 2: category grid
  return (
    <div className={styles.formSection}>
      <div className={styles.typeSectionHeader}>
        <button type="button" className={styles.backBtnInline} onClick={() => setStep(1)}>← Back</button>
        <h2 className={styles.formSectionTitle}>
          {TYPE_ICON_MAP[selectedType?.slug] || "📦"} {selectedType?.label} → Category
        </h2>
      </div>
      {categories.length === 0 ? (
        <p className={styles.formHint}>Loading categories…</p>
      ) : (
        <div className={styles.categoryGridInline}>
          {categories.map((cat) => (
            <button key={cat.slug} type="button"
              className={`${styles.categoryCard} ${selectedCategory?.slug === cat.slug ? styles.categoryCardSelected : ""}`}
              onClick={() => { onCategorySelect(cat); setExpanded(false); }}>
              {cat.label}
            </button>
          ))}
          <button type="button" className={styles.categoryCard}
            onClick={() => { onCategorySelect({ slug: "other", label: "Other" }); setExpanded(false); }}>
            Other
          </button>
        </div>
      )}
      <div className={styles.typeSectionFooter}>
        <button type="button" className={styles.skipBtn} onClick={() => setExpanded(false)}>
          Continue without category
        </button>
      </div>
    </div>
  );
}

// ── PreviewCarousel ──────────────────────────────────────────────────────────

function PreviewCarousel({ mediaItems }) {
  const [idx, setIdx] = useState(0);

  // Keep index in bounds when items are removed
  useEffect(() => {
    if (mediaItems.length > 0 && idx >= mediaItems.length) {
      setIdx(mediaItems.length - 1);
    }
  }, [mediaItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mediaItems.length) {
    return (
      <div className={styles.carouselContainer}>
        <div className={styles.previewCoverPlaceholder}>
          <span className={styles.previewCoverIcon}>📷</span>
          <span className={styles.previewCoverText}>No cover image</span>
        </div>
      </div>
    );
  }

  const current = mediaItems[idx] || mediaItems[0];
  const multi   = mediaItems.length > 1;

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carouselSlide}>
        {current.type === "image" ? (
          <img src={current.url} alt="Product" className={styles.carouselImage} />
        ) : (
          <iframe
            src={`https://www.youtube.com/embed/${current.videoId}`}
            className={styles.carouselVideo}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Product video preview"
          />
        )}
      </div>

      {multi && (
        <>
          <button type="button" className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
            onClick={() => setIdx((p) => (p === 0 ? mediaItems.length - 1 : p - 1))}>
            ‹
          </button>
          <button type="button" className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
            onClick={() => setIdx((p) => (p === mediaItems.length - 1 ? 0 : p + 1))}>
            ›
          </button>
          <div className={styles.carouselDots}>
            {mediaItems.map((m, i) => (
              <button key={i} type="button"
                className={`${styles.carouselDot} ${i === idx ? styles.carouselDotActive : ""} ${m.type === "video" ? styles.carouselDotVideo : ""}`}
                onClick={() => setIdx(i)}
                title={m.type === "video" ? "Video" : `Image ${i + 1}`}
              />
            ))}
          </div>
          <div className={styles.carouselCounter}>{idx + 1} / {mediaItems.length}</div>
        </>
      )}
    </div>
  );
}

// ── LivePreview ───────────────────────────────────────────────────────────────

function LivePreview({ form, mediaOrder, selectedType, selectedCategory, tags, currency, productId, slug }) {
  function getDisplayPrice() {
    if (form.price_cents === 0 && form.pricing_type !== "pay_what_you_want") return "Free";
    if (form.pricing_type === "pay_what_you_want") {
      const minCents = form.minimum_price_cents || 100;
      if (form.price_cents > 0) return `${formatPrice(form.price_cents, currency)}+`;
      return `From ${formatPrice(minCents, currency)}`;
    }
    return formatPrice(form.price_cents, currency);
  }
  const displayPrice = getDisplayPrice();
  const typeIcon     = selectedType ? (TYPE_ICON_MAP[selectedType.slug] || "📦") : null;
  const previewUrl   = productId && slug ? `/store/${slug}/product/${productId}` : null;

  return (
    <div className={styles.previewWrap}>
      <div className={styles.previewWrapHeader}>
        <span className={styles.previewWrapLabel}>Live Preview</span>
        <span className={styles.previewWrapHint}>Updates as you type</span>
      </div>
      <div className={styles.previewCard}>
        <PreviewCarousel mediaItems={mediaOrder || []} />

        <div className={styles.previewBody}>
          <h3 className={styles.previewTitle}>
            {form.title || <em style={{ color: "#9ca3af", fontWeight: 400 }}>Untitled Product</em>}
          </h3>
          {form.short_description && (
            <p className={styles.previewTagline}>{form.short_description}</p>
          )}
          {form.pricing_type === "pay_what_you_want" ? (
            <>
              <p className={styles.previewPricePwyw}>Pay what you want</p>
              <p className={styles.previewPriceFrom}>
                from {formatPrice(Math.max(100, form.minimum_price_cents), currency)}
              </p>
            </>
          ) : (
            <p className={styles.previewPrice}>{displayPrice}</p>
          )}

          {form.description && (
            <p className={styles.previewDesc}>
              {form.description.slice(0, 100)}
              {form.description.length > 100 ? "…" : ""}
            </p>
          )}

          <div className={styles.previewBuyBtn}>
            {form.cta_text.trim()
              ? form.cta_text.trim()
              : form.pricing_type === "pay_what_you_want" ? "Name Your Price" : "Buy Now"}
          </div>

          {form.delivery_file_name && (
            <p className={styles.previewFileInfo}>
              📎 {form.delivery_file_name}
              {form.delivery_file_size_bytes ? ` · ${(form.delivery_file_size_bytes / 1048576).toFixed(1)} MB` : ""}
            </p>
          )}

          {(selectedType || selectedCategory) && (
            <p className={styles.previewMeta}>
              {typeIcon && `${typeIcon} `}
              {selectedType?.label}
              {selectedCategory && ` · ${selectedCategory.label}`}
            </p>
          )}

          {tags.length > 0 && (
            <div className={styles.previewTags}>
              {tags.slice(0, 5).map((t) => (
                <span key={t.slug} className={styles.previewTagPill}>{t.label}</span>
              ))}
              {tags.length > 5 && (
                <span className={styles.previewTagPill}>+{tags.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {previewUrl ? (
        <a href={previewUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
          Preview on storefront ↗
        </a>
      ) : (
        <span className={styles.previewLinkDisabled}>Save to preview on storefront</span>
      )}
    </div>
  );
}

// ── ReadinessChecklist ────────────────────────────────────────────────────────

function ReadinessChecklist({ form, imageUrls, hasDelivery, completeness, isReadyToPublish }) {
  const items = [
    { label: "Title",        done: !!form.title.trim(),                 required: true  },
    { label: "Price",        done: form.price_cents > 0 || form.pricing_type === "pay_what_you_want", required: true  },
    { label: "Delivery",     done: hasDelivery,                         required: true  },
    { label: "Cover image",  done: imageUrls.length > 0,                required: false },
    { label: "Description",  done: !!form.description.trim(),           required: false },
  ];

  return (
    <div className={styles.readinessCard}>
      <div className={styles.readinessHeader}>
        <h3 className={styles.readinessTitle}>Product Readiness</h3>
        <span className={styles.readinessPct}>{completeness}%</span>
      </div>
      <div className={styles.readinessTrack}>
        <div className={styles.readinessFill} style={{ width: `${completeness}%` }} />
      </div>
      <ul className={styles.readinessList}>
        {items.map((item) => (
          <li key={item.label} className={styles.readinessItem}>
            <span>{item.done ? "✅" : "⬜"}</span>
            <span className={`${styles.readinessLabel} ${!item.done && item.required ? styles.readinessMissing : ""}`}>
              {item.label}
            </span>
            {!item.done && !item.required && (
              <span className={styles.readinessHint}>Recommended</span>
            )}
          </li>
        ))}
      </ul>
      {isReadyToPublish && (
        <div className={styles.readyBadge}>✅ Ready to publish</div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProductCreator() {
  const { id: editId } = useParams();
  const isEdit         = Boolean(editId);
  const navigate       = useNavigate();
  const { ownerCtx, ownerStore } = useOwner();

  // Taxonomy
  const [types,      setTypes]      = useState([]);
  const [categories, setCategories] = useState([]);

  // Type/category selection
  const [selectedType,     setSelectedType]     = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [typeSearch,       setTypeSearch]       = useState("");
  const [typeExpanded,     setTypeExpanded]     = useState(!isEdit);

  // Form state
  const [form, setForm] = useState({
    title:                    "",
    short_description:        "",
    description:              "",
    price_cents:              0,
    visibility:               "draft",
    delivery_url:             "",
    delivery_file_key:        null,
    delivery_file_name:       null,
    delivery_file_size_bytes: null,
    video_url:                "",
    pricing_type:             "fixed",
    minimum_price_cents:      100,
    cta_text:                 "",
    seo_title:                "",
    seo_description:          "",
    slug:                     "",
  });
  const [tags,      setTags]      = useState([]);
  const [imageUrls, setImageUrls] = useState([]); // replaces form.image_url
  const [mediaOrder, setMediaOrder] = useState([]);

  // File size state (split number+unit UI)
  const [fileSizeValue, setFileSizeValue] = useState("");
  const [showFileSize,  setShowFileSize]  = useState(false);

  // Delivery mode: "url" | "upload"
  const [deliveryMode,         setDeliveryMode]         = useState("url");
  const [uploadingDeliverable, setUploadingDeliverable] = useState(false);
  const [deliverableError,     setDeliverableError]     = useState(null);

  // Image upload
  const [uploadingImage,       setUploadingImage]       = useState(false);
  const [imageError,           setImageError]           = useState(null);
  const [imageCompressMessage, setImageCompressMessage] = useState(null);
  const imageInputRef = useRef(null);

  // Media drag-to-reorder (unified images + video)
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Tags state for grouped pill selector
  const [allTags,   setAllTags]   = useState([]);
  const [tagSearch, setTagSearch] = useState("");

  // Price display state (separate from cents — prevents keystroke conversion bugs)
  const [priceDisplay,    setPriceDisplay]    = useState("");
  const [minPriceDisplay, setMinPriceDisplay] = useState("1.00");

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialLoadDone,   setInitialLoadDone]   = useState(false);

  // UI state
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [loading,     setLoading]     = useState(isEdit);
  const [fieldErrors, setFieldErrors] = useState({});
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [seoExpanded,        setSeoExpanded]        = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const currency = (ownerStore?.currency || "usd").toUpperCase();

  // Refs
  const titleRef    = useRef(null);
  const deliveryRef = useRef(null);
  const descRef     = useRef(null);

  // Load taxonomy types
  useEffect(() => {
    fetchTypes().then(setTypes).catch(() => {});
  }, []);

  // Load all tags for grouped pill selector
  useEffect(() => {
    apiSearchTags("").then(setAllTags).catch(() => {});
  }, []);

  // Load categories when type selected
  useEffect(() => {
    if (!selectedType) { setCategories([]); return; }
    fetchCategories(selectedType.slug).then(setCategories).catch(() => {});
  }, [selectedType]);

  // Load existing product if editing
  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getOwnerProduct(editId, ownerCtx).then((data) => {
      const p = data.product;
      if (p.product_type) {
        const found = types.find((x) => x.slug === p.product_type);
        setSelectedType(found || { slug: p.product_type, label: p.product_type, icon: TYPE_ICON_MAP[p.product_type] || "📦" });
      }
      if (p.product_category) {
        setSelectedCategory({ slug: p.product_category, label: p.product_category });
      }
      setForm({
        title:                    p.title                    || "",
        short_description:        p.short_description        || "",
        description:              p.description              || "",
        price_cents:              Number(p.price_cents              ?? 0),
        visibility:               p.visibility               || "draft",
        delivery_url:             p.delivery_url             || "",
        delivery_file_key:        p.delivery_file_key        || null,
        delivery_file_name:       p.delivery_file_name       || null,
        delivery_file_size_bytes: p.delivery_file_size_bytes ? Number(p.delivery_file_size_bytes) : null,
        video_url:                p.video_url                || "",
        pricing_type:             p.pricing_type             || "fixed",
        minimum_price_cents:      Number(p.minimum_price_cents      ?? 100),
        cta_text:                 p.cta_text                 || "",
        seo_title:                p.seo_title                || "",
        seo_description:          p.seo_description          || "",
        slug:                     p.slug                     || "",
      });
      if (p.slug) setSlugManuallyEdited(true);
      // Backfill: prefer image_urls array, fall back to legacy image_url
      const imgs = p.image_urls?.length
        ? p.image_urls
        : (p.image_url ? [p.image_url] : []);
      setImageUrls(imgs);
      // Delivery mode
      if (p.delivery_file_key) setDeliveryMode("upload");
      // Init file size fields
      if (p.file_size_display) {
        const m = p.file_size_display.match(/^([\d.]+)\s*MB$/i);
        setFileSizeValue(m ? m[1] : p.file_size_display);
        setShowFileSize(true);
      } else if (p.delivery_file_size_bytes) {
        setFileSizeValue((p.delivery_file_size_bytes / (1024 * 1024)).toFixed(1));
        setShowFileSize(true);
      }
      if (p.product_tags?.length) {
        setTags(p.product_tags.map((slug) => {
          if (slug.startsWith("custom-")) {
            const label = slug.replace(/^custom-/, "").replace(/-/g, " ");
            return { slug, label: label.charAt(0).toUpperCase() + label.slice(1), group_name: "custom", isCustom: true };
          }
          return { slug, label: slug, group_name: "tool" };
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isEdit, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync price display strings whenever form loads (edit) or resets
  useEffect(() => {
    setPriceDisplay(form.price_cents > 0 ? (form.price_cents / 100).toFixed(2) : "");
    setMinPriceDisplay((form.minimum_price_cents / 100).toFixed(2));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark initial load done after a short delay (lets edit-mode populate form first)
  useEffect(() => {
    const t = setTimeout(() => setInitialLoadDone(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Re-resolve predefined tag metadata once allTags loads (handles race with product load)
  useEffect(() => {
    if (!allTags.length) return;
    setTags((prev) =>
      prev.map((tag) => {
        if (tag.isCustom) return tag;
        const found = allTags.find((t) => t.slug === tag.slug);
        return found || tag;
      })
    );
  }, [allTags]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for changes AFTER initial load — guards against edit-mode populate race
  useEffect(() => {
    if (!initialLoadDone) return;
    setHasUnsavedChanges(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.title, form.description, form.price_cents, form.delivery_url,
    form.delivery_file_key, form.visibility, form.pricing_type,
    form.minimum_price_cents,
  ]);

  // Warn on browser close/tab close when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Re-resolve category label once categories load
  useEffect(() => {
    if (!selectedCategory || !categories.length) return;
    const found = categories.find((c) => c.slug === selectedCategory.slug);
    if (found && found.label !== selectedCategory.label) setSelectedCategory(found);
  }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, val) {
    setForm((f) => {
      const next = { ...f, [key]: val };
      // Auto-generate slug from title if user hasn't manually edited it
      if (key === "title" && !slugManuallyEdited) {
        next.slug = generateSlug(val);
      }
      return next;
    });
    setHasUnsavedChanges(true);
  }

  function handleBlur(field) {
    let msg = null;
    if (field === "title" && !form.title.trim()) {
      msg = "Title is required";
    } else if ((field === "delivery_url" || field === "image_url") && form[field] && !form[field].startsWith("http")) {
      msg = "Must start with http:// or https://";
    }
    setFieldErrors((prev) => ({ ...prev, [field]: msg ?? null }));
  }

  // Tag helpers for grouped pill selector
  function addTagInline(tag) {
    if (tags.length >= 8) return;
    if (tags.find((t) => t.slug === tag.slug)) return;
    setTags([...tags, tag]);
    setHasUnsavedChanges(true);
  }

  function removeTagInline(slug) {
    setTags(tags.filter((t) => t.slug !== slug));
    setHasUnsavedChanges(true);
  }

  function handleTagSearchKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.target.value.trim();
      if (!raw || tags.length >= 8) return;
      // Prefer an exact predefined match
      const matched = allTags.find((t) => t.label.toLowerCase() === raw.toLowerCase());
      if (matched) {
        if (!tags.some((t) => t.slug === matched.slug)) addTagInline(matched);
      } else {
        if (raw.length > 30) return;
        const slug = `custom-${raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        if (tags.some((t) => t.slug === slug)) return;
        addTagInline({ slug, label: raw.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "), group_name: "custom", isCustom: true });
      }
      setTagSearch("");
    }
    if (e.key === "Backspace" && !e.target.value && tags.length > 0) {
      e.preventDefault();
      removeTagInline(tags[tags.length - 1].slug);
    }
  }

  // ── Image compression (Canvas API — no npm package) ────────────────────────

  function compressImage(file, maxSizeMB = 2, maxDimension = 2048) {
    return new Promise((resolve, reject) => {
      if (file.size <= maxSizeMB * 1024 * 1024) {
        resolve({ file, compressed: false });
        return;
      }
      const img    = new Image();
      const canvas = document.createElement("canvas");
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) { height = Math.round((height * maxDimension) / width);  width  = maxDimension; }
            else                { width  = Math.round((width  * maxDimension) / height); height = maxDimension; }
          }
          canvas.width  = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          let quality = 0.85;
          const tryCompress = () => {
            canvas.toBlob((blob) => {
              if (blob.size <= maxSizeMB * 1024 * 1024 || quality <= 0.3) {
                resolve({
                  file: new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }),
                  compressed: true,
                  originalSize: file.size,
                  compressedSize: blob.size,
                });
              } else {
                quality -= 0.1;
                tryCompress();
              }
            }, "image/jpeg", quality);
          };
          tryCompress();
        };
        img.onerror = () => reject(new Error("Failed to load image for compression"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });
  }

  // ── Upload handlers ─────────────────────────────────────────────────────────

  async function handleDeliverableUpload(file) {
    setUploadingDeliverable(true);
    setDeliverableError(null);
    try {
      const data = await uploadDeliverableFile(file, ownerCtx);
      setForm((f) => ({
        ...f,
        delivery_file_key:        data.key,
        delivery_file_size_bytes: data.size,
        delivery_file_name:       data.name,
        delivery_url:             "",
      }));
      setFileSizeValue((data.size / (1024 * 1024)).toFixed(1));
      setShowFileSize(true);
    } catch (err) {
      setDeliverableError(err.message);
    } finally {
      setUploadingDeliverable(false);
    }
  }

  async function handleImageUpload(file) {
    if (imageUrls.length >= 10) return;
    setUploadingImage(true);
    setImageError(null);
    setImageCompressMessage(null);
    try {
      const { file: processedFile, compressed, originalSize, compressedSize } =
        await compressImage(file, 2, 2048);
      if (compressed) {
        const msg = `Image compressed from ${(originalSize / 1048576).toFixed(1)} MB to ${(compressedSize / 1048576).toFixed(1)} MB while preserving quality.`;
        setImageCompressMessage(msg);
        setTimeout(() => setImageCompressMessage(null), 5000);
      }
      const data = await uploadProductImage(processedFile, isEdit ? editId : null, ownerCtx);
      setImageUrls((prev) => [...prev, data.url]);
      setHasUnsavedChanges(true);
    } catch (err) {
      setImageError(err.message);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleDeliverableDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleDeliverableUpload(file);
  }

  // ── mediaOrder sync ──────────────────────────────────────────────────────────
  // Keeps mediaOrder in sync with imageUrls + video_url, preserving drag order.

  useEffect(() => {
    const vidId = extractYoutubeId(form.video_url);
    setMediaOrder((prev) => {
      const imageSet = new Set(imageUrls);
      const prevImages = prev.filter((m) => m.type === "image");
      const prevVideo  = prev.find((m) => m.type === "video");
      const imagesMatch = prevImages.length === imageUrls.length && prevImages.every((m) => imageSet.has(m.url));
      const videoMatch  = vidId ? !!prevVideo && prevVideo.videoId === vidId : !prevVideo;
      if (imagesMatch && videoMatch) return prev; // already in sync
      const kept = prev.filter((m) =>
        (m.type === "image" && imageSet.has(m.url)) ||
        (m.type === "video" && vidId && m.videoId === vidId)
      );
      const keptImgUrls = new Set(kept.filter((m) => m.type === "image").map((m) => m.url));
      const newImgs = imageUrls.filter((u) => !keptImgUrls.has(u)).map((u) => ({ type: "image", url: u }));
      const newVid  = vidId && !kept.some((m) => m.type === "video")
        ? [{ type: "video", videoId: vidId, url: form.video_url }]
        : [];
      return [...kept, ...newImgs, ...newVid];
    });
  }, [imageUrls, form.video_url]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media drag-to-reorder ─────────────────────────────────────────────────────

  function handleImageDragStart(e, idx) {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function handleImageDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  }

  function handleImageDragLeave() {
    setDragOverIdx(null);
  }

  function handleImageDrop(e, dropIdx) {
    e.preventDefault();
    setDragOverIdx(null);
    if (draggedIdx === null || draggedIdx === dropIdx) { setDraggedIdx(null); return; }
    const next = [...mediaOrder];
    const [moved] = next.splice(draggedIdx, 1);
    next.splice(dropIdx, 0, moved);
    setMediaOrder(next);
    // Sync imageUrls order from new mediaOrder
    setImageUrls(next.filter((m) => m.type === "image").map((m) => m.url));
    setHasUnsavedChanges(true);
    setDraggedIdx(null);
  }

  function handleImageDragEnd() {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }

  // Derived values
  const isValidDeliveryUrl = form.delivery_url.startsWith("http://") || form.delivery_url.startsWith("https://");
  const youtubeId          = extractYoutubeId(form.video_url);
  const urlHint            = detectUrlProvider(form.delivery_url);
  const hasDelivery        = deliveryMode === "upload" ? !!form.delivery_file_key : !!form.delivery_url.trim();
  const isMissingDelivery  = form.visibility === "published" && !hasDelivery;

  const completeness = [
    form.title.trim(),
    form.price_cents > 0 || form.pricing_type === "pay_what_you_want",
    hasDelivery,
    form.description.trim(),
    imageUrls.length > 0,
  ].filter(Boolean).length * 20;

  const isReadyToPublish = !!(form.title.trim() && (form.price_cents > 0 || form.pricing_type === "pay_what_you_want") && hasDelivery);

  // Adaptive save button config based on current visibility
  const saveConfig = {
    published: { label: saving ? "Saving…" : "Save & Publish", cls: styles.btnSavePublish },
    draft:     { label: saving ? "Saving…" : "Save Draft",     cls: styles.btnSaveDraft    },
    unlisted:  { label: saving ? "Saving…" : "Save as Inactive", cls: styles.btnSaveInactive },
  }[form.visibility] || { label: saving ? "Saving…" : "Save", cls: styles.btnSaveDraft };

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);
    const visibility = form.visibility;

    // Title always required
    if (!form.title.trim()) {
      setFieldErrors((prev) => ({ ...prev, title: "Title is required" }));
      titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Delivery required when publishing
    if (visibility === "published" && !hasDelivery) {
      setFieldErrors((prev) => ({ ...prev, delivery_url: "A download file or URL is required to publish" }));
      deliveryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const price_cents       = Math.max(0, Math.round(form.price_cents));
    const file_size_display = showFileSize && fileSizeValue ? `${fileSizeValue} MB` : undefined;

    const body = {
      title:                    form.title.trim(),
      short_description:        isEdit ? (form.short_description.trim() || null) : (form.short_description.trim() || undefined),
      description:              form.description.trim() || undefined,
      price_cents,
      delivery_url:             deliveryMode === "url" ? (form.delivery_url.trim() || undefined) : undefined,
      delivery_file_key:        deliveryMode === "upload" ? (form.delivery_file_key || undefined) : null,
      delivery_file_size_bytes: deliveryMode === "upload" ? (form.delivery_file_size_bytes ? Number(form.delivery_file_size_bytes) : undefined) : null,
      delivery_file_name:       deliveryMode === "upload" ? (form.delivery_file_name || undefined) : null,
      image_url:                isEdit ? (imageUrls[0] ?? null) : (imageUrls[0] || undefined),
      image_urls:               isEdit ? imageUrls : (imageUrls.length ? imageUrls : undefined),
      video_url:                isEdit ? (form.video_url.trim() || null) : (form.video_url.trim() || undefined),
      file_size_display,
      visibility,
      pricing_type:             form.pricing_type,
      minimum_price_cents:      form.pricing_type === "pay_what_you_want"
                                  ? Math.max(100, form.minimum_price_cents)
                                  : undefined,
      cta_text:                 isEdit ? (form.cta_text.trim() || null) : (form.cta_text.trim() || undefined),
      seo_title:                isEdit ? (form.seo_title.trim() || null) : (form.seo_title.trim() || undefined),
      seo_description:          isEdit ? (form.seo_description.trim() || null) : (form.seo_description.trim() || undefined),
      slug:                     isEdit ? (form.slug.trim() || null) : (form.slug.trim() || undefined),
      product_type:             selectedType?.slug     ?? undefined,
      product_category:         selectedCategory?.slug ?? undefined,
      product_tags:             tags.map((t) => t.slug),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateOwnerProduct(editId, body, ownerCtx);
      } else {
        await createOwnerProduct(body, ownerCtx);
      }
      setHasUnsavedChanges(false);
      setInitialLoadDone(false);
      navigate("/owner/products");
    } catch (e) {
      setError(e.message ?? "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm(`Delete "${form.title || "this product"}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteOwnerProduct(editId, ownerCtx);
      navigate("/owner/products");
    } catch (e) {
      setError(e.message ?? "Failed to delete product");
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingMsg}>Loading product…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── Page header ────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backLink} onClick={() => {
          if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return;
          navigate("/owner/products");
        }}>
          ← Back to Products
        </button>
        <div className={styles.completenessWrap}>
          <div className={styles.completenessTrack}>
            <div className={styles.completenessFill} style={{ width: `${completeness}%` }} />
          </div>
          <span className={styles.completenessPct}>{completeness}% complete</span>
        </div>
      </div>

      <h1 className={styles.pageTitle}>
        {isEdit ? `Edit: ${form.title || "Untitled"}` : "Create New Product"}
      </h1>
      {(selectedType || selectedCategory) && (
        <p className={styles.pageMeta}>
          {TYPE_ICON_MAP[selectedType?.slug] || ""} {selectedType?.label || ""}
          {selectedCategory ? ` → ${selectedCategory.label}` : ""}
        </p>
      )}

      {/* Mobile preview toggle */}
      <button
        type="button"
        className={styles.mobilePreviewToggle}
        onClick={() => setMobilePreviewOpen((v) => !v)}
      >
        {mobilePreviewOpen ? "▲ Hide Preview" : "▼ Show Preview"}
      </button>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* ── Two-column editor ──────────────────────────────────── */}
      <div className={styles.editorLayout}>

        {/* RIGHT COLUMN — first in DOM so CSS order can put it above on mobile */}
        <div className={`${styles.rightColumn} ${!mobilePreviewOpen ? styles.rightColumnHidden : ""}`}>
          <LivePreview
            form={form}
            mediaOrder={mediaOrder}
            selectedType={selectedType}
            selectedCategory={selectedCategory}
            tags={tags}
            currency={currency}
            productId={isEdit ? editId : null}
            slug={ownerStore?.slug}
          />
          <ReadinessChecklist
            form={form}
            imageUrls={imageUrls}
            hasDelivery={hasDelivery}
            completeness={completeness}
            isReadyToPublish={isReadyToPublish}
          />
        </div>

        {/* LEFT COLUMN — Form */}
        <div className={styles.formColumn}>

          {/* ── Type selector ─────────────────────────────────── */}
          <InlineTypeSelector
            types={types}
            categories={categories}
            selectedType={selectedType}
            selectedCategory={selectedCategory}
            typeSearch={typeSearch}
            onTypeSearch={setTypeSearch}
            onTypeSelect={(type) => { setSelectedType(type); setSelectedCategory(null); }}
            onCategorySelect={setSelectedCategory}
            expanded={typeExpanded}
            setExpanded={setTypeExpanded}
          />

          {/* ── Basic Info ────────────────────────────────────── */}
          <section className={styles.formSection}>
            <h2 className={styles.formSectionTitle}>Basic Info</h2>

            {/* Title */}
            <div className={styles.formField} ref={titleRef}>
              <div className={styles.formLabelRow}>
                <label className={styles.formLabel}>Title <span className={styles.req}>*</span></label>
                <span className={styles.charCount}>{form.title.length}/200</span>
              </div>
              <input
                className={`${styles.formInput} ${fieldErrors.title ? styles.formInputError : ""}`}
                placeholder={TITLE_PLACEHOLDERS[selectedType?.slug] || "e.g., Awesome Digital Product"}
                value={form.title}
                onChange={(e) => {
                  setField("title", e.target.value);
                  if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: null }));
                }}
                onBlur={() => handleBlur("title")}
                maxLength={200}
              />
              {fieldErrors.title && <span className={styles.formError}>{fieldErrors.title}</span>}
            </div>

            {/* Short Description */}
            <div className={styles.formField}>
              <div className={styles.formLabelRow}>
                <label className={styles.formLabel}>
                  Tagline <span className={styles.optional}>optional</span>
                </label>
                <span className={styles.charCount}>{form.short_description.length}/200</span>
              </div>
              <input
                className={styles.formInput}
                placeholder="One-line hook that appears on storefront cards (e.g., 50 ready-to-use Notion templates)"
                value={form.short_description}
                onChange={(e) => setField("short_description", e.target.value)}
                maxLength={200}
              />
              <span className={styles.formHint}>Shown below the title on storefront cards. Falls back to description if empty.</span>
            </div>

            {/* Product Images */}
            <div className={styles.formField}>
              <div className={styles.formLabelRow}>
                <label className={styles.formLabel}>Product Images <span className={styles.optional}>optional · up to 10</span></label>
              </div>
              <div className={styles.imageGrid}>
                {mediaOrder.map((item, idx) => (
                  <div
                    key={(item.url || item.videoId) + idx}
                    className={`${styles.imageThumbnail} ${draggedIdx === idx ? styles.imageDragging : ""} ${dragOverIdx === idx ? styles.imageDragOver : ""}`}
                    draggable
                    onDragStart={(e) => handleImageDragStart(e, idx)}
                    onDragOver={(e) => handleImageDragOver(e, idx)}
                    onDragLeave={handleImageDragLeave}
                    onDrop={(e) => handleImageDrop(e, idx)}
                    onDragEnd={handleImageDragEnd}
                  >
                    {item.type === "video" ? (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                          alt="Video thumbnail"
                          className={styles.imageThumb}
                        />
                        <div className={styles.videoOverlay}>
                          <span className={styles.videoPlayIcon}>▶</span>
                        </div>
                        <span className={styles.videoBadge}>VIDEO</span>
                      </>
                    ) : (
                      <>
                        <img src={item.url} alt={`Image ${idx + 1}`} className={styles.imageThumb} />
                        {idx === 0 && <span className={styles.imageCoverBadge}>COVER</span>}
                      </>
                    )}
                    <span className={styles.dragHandle} title="Drag to reorder">⋮⋮</span>
                    <button type="button" className={styles.removeImageBtn}
                      onClick={() => {
                        if (item.type === "video") {
                          setField("video_url", "");
                        } else {
                          setImageUrls((prev) => prev.filter((u) => u !== item.url));
                          setHasUnsavedChanges(true);
                        }
                      }}>
                      ✕
                    </button>
                  </div>
                ))}
                {imageUrls.length < 10 && (
                  <button type="button" className={styles.addImageSlot}
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImage}>
                    {uploadingImage ? (
                      <span className={styles.uploadingSpinner}>…</span>
                    ) : (
                      <>
                        <span className={styles.addImageIcon}>+</span>
                        <span className={styles.addImageText}>Add image</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
              />
              <p className={styles.imageRecommendation}>📐 Recommended: 1080 × 1080px square for best results. Max 2 MB per image — larger files are compressed automatically.</p>
              {imageCompressMessage && (
                <div className={styles.compressMessage}>✅ {imageCompressMessage}</div>
              )}
              {imageError && <span className={styles.formError}>{imageError}</span>}
              <div className={styles.imageUrlPasteRow}>
                <span className={styles.imageUrlPasteLabel}>Or paste URL:</span>
                <input
                  className={styles.imageUrlPasteInput}
                  placeholder="https://…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = e.target.value.trim();
                      if (v.startsWith("http") && imageUrls.length < 10) {
                        setImageUrls((prev) => [...prev, v]);
                        e.target.value = "";
                      }
                    }
                  }}
                />
              </div>
              <span className={styles.formHint}>First image is the cover. Max 2 MB per image · JPG, PNG, WebP, GIF</span>
            </div>

            {/* Video Preview */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>
                Video Preview (YouTube) <span className={styles.optional}>optional</span>
              </label>
              <input
                className={styles.formInput}
                placeholder="https://youtube.com/watch?v=..."
                value={form.video_url}
                onChange={(e) => setField("video_url", e.target.value)}
              />
              <span className={styles.formHint}>Add a YouTube video to showcase your product.</span>
              {youtubeId && (
                <div className={styles.videoPreview}>
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    width="100%"
                    height="200"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Video preview"
                    style={{ borderRadius: 8, display: "block" }}
                  />
                </div>
              )}
            </div>

            {/* Price */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>
                {form.pricing_type === "pay_what_you_want" ? "Suggested Price" : "Price"}
                {" "}<span className={styles.req}>*</span>
              </label>
              <div className={styles.priceRow}>
                <div className={styles.priceInputGroup}>
                  <span className={styles.priceCurrency}>{currency}</span>
                  <input
                    className={styles.priceInput}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={priceDisplay}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^\d*\.?\d{0,2}$/.test(v) || v === "") setPriceDisplay(v);
                    }}
                    onBlur={() => {
                      const num = parseFloat(priceDisplay);
                      if (isNaN(num) || num <= 0) {
                        setForm((f) => ({ ...f, price_cents: 0 }));
                        setPriceDisplay("");
                      } else {
                        let cents = Math.round(num * 100);
                        // PWYW: suggested price must be ≥ minimum
                        if (form.pricing_type === "pay_what_you_want" && cents < form.minimum_price_cents) {
                          cents = form.minimum_price_cents;
                        }
                        setForm((f) => ({ ...f, price_cents: cents }));
                        setPriceDisplay((cents / 100).toFixed(2));
                      }
                      setHasUnsavedChanges(true);
                    }}
                  />
                </div>
              </div>
              {form.pricing_type === "pay_what_you_want" && (
                <span className={styles.formHint}>
                  Suggested amount shown to buyers. Must be ≥ your minimum price.
                </span>
              )}
            </div>

            {/* PWYW pricing type */}
            <div className={styles.formField}>
              <div className={styles.pricingTypeRow}>
                <label className={styles.pricingTypeOption}>
                  <input type="radio" name="pricing_type" value="fixed"
                    checked={form.pricing_type === "fixed"}
                    onChange={() => setField("pricing_type", "fixed")} />
                  Fixed price
                </label>
                <label className={styles.pricingTypeOption}>
                  <input type="radio" name="pricing_type" value="pay_what_you_want"
                    checked={form.pricing_type === "pay_what_you_want"}
                    onChange={() => setField("pricing_type", "pay_what_you_want")} />
                  Pay what you want
                </label>
              </div>
              {form.pricing_type === "pay_what_you_want" && (
                <div className={styles.pwywMinRow}>
                  <span className={styles.pwywMinLabel}>Minimum:</span>
                  <span className={styles.priceCurrency}>{currency}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={styles.pwywMinInput}
                    placeholder="1.00"
                    value={minPriceDisplay}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^\d*\.?\d{0,2}$/.test(v) || v === "") setMinPriceDisplay(v);
                    }}
                    onBlur={() => {
                      let num = parseFloat(minPriceDisplay);
                      if (isNaN(num) || num < 1) num = 1;
                      setForm((f) => ({ ...f, minimum_price_cents: Math.round(num * 100) }));
                      setMinPriceDisplay(num.toFixed(2));
                      setHasUnsavedChanges(true);
                    }}
                  />
                  <span className={styles.pwywHint}>Buyers can pay more — the price above is the suggested amount.</span>
                </div>
              )}
            </div>

            {/* CTA Button Text */}
            <div className={styles.formField}>
              <div className={styles.formLabelRow}>
                <label className={styles.formLabel}>
                  Button Text <span className={styles.optional}>optional</span>
                </label>
                <span className={styles.charCount}>{form.cta_text.length}/50</span>
              </div>
              <input
                className={styles.formInput}
                placeholder={form.pricing_type === "pay_what_you_want" ? "Name Your Price" : "Buy Now"}
                value={form.cta_text}
                onChange={(e) => setField("cta_text", e.target.value)}
                maxLength={50}
              />
              <span className={styles.formHint}>
                Customize the purchase button. Defaults to "{form.pricing_type === "pay_what_you_want" ? "Name Your Price" : "Buy Now"}".
              </span>
            </div>

          </section>

          {/* ── Description ───────────────────────────────────── */}
          <section className={styles.formSection}>
            <h2 className={styles.formSectionTitle}>Description</h2>
            <div className={styles.formField}>
              <DescriptionToolbar
                textareaRef={descRef}
                onChange={(newText) => setField("description", newText)}
              />
              <textarea
                ref={descRef}
                className={`${styles.formTextarea} ${styles.descTextareaWithToolbar}`}
                rows={10}
                maxLength={5000}
                placeholder="Describe what buyers will get. Include the file format, key features, and who this is for."
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
              <div className={styles.descFooter}>
                <span className={styles.formHint}>
                  Tip: Use blank lines to separate paragraphs. Supports **bold**, *italic*, and - bullet lists.
                </span>
                <span className={styles.charCount}>{form.description.length}/5000</span>
              </div>
            </div>
          </section>

          {/* ── Delivery ──────────────────────────────────────── */}
          <section className={styles.formSection} ref={deliveryRef}>
            <h2 className={styles.formSectionTitle}>Delivery</h2>
            <div className={styles.deliveryBanner}>
              ⚡ This is the file your customers receive after purchase.
            </div>

            {/* Mode tabs */}
            <div className={styles.deliveryTabs}>
              <button type="button"
                className={`${styles.deliveryTab} ${deliveryMode === "url" ? styles.deliveryTabActive : ""}`}
                onClick={() => {
                  if (deliveryMode === "upload" && form.delivery_file_key) {
                    if (!confirm("Switch to URL mode? The uploaded file reference will be cleared.")) return;
                    setForm((f) => ({ ...f, delivery_file_key: null, delivery_file_name: null, delivery_file_size_bytes: null }));
                  }
                  setDeliveryMode("url");
                }}>
                🔗 External Link
              </button>
              <button type="button"
                className={`${styles.deliveryTab} ${deliveryMode === "upload" ? styles.deliveryTabActive : ""}`}
                onClick={() => {
                  if (deliveryMode === "url" && form.delivery_url.trim()) {
                    if (!confirm("Switch to Upload mode? The URL will be cleared.")) return;
                    setField("delivery_url", "");
                  }
                  setDeliveryMode("upload");
                }}>
                📁 Upload File
              </button>
            </div>

            {deliveryMode === "url" ? (
              /* External URL mode */
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  Download URL <span className={styles.req}>*</span>
                </label>
                <div className={styles.deliveryUrlRow}>
                  <input
                    className={`${styles.formInput} ${fieldErrors.delivery_url ? styles.formInputError : ""}`}
                    placeholder="https://drive.google.com/file/d/... or https://www.dropbox.com/..."
                    value={form.delivery_url}
                    onChange={(e) => {
                      setField("delivery_url", e.target.value);
                      if (fieldErrors.delivery_url) setFieldErrors((p) => ({ ...p, delivery_url: null }));
                    }}
                    onBlur={() => handleBlur("delivery_url")}
                  />
                  <button type="button" className={styles.testLinkBtn}
                    disabled={!isValidDeliveryUrl}
                    onClick={() => window.open(form.delivery_url, "_blank")}>
                    Test ↗
                  </button>
                </div>
                {fieldErrors.delivery_url && <span className={styles.formError}>{fieldErrors.delivery_url}</span>}
                {urlHint && <span className={styles.urlHint} style={{ color: urlHint.color }}>✓ {urlHint.label}</span>}
                <div className={styles.deliveryHelperLinks}>
                  <a href="https://support.google.com/drive/answer/2494822" target="_blank" rel="noopener noreferrer"
                    className={styles.helperLink}>How to share from Google Drive →</a>
                  <a href="https://help.dropbox.com/share/create-and-share-link" target="_blank" rel="noopener noreferrer"
                    className={styles.helperLink}>How to share from Dropbox →</a>
                </div>
              </div>
            ) : (
              /* File upload mode */
              <div className={styles.formField}>
                {form.delivery_file_key ? (
                  /* Uploaded file info */
                  <div className={styles.uploadedFile}>
                    <span className={styles.uploadedFileIcon}>📄</span>
                    <div className={styles.uploadedFileInfo}>
                      <span className={styles.uploadedFileName}>{form.delivery_file_name}</span>
                      {form.delivery_file_size_bytes && (
                        <span className={styles.uploadedFileSize}>
                          {(form.delivery_file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                    <span className={styles.uploadedFileBadge}>✅ Uploaded</span>
                    <button type="button" className={styles.removeUploadBtn}
                      onClick={() => setForm((f) => ({ ...f, delivery_file_key: null, delivery_file_name: null, delivery_file_size_bytes: null }))}>
                      ✕
                    </button>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    className={`${styles.dropzone} ${uploadingDeliverable ? styles.dropzoneUploading : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDeliverableDrop}
                    onClick={() => document.getElementById("deliverable-input")?.click()}
                  >
                    <input
                      id="deliverable-input"
                      type="file"
                      style={{ display: "none" }}
                      accept=".zip,.pdf,.epub,.docx,.xlsx,.pptx,.json,.csv,.txt,.png,.jpg,.mp3,.wav,.mp4"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDeliverableUpload(f);
                        e.target.value = "";
                      }}
                    />
                    {uploadingDeliverable ? (
                      <div className={styles.dropzoneContent}>
                        <span className={styles.dropzoneIcon}>⏳</span>
                        <span className={styles.dropzoneText}>Uploading…</span>
                      </div>
                    ) : (
                      <div className={styles.dropzoneContent}>
                        <span className={styles.dropzoneIcon}>📁</span>
                        <span className={styles.dropzoneText}>Drag & drop your file here</span>
                        <span className={styles.dropzoneSubtext}>or click to choose a file</span>
                        <span className={styles.dropzoneHint}>Max 25 MB · ZIP, PDF, EPUB, DOCX, XLSX, MP3, MP4…</span>
                      </div>
                    )}
                  </div>
                )}
                {deliverableError && <span className={styles.formError}>{deliverableError}</span>}
              </div>
            )}

            {isMissingDelivery && (
              <div className={styles.deliveryWarning}>
                ⚠️ A delivery file or URL is required to publish.
              </div>
            )}

            {/* File size */}
            <div className={styles.fileSizeRow}>
              <span className={styles.fileSizeLabel}>📎 File Size:</span>
              <input type="number" step="0.1" min="0"
                className={styles.fileSizeInput}
                placeholder="0.0"
                value={fileSizeValue}
                onChange={(e) => setFileSizeValue(e.target.value)}
              />
              <span className={styles.fileSizeUnit}>MB</span>
              <label className={styles.fileSizeToggle}>
                <input type="checkbox" checked={showFileSize}
                  onChange={(e) => setShowFileSize(e.target.checked)} />
                Show to buyers
              </label>
            </div>
          </section>

          {/* ── SEO & URL ─────────────────────────────────────── */}
          <section className={styles.formSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => setSeoExpanded((v) => !v)}
            >
              <span>SEO &amp; URL</span>
              <span className={styles.formSectionOptional}>optional</span>
              <span className={styles.sectionToggleChevron}>{seoExpanded ? "▲" : "▼"}</span>
            </button>

            {seoExpanded && (
              <div className={styles.seoFields}>

                {/* Custom slug */}
                <div className={styles.formField}>
                  <div className={styles.formLabelRow}>
                    <label className={styles.formLabel}>URL Slug</label>
                    <span className={styles.charCount}>{form.slug.length}/80</span>
                  </div>
                  <div className={styles.slugInputGroup}>
                    <span className={styles.slugPrefix}>yourstore.com/p/</span>
                    <input
                      className={styles.slugInput}
                      placeholder="my-awesome-product"
                      value={form.slug}
                      onChange={(e) => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                        setField("slug", val);
                        setSlugManuallyEdited(true);
                      }}
                      maxLength={80}
                    />
                  </div>
                  {fieldErrors.slug && <span className={styles.formError}>{fieldErrors.slug}</span>}
                  <span className={styles.formHint}>Lowercase letters, numbers, and hyphens only. Auto-generated from title.</span>
                </div>

                {/* SEO Title */}
                <div className={styles.formField}>
                  <div className={styles.formLabelRow}>
                    <label className={styles.formLabel}>SEO Title</label>
                    <span className={styles.charCount}>{form.seo_title.length}/100</span>
                  </div>
                  <input
                    className={styles.formInput}
                    placeholder={form.title || "Page title for search engines"}
                    value={form.seo_title}
                    onChange={(e) => setField("seo_title", e.target.value)}
                    maxLength={100}
                  />
                  <span className={styles.formHint}>Defaults to product title. Aim for 50–60 characters.</span>
                </div>

                {/* SEO Description */}
                <div className={styles.formField}>
                  <div className={styles.formLabelRow}>
                    <label className={styles.formLabel}>SEO Description</label>
                    <span className={styles.charCount}>{form.seo_description.length}/300</span>
                  </div>
                  <textarea
                    className={styles.formTextarea}
                    rows={3}
                    placeholder={form.short_description || form.description.slice(0, 160) || "Meta description for search engines"}
                    value={form.seo_description}
                    onChange={(e) => setField("seo_description", e.target.value)}
                    maxLength={300}
                  />
                  <span className={styles.formHint}>Defaults to tagline or description. Aim for 120–160 characters.</span>
                </div>

                {/* SEO Preview */}
                <div className={styles.seoPreviewCard}>
                  <div className={styles.seoPreviewTitle}>
                    {form.seo_title || form.title || "Product Title"}
                  </div>
                  <div className={styles.seoPreviewUrl}>
                    yourstore.com/p/{form.slug || "product-slug"}
                  </div>
                  <div className={styles.seoPreviewDesc}>
                    {form.seo_description || form.short_description || form.description.slice(0, 160) || "Your product description will appear here in search results."}
                  </div>
                </div>

              </div>
            )}
          </section>

          {/* ── Tags ──────────────────────────────────────────── */}
          <section className={styles.formSection}>
            <h2 className={styles.formSectionTitle}>
              Tags <span className={styles.formSectionOptional}>optional</span>
            </h2>
            <p className={styles.formHint} style={{ marginBottom: "0.75rem" }}>
              Help buyers find your product. Select up to 8 tags.
            </p>

            {/* Selected tags */}
            {tags.length > 0 && (
              <div className={styles.selectedTagsRow}>
                {tags.map((tag) => {
                  const c = tag.isCustom
                    ? { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" }
                    : (TAG_GROUP_COLORS[tag.group_name] || TAG_GROUP_COLORS.tool);
                  return (
                    <button key={tag.slug} type="button"
                      className={`${styles.selectedTagPill} ${tag.isCustom ? styles.customTagPill : ""}`}
                      style={{ background: c.bg, color: c.color, borderColor: c.border }}
                      onClick={() => removeTagInline(tag.slug)}>
                      {tag.label} ✕
                    </button>
                  );
                })}
                <span className={styles.tagCount}>{tags.length}/8</span>
              </div>
            )}

            {/* Single input: filters predefined tags while typing, adds tag on Enter */}
            <input
              type="text"
              className={styles.tagSearchInput}
              placeholder={tags.length >= 8 ? "Maximum 8 tags reached" : "Search or type a custom tag, press Enter to add…"}
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              onKeyDown={handleTagSearchKeyDown}
              disabled={tags.length >= 8}
              maxLength={30}
            />

            {/* Grouped pills */}
            {["format", "tool", "audience"].map((group) => {
              const groupLabel = group === "format" ? "📄 Format" : group === "tool" ? "🛠️ Tool" : "👤 Audience";
              const groupTags  = allTags
                .filter((t) => t.group_name === group)
                .filter((t) => !tagSearch || t.label.toLowerCase().includes(tagSearch.toLowerCase()));
              if (groupTags.length === 0) return null;
              return (
                <div key={group} className={styles.tagGroup}>
                  <h4 className={styles.tagGroupTitle}>{groupLabel}</h4>
                  <div className={styles.tagPills}>
                    {groupTags.map((tag) => {
                      const isSelected = tags.some((t) => t.slug === tag.slug);
                      const isDisabled = !isSelected && tags.length >= 8;
                      return (
                        <button key={tag.slug} type="button"
                          className={`${styles.tagPill} ${isSelected ? styles.tagPillSelected : ""} ${isDisabled ? styles.tagPillDisabled : ""}`}
                          onClick={() => isSelected ? removeTagInline(tag.slug) : addTagInline(tag)}
                          disabled={isDisabled}>
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

        </div>{/* /formColumn */}
      </div>{/* /editorLayout */}

      {/* ── Sticky bottom bar ─────────────────────────────────── */}
      <div className={styles.stickyBar}>
        <div className={styles.barLeft}>
          {isEdit && (
            <button type="button" className={styles.btnDelete} onClick={handleDelete} disabled={saving}>
              🗑️ Delete
            </button>
          )}
        </div>

        <div className={styles.stickyBarCenter}>
          <label className={styles.visibilityLabel}>Status:</label>
          <select
            className={styles.visibilitySelect}
            value={form.visibility}
            onChange={(e) => setField("visibility", e.target.value)}
            disabled={saving}
          >
            <option value="draft">Draft</option>
            <option value="published">Active</option>
            <option value="unlisted">Inactive</option>
          </select>
        </div>

        <div className={styles.barRight}>
          <button type="button" className={saveConfig.cls} onClick={handleSave} disabled={saving}>
            {saveConfig.label}
          </button>
        </div>
      </div>

    </div>
  );
}

// ── Inline image preview (used in Basic Info section) ─────────────────────────
function ImagePreviewInline({ url }) {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [url]);
  if (!url) return null;
  if (err) {
    return <span className={styles.imageError}>Could not load image. Check the URL.</span>;
  }
  return (
    <div className={styles.imagePreviewContainer}>
      <img src={url} alt="Cover preview" className={styles.imagePreview}
        onError={() => setErr(true)} />
    </div>
  );
}
