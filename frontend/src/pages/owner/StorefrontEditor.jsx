import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import Alert from "../../components/Alert";
import { listOwnerProducts, updateOwnerStore, getOwnerStore } from "../../api/owner";
import styles from "./StorefrontEditor.module.css";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_CONFIG = {
  hero: { enabled: false, heading: "", subheading: "", image_url: "", cta_text: "", cta_url: "" },
  featured_product_id: null,
  layout: "grid",
  show_description_on_cards: true,
  show_search: false,
  announcement: { enabled: false, text: "", bg_color: "#1e40af", text_color: "#ffffff" },
  footer_text: "",
};

function mergeConfig(stored) {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_CONFIG };
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    hero: { ...DEFAULT_CONFIG.hero, ...(stored.hero || {}) },
    announcement: { ...DEFAULT_CONFIG.announcement, ...(stored.announcement || {}) },
  };
}

const FONT_OPTIONS = [
  { value: "system",  label: "Clean",   preview: "system-ui, sans-serif",   sample: "The quick brown fox" },
  { value: "rounded", label: "Rounded", preview: "'Quicksand', sans-serif",  sample: "The quick brown fox" },
  { value: "serif",   label: "Elegant", preview: "'Playfair Display', serif", sample: "The quick brown fox" },
];

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={styles.toggleInput}
      />
      <span className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
    </label>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.editorSection}>
      <button
        type="button"
        className={styles.sectionToggleBtn}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.sectionTitle}>{title}</span>
        <span className={styles.sectionChevron}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

function MiniPreview({ config, store, fontOption }) {
  const accentColor  = store?.primary_color || "#0d6efd";
  const secondaryColor = store?.secondary_color || accentColor;
  const fontFamily   = fontOption?.preview || "system-ui, sans-serif";
  const storeName    = store?.name || "My Store";

  return (
    <div className={styles.preview} style={{ fontFamily }}>
      <div className={styles.previewLabel}>
        Preview
        {store?.slug && (
          <a
            href={`/store/${store.slug}`}
            target="_blank"
            rel="noreferrer"
            className={styles.previewFullLink}
          >
            Open full preview ↗
          </a>
        )}
      </div>

      <div className={styles.previewShell}>
        {/* Announcement bar */}
        {config.announcement.enabled && config.announcement.text && (
          <div
            className={styles.previewAnnouncement}
            style={{
              background: HEX_RE.test(config.announcement.bg_color) ? config.announcement.bg_color : "#1e40af",
              color:      HEX_RE.test(config.announcement.text_color) ? config.announcement.text_color : "#ffffff",
            }}
          >
            {config.announcement.text}
          </div>
        )}

        {/* Header */}
        <div className={styles.previewHeader} style={{ borderBottomColor: accentColor }}>
          <div className={styles.previewBrand} style={{ background: accentColor }}>
            {storeName.charAt(0).toUpperCase()}
          </div>
          <span className={styles.previewStoreName}>{storeName}</span>
        </div>

        {/* Hero */}
        {config.hero.enabled && (
          <div
            className={styles.previewHero}
            style={{
              background: config.hero.image_url
                ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${config.hero.image_url}) center/cover`
                : `linear-gradient(135deg, ${accentColor}, ${secondaryColor})`,
            }}
          >
            {config.hero.heading && (
              <p className={styles.previewHeroHeading}>{config.hero.heading}</p>
            )}
            {config.hero.subheading && (
              <p className={styles.previewHeroSub}>{config.hero.subheading}</p>
            )}
            {config.hero.cta_text && (
              <div className={styles.previewHeroCta} style={{ background: "#fff", color: accentColor }}>
                {config.hero.cta_text}
              </div>
            )}
          </div>
        )}

        {/* Search bar placeholder */}
        {config.show_search && (
          <div className={styles.previewSearchWrap}>
            <div className={styles.previewSearch}>🔍 Search…</div>
          </div>
        )}

        {/* Product cards */}
        <div className={`${styles.previewProducts} ${config.layout === "list" ? styles.previewProductsList : ""}`}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={styles.previewCard}>
              <div className={styles.previewCardThumb} style={{ background: accentColor + "30" }} />
              <div className={styles.previewCardInfo}>
                <div className={styles.previewCardTitle} />
                {config.show_description_on_cards && <div className={styles.previewCardDesc} />}
                <div className={styles.previewCardPrice} style={{ background: accentColor }} />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.previewFooter}>
          {config.footer_text || `${storeName} · Powered by Digital Store`}
        </div>
      </div>
    </div>
  );
}

export default function StorefrontEditor() {
  const { ownerCtx, ownerStore, setOwnerStore } = useOwner();

  const [config, setConfig] = useState(() => mergeConfig(ownerStore?.storefront_config));
  const [secondaryColor, setSecondaryColor] = useState(ownerStore?.secondary_color ?? "#6366f1");
  const [fontFamily, setFontFamily]         = useState(ownerStore?.font_family ?? "system");
  const [products, setProducts]             = useState([]);
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState(null);
  const [saved, setSaved]                   = useState(false);

  // Re-merge config whenever ownerStore changes (e.g. after save)
  useEffect(() => {
    setConfig(mergeConfig(ownerStore?.storefront_config));
    setSecondaryColor(ownerStore?.secondary_color ?? "#6366f1");
    setFontFamily(ownerStore?.font_family ?? "system");
  }, [ownerStore]);

  // Load products for featured product selector
  useEffect(() => {
    listOwnerProducts(ownerCtx)
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
  }, [ownerCtx.sessionToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function setHero(key, value) {
    setConfig((prev) => ({ ...prev, hero: { ...prev.hero, [key]: value } }));
  }

  function setAnnouncement(key, value) {
    setConfig((prev) => ({ ...prev, announcement: { ...prev.announcement, [key]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateOwnerStore(
        { storefront_config: config, secondary_color: secondaryColor, font_family: fontFamily },
        ownerCtx
      );
      const data = await getOwnerStore(ownerCtx);
      setOwnerStore(data.store);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedFontOption = FONT_OPTIONS.find((f) => f.value === fontFamily) || FONT_OPTIONS[0];
  const accentColor = ownerStore?.primary_color || "#0d6efd";
  const secondaryColorValue = HEX_RE.test(secondaryColor) ? secondaryColor : "#6366f1";

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Storefront Editor</h1>
          <p className={styles.subtitle}>Configure how your store looks to buyers.</p>
        </div>
      </div>

      <div className={styles.layout}>
        {/* ── Controls ── */}
        <div className={styles.controls}>

          {/* Announcement Bar */}
          <CollapsibleSection title="Announcement Bar" defaultOpen={false}>
            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <label className={styles.label}>Enabled</label>
                <Toggle
                  checked={config.announcement.enabled}
                  onChange={(v) => setAnnouncement("enabled", v)}
                />
              </div>
            </div>
            {config.announcement.enabled && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Text</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={config.announcement.text}
                    onChange={(e) => setAnnouncement("text", e.target.value)}
                    placeholder="🎉 20% off all products this week!"
                    maxLength={200}
                  />
                </div>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>Background Color</label>
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorSwatch}
                        value={HEX_RE.test(config.announcement.bg_color) ? config.announcement.bg_color : "#1e40af"}
                        onChange={(e) => setAnnouncement("bg_color", e.target.value)}
                      />
                      <input
                        type="text"
                        className={styles.input}
                        value={config.announcement.bg_color}
                        onChange={(e) => setAnnouncement("bg_color", e.target.value)}
                        placeholder="#1e40af"
                        maxLength={7}
                      />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Text Color</label>
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorSwatch}
                        value={HEX_RE.test(config.announcement.text_color) ? config.announcement.text_color : "#ffffff"}
                        onChange={(e) => setAnnouncement("text_color", e.target.value)}
                      />
                      <input
                        type="text"
                        className={styles.input}
                        value={config.announcement.text_color}
                        onChange={(e) => setAnnouncement("text_color", e.target.value)}
                        placeholder="#ffffff"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </CollapsibleSection>

          {/* Hero Banner */}
          <CollapsibleSection title="Hero Banner" defaultOpen={false}>
            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <label className={styles.label}>Enabled</label>
                <Toggle
                  checked={config.hero.enabled}
                  onChange={(v) => setHero("enabled", v)}
                />
              </div>
            </div>
            {config.hero.enabled && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Heading</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={config.hero.heading}
                    onChange={(e) => setHero("heading", e.target.value)}
                    placeholder="Welcome to my store"
                    maxLength={120}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Subheading</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={config.hero.subheading}
                    onChange={(e) => setHero("subheading", e.target.value)}
                    placeholder="Premium digital products"
                    maxLength={200}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Background Image URL</label>
                  <input
                    type="url"
                    className={styles.input}
                    value={config.hero.image_url}
                    onChange={(e) => setHero("image_url", e.target.value)}
                    placeholder="https://…"
                    spellCheck={false}
                  />
                  <span className={styles.hint}>Leave empty to use a gradient from your brand colors.</span>
                </div>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label}>CTA Button Text</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={config.hero.cta_text}
                      onChange={(e) => setHero("cta_text", e.target.value)}
                      placeholder="Shop Now"
                      maxLength={50}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>CTA Button URL</label>
                    <input
                      type="url"
                      className={styles.input}
                      value={config.hero.cta_url}
                      onChange={(e) => setHero("cta_url", e.target.value)}
                      placeholder="https://…"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </>
            )}
          </CollapsibleSection>

          {/* Featured Product */}
          <CollapsibleSection title="Featured Product" defaultOpen={false}>
            <div className={styles.field}>
              <label className={styles.label}>Pin a product at the top of your store</label>
              <select
                className={styles.input}
                value={config.featured_product_id ?? ""}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  featured_product_id: e.target.value || null,
                }))}
              >
                <option value="">None — show all products normally</option>
                {products.filter((p) => p.is_active).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </CollapsibleSection>

          {/* Product Display */}
          <CollapsibleSection title="Product Display">
            <div className={styles.field}>
              <label className={styles.label}>Layout</label>
              <div className={styles.layoutCards}>
                {[
                  { value: "grid", label: "Grid", icon: "▦", desc: "3-column grid" },
                  { value: "list", label: "List", icon: "≡", desc: "Single column" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.layoutCard} ${config.layout === opt.value ? styles.layoutCardActive : ""}`}
                    onClick={() => setConfig((prev) => ({ ...prev, layout: opt.value }))}
                    style={config.layout === opt.value ? { borderColor: accentColor } : undefined}
                  >
                    <span className={styles.layoutCardIcon}>{opt.icon}</span>
                    <span className={styles.layoutCardLabel}>{opt.label}</span>
                    <span className={styles.layoutCardDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <div>
                  <label className={styles.label}>Show descriptions on product cards</label>
                </div>
                <Toggle
                  checked={config.show_description_on_cards}
                  onChange={(v) => setConfig((prev) => ({ ...prev, show_description_on_cards: v }))}
                />
              </div>
            </div>
            <div className={styles.field}>
              <div className={styles.fieldRow}>
                <div>
                  <label className={styles.label}>Show search bar</label>
                  <p className={styles.hint}>Lets buyers filter products by name.</p>
                </div>
                <Toggle
                  checked={config.show_search}
                  onChange={(v) => setConfig((prev) => ({ ...prev, show_search: v }))}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Typography & Colors */}
          <CollapsibleSection title="Typography & Colors">
            <div className={styles.field}>
              <label className={styles.label}>Font Family</label>
              <div className={styles.fontCards}>
                {FONT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.fontCard} ${fontFamily === opt.value ? styles.fontCardActive : ""}`}
                    onClick={() => setFontFamily(opt.value)}
                    style={fontFamily === opt.value ? { borderColor: accentColor } : undefined}
                  >
                    <span className={styles.fontCardLabel}>{opt.label}</span>
                    <span
                      className={styles.fontCardSample}
                      style={{ fontFamily: opt.preview }}
                    >
                      {opt.sample}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Secondary Color</label>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  className={styles.colorSwatch}
                  value={secondaryColorValue}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.input}
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#6366f1"
                  maxLength={7}
                  spellCheck={false}
                />
              </div>
              <span className={styles.hint}>Used for gradients, hover states, and accent elements.</span>
            </div>
          </CollapsibleSection>

          {/* Footer */}
          <CollapsibleSection title="Footer" defaultOpen={false}>
            <div className={styles.field}>
              <label className={styles.label}>Custom Footer Text</label>
              <input
                type="text"
                className={styles.input}
                value={config.footer_text}
                onChange={(e) => setConfig((prev) => ({ ...prev, footer_text: e.target.value }))}
                placeholder="© 2025 My Brand. All rights reserved."
                maxLength={200}
              />
              <span className={styles.hint}>Leave empty to use the default "Powered by Digital Store" footer.</span>
            </div>
          </CollapsibleSection>

          {/* Save button */}
          <div className={styles.saveBar}>
            {saveError && (
              <div className={styles.alertWrap}>
                <Alert type="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert>
              </div>
            )}
            {saved && (
              <span className={styles.savedMsg}>✓ Saved</span>
            )}
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Spinner size={14} />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── Preview ── */}
        <div className={styles.previewCol}>
          <MiniPreview
            config={config}
            store={{ ...ownerStore, secondary_color: secondaryColorValue }}
            fontOption={selectedFontOption}
          />
        </div>
      </div>
    </div>
  );
}
