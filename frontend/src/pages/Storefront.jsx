"use strict";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { trackPageView } from "../api/tracking";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import { useBuyer } from "../context/BuyerContext";
import { useCart } from "../context/CartContext";
import CartDrawer from "../components/CartDrawer";
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

// ── Merge storefront config with defaults ─────────────────────────────────────

const CONFIG_DEFAULTS = {
  hero: { enabled: false, heading: "", subheading: "", image_url: "", cta_text: "", cta_url: "" },
  featured_product_id: null,
  layout: "grid",
  show_description_on_cards: true,
  show_search: false,
  announcement: { enabled: false, text: "", bg_color: "#1e40af", text_color: "#ffffff" },
  footer_text: "",
};

function resolveConfig(raw) {
  if (!raw || typeof raw !== "object") return CONFIG_DEFAULTS;
  const merged = {
    ...CONFIG_DEFAULTS,
    ...raw,
    hero: { ...CONFIG_DEFAULTS.hero, ...(raw.hero || {}) },
    announcement: { ...CONFIG_DEFAULTS.announcement, ...(raw.announcement || {}) },
  };
  // Ensure fields rendered as JSX text children are always strings.
  // JSONB can store any type — an object in a text slot throws React Error #310.
  return {
    ...merged,
    footer_text: typeof merged.footer_text === "string" ? merged.footer_text : "",
    hero: {
      ...merged.hero,
      heading:    typeof merged.hero.heading    === "string" ? merged.hero.heading    : "",
      subheading: typeof merged.hero.subheading === "string" ? merged.hero.subheading : "",
      cta_text:   typeof merged.hero.cta_text   === "string" ? merged.hero.cta_text   : "",
      cta_url:    typeof merged.hero.cta_url    === "string" ? merged.hero.cta_url    : "",
      image_url:  typeof merged.hero.image_url  === "string" ? merged.hero.image_url  : "",
    },
    announcement: {
      ...merged.announcement,
      text: typeof merged.announcement.text === "string" ? merged.announcement.text : "",
    },
  };
}

// ── Taxonomy helpers ──────────────────────────────────────────────────────────

const TYPE_ICON_MAP = {
  "template":"📄","ebook":"📚","design-asset":"🎨","photo-video":"📸",
  "audio-music":"🎵","preset-filter":"🎛️","font":"🔤","software-code":"💻",
  "ai-prompt":"🤖","printable":"🖨️","spreadsheet":"📊","other":"📦",
};

const TAG_GROUP_COLORS = {
  tool:     { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  format:   { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  audience: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
};

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, accentColor, showDescription, onSelect, onBuy, slug, paused }) {
  const initial = product.title.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = product.image_url && !imgError;
  const navigate = useNavigate();

  function goToProduct() {
    navigate(`/store/${encodeURIComponent(slug)}/product/${product.id}`);
  }

  return (
    <div
      className={styles.productCard}
      style={{ "--primary-color": accentColor }}
      onClick={goToProduct}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && goToProduct()}
    >
      {product.product_type && TYPE_ICON_MAP[product.product_type] && (
        <div className={styles.cardTypePill}>
          {TYPE_ICON_MAP[product.product_type]} {product.product_type.replace(/-/g, " ")}
        </div>
      )}
      {showImage ? (
        <img
          src={product.image_url}
          alt={product.title}
          className={styles.productCardImage}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={styles.productCardImagePlaceholder}
          style={{ background: accentColor + "18", color: accentColor }}
        >
          {initial}
        </div>
      )}
      <div className={styles.productCardBody}>
        <h2 className={styles.productCardTitle}>{product.title}</h2>
        {showDescription && product.description && (
          <p className={styles.productCardDescription}>{product.description}</p>
        )}
        {product.sales_count > 0 && (
          <span className={styles.salesBadge}>🔥 {product.sales_count} sold</span>
        )}
      </div>
      <div className={styles.productCardFooter}>
        <span className={styles.productCardPrice}>
          {formatPrice(product.price_cents, product.currency)}
        </span>
        <button
          type="button"
          className={styles.productCardBuyBtn}
          disabled={paused}
          onClick={(e) => { e.stopPropagation(); onBuy(product); }}
        >
          {paused ? "Unavailable" : "Buy now"}
        </button>
      </div>
    </div>
  );
}

// ── List Card (for list layout) ───────────────────────────────────────────────

function ProductListCard({ product, accentColor, showDescription, onSelect, onBuy, slug, paused }) {
  const initial = product.title.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = product.image_url && !imgError;
  const navigate = useNavigate();

  function goToProduct() {
    navigate(`/store/${encodeURIComponent(slug)}/product/${product.id}`);
  }

  return (
    <div
      className={styles.productListCard}
      style={{ "--card-accent": accentColor }}
      onClick={goToProduct}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && goToProduct()}
    >
      <div className={styles.listCardThumb} style={showImage ? undefined : { background: accentColor + "18" }}>
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
      <div className={styles.listCardBody}>
        <h2 className={styles.productTitle}>{product.title}</h2>
        {showDescription && product.description && (
          <p className={styles.productDesc}>{product.description}</p>
        )}
        {product.sales_count > 0 && (
          <span className={styles.salesBadge}>🔥 {product.sales_count} sold</span>
        )}
      </div>
      <div className={styles.listCardFooter}>
        <span className={styles.productPrice} style={{ color: accentColor }}>
          {formatPrice(product.price_cents, product.currency)}
        </span>
        <div className={styles.cardActions}>
          <Link
            to={`/store/${encodeURIComponent(slug)}/product/${product.id}`}
            className={styles.detailsLink}
            style={{ color: accentColor }}
            onClick={(e) => e.stopPropagation()}
          >
            Details →
          </Link>
          <button
            type="button"
            className={styles.buyBtn}
            style={{ background: paused ? "#9ca3af" : accentColor }}
            disabled={paused}
            onClick={(e) => { e.stopPropagation(); onBuy(product); }}
          >
            {paused ? "Unavailable" : "Buy now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Featured Product Card ─────────────────────────────────────────────────────

function FeaturedCard({ product, accentColor, showDescription, onSelect, onBuy, slug, paused }) {
  const initial = product.title.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = product.image_url && !imgError;
  const navigate = useNavigate();

  function goToProduct() {
    navigate(`/store/${encodeURIComponent(slug)}/product/${product.id}`);
  }

  return (
    <div
      className={styles.featuredCard}
      style={{ "--primary-color": accentColor }}
      onClick={goToProduct}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && goToProduct()}
    >
      {showImage ? (
        <img
          src={product.image_url}
          alt={product.title}
          className={styles.featuredImage}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={styles.featuredImagePlaceholder}>
          {initial}
        </div>
      )}
      <div className={styles.featuredContent}>
        <span className={styles.featuredBadge}>Featured</span>
        <h2 className={styles.featuredTitle}>{product.title}</h2>
        {showDescription && product.description && (
          <p className={styles.featuredDescription}>{product.description}</p>
        )}
        <div className={styles.featuredFooter}>
          <span className={styles.featuredPrice}>
            {formatPrice(product.price_cents, product.currency)}
          </span>
          <button
            type="button"
            className={styles.featuredBuyBtn}
            disabled={paused}
            onClick={(e) => { e.stopPropagation(); onBuy(product); }}
          >
            {paused ? "Unavailable" : "Buy now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

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

// ── Account header ────────────────────────────────────────────────────────────

function AccountHeader({ slug, accentColor, itemCount, onCartOpen }) {
  const { isLoggedIn, buyer, logout } = useBuyer() || {};

  async function handleLogout() {
    if (logout) await logout();
  }

  return (
    <div className={styles.accountHeader}>
      {/* Cart icon */}
      <button
        type="button"
        className={styles.cartBtn}
        onClick={onCartOpen}
        aria-label="Open cart"
      >
        🛒
        {itemCount > 0 && (
          <span className={styles.cartBadge}>
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        )}
      </button>

      {isLoggedIn ? (
        <div className={styles.accountHeaderInner}>
          <span className={styles.accountGreeting}>
            Hi, {buyer?.display_name || buyer?.email?.split("@")[0]}
          </span>
          <Link to={`/store/${slug}/account`} className={styles.accountLink}>
            My Purchases
          </Link>
          <button onClick={handleLogout} className={styles.accountLogoutBtn} type="button">
            Log out
          </button>
        </div>
      ) : (
        <div className={styles.accountHeaderInner}>
          <Link to={`/store/${slug}/login`} className={styles.accountLink}>
            Log in
          </Link>
          <Link
            to={`/store/${slug}/register`}
            className={styles.accountRegisterBtn}
            style={{ background: accentColor }}
          >
            Create Account
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main Storefront ───────────────────────────────────────────────────────────

export default function Storefront() {
  const { slug } = useParams();
  const { isLoggedIn, buyer } = useBuyer() || {};
  const { itemCount } = useCart() || {};

  const [cartOpen, setCartOpen] = useState(false);
  const [store, setStore]           = useState(null);
  const [products, setProducts]     = useState(null);
  const [activeSale, setActiveSale] = useState(null);
  const [recentPosts, setRecentPosts] = useState([]);
  const [storeError, setStoreError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribeEmail, setSubscribeEmail]   = useState("");
  const [subscribing, setSubscribing]         = useState(false);
  const [subscribeMsg, setSubscribeMsg]       = useState(null);

  // Detail modal
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Checkout state
  const [buyingProduct, setBuyingProduct]     = useState(null);
  const [buyerEmail, setBuyerEmail]           = useState("");
  const [marketingOptIn, setMarketingOptIn]   = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError]     = useState(null);

  // Discount code state
  const [discountCode, setDiscountCode]         = useState("");
  const [discountResult, setDiscountResult]     = useState(null);
  const [discountError, setDiscountError]       = useState(null);
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  // Fire-and-forget tracking — once per mount, guard against StrictMode double-fire
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !slug) return;
    trackedRef.current = true;
    trackPageView(slug, { pageType: "storefront" });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // Load active sale + recent blog posts (non-blocking)
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/active-sale`)
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setActiveSale(d.sale ?? null); })
            .catch(() => {});
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog/recent?limit=3`)
            .then((r) => r.json())
            .then((d) => { if (!cancelled) setRecentPosts(d.posts ?? []); })
            .catch(() => {});
        }
      } catch (err) {
        if (!cancelled) setStoreError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // SEO meta tags
  useEffect(() => {
    if (!store) return;
    document.title = `${store.name} — Digital Store`;

    function setMeta(name, content, property = false) {
      const attr = property ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content || "");
    }

    if (store.description) setMeta("description", store.description);
    setMeta("og:title", store.name, true);
    if (store.description) setMeta("og:description", store.description, true);
    if (store.logo_url)    setMeta("og:image", store.logo_url, true);

    return () => {
      document.title = "Digital Store";
    };
  }, [store]);

  // Google Fonts injection for non-system fonts
  useEffect(() => {
    if (!store?.font_family || store.font_family === "system") return;

    const fontMap = {
      rounded: "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap",
      serif:   "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap",
    };

    const href = fontMap[store.font_family];
    if (!href) return;

    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = href;
    document.head.appendChild(link);

    return () => {
      // Leave the font loaded — removing causes flash
    };
  }, [store?.font_family]);

  const config = useMemo(() => resolveConfig(store?.storefront_config), [store]);

  // Must be declared unconditionally (before any early returns) to satisfy Rules of Hooks.
  // Null-safe: returns [] when products haven't loaded yet.
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let list = products;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(q));
    }
    const featId = config.featured_product_id;
    if (featId) {
      list = list.filter((p) => p.id !== featId);
    }
    return list;
  }, [products, searchQuery, config.featured_product_id]);

  function openCheckout(product) {
    if (store?.is_paused) return;
    setSelectedProduct(null);
    setBuyingProduct(product);
    setBuyerEmail(isLoggedIn && buyer?.email ? buyer.email : "");
    setMarketingOptIn(false);
    setCheckoutError(null);
    setDiscountCode("");
    setDiscountResult(null);
    setDiscountError(null);
  }

  async function applyDiscount() {
    if (!discountCode.trim() || !buyingProduct) return;
    setDiscountError(null);
    setValidatingDiscount(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/validate-discount`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: discountCode.trim(),
            subtotal_cents: buyingProduct.price_cents,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        setDiscountError(data.reason || "Invalid discount code");
        setDiscountResult(null);
      } else {
        setDiscountResult(data);
      }
    } catch {
      setDiscountError("Could not validate discount code");
    } finally {
      setValidatingDiscount(false);
    }
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
      const body = {
        items: [{ product_id: buyingProduct.id, quantity: 1 }],
        buyer_email: email,
        marketing_opt_in: marketingOptIn,
      };
      if (discountResult?.discount_code_id) {
        body.discount_code = discountResult.code;
      }
      const data = await fetchWithPost(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/checkout/session`,
        body
      );
      window.location.href = data.checkout_url;
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

  async function handleSubscribe(e) {
    e.preventDefault();
    if (!subscribeEmail.trim()) return;
    setSubscribing(true);
    setSubscribeMsg(null);
    try {
      const data = await fetchWithPost(
        `${API_BASE}/api/store/${encodeURIComponent(slug)}/subscribe`,
        { email: subscribeEmail.trim() }
      );
      setSubscribeMsg(data.already_subscribed ? "You're already subscribed!" : "You're subscribed!");
      setSubscribeEmail("");
    } catch (err) {
      setSubscribeMsg("Error: " + err.message);
    } finally {
      setSubscribing(false);
    }
  }

  const accentColor    = store.primary_color   || "#0d6efd";
  const secondaryColor = store.secondary_color || accentColor;

  // Font family
  const fontMap = {
    rounded: "'Quicksand', 'Nunito', sans-serif",
    serif:   "'Playfair Display', 'Georgia', serif",
    system:  "system-ui, -apple-system, sans-serif",
  };
  const fontFamily = fontMap[store.font_family] || fontMap.system;

  // Resolve social links
  function toSocialUrl(value, platform) {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    if (v.startsWith("@")) {
      const handle = v.slice(1);
      if (platform === "twitter")   return `https://twitter.com/${handle}`;
      if (platform === "instagram") return `https://instagram.com/${handle}`;
    }
    return v;
  }

  const twitterUrl   = toSocialUrl(store.social_twitter,   "twitter");
  const instagramUrl = toSocialUrl(store.social_instagram, "instagram");
  const youtubeUrl   = store.social_youtube?.trim() || null;
  const websiteUrl   = store.social_website?.trim() || null;

  const hasStoreInfo =
    store.tagline || store.description || twitterUrl || instagramUrl || youtubeUrl || websiteUrl;

  // Featured product
  const featuredProduct = config.featured_product_id
    ? products.find((p) => p.id === config.featured_product_id) ?? null
    : null;

  const showDescriptions = config.show_description_on_cards !== false;

  return (
    <div className={styles.shell} style={{ fontFamily }}>
      {/* Announcement bar */}
      {config.announcement.enabled && config.announcement.text && (
        <div
          className={styles.announcement}
          style={{
            background: config.announcement.bg_color || "#1e40af",
            color:      config.announcement.text_color || "#ffffff",
          }}
        >
          {config.announcement.text}
        </div>
      )}

      {/* Active sale banner */}
      {activeSale && (
        <div className={styles.saleBanner} style={{ background: accentColor }}>
          🏷️ <strong>{activeSale.name}</strong>
          {" — "}
          {activeSale.discount_type === "percentage"
            ? `${activeSale.discount_value}% off`
            : `$${parseFloat(activeSale.discount_value).toFixed(2)} off`}
          {activeSale.apply_to === "selected" ? " selected products" : " all products"}
          {activeSale.ends_at && (
            <span className={styles.saleEnds}>
              {" · Ends "}{new Date(activeSale.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* Pause banner */}
      {store.is_paused && (
        <div className={styles.pauseBanner}>
          <span className={styles.pauseIcon}>⏸</span>
          <span>
            {store.pause_message || "This store is temporarily paused and not accepting new orders."}
          </span>
        </div>
      )}

      {/* Header */}
      <header className={styles.header} style={{ borderBottomColor: accentColor }}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder} style={{ background: accentColor }}>
                {store.name.charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className={styles.storeName}>{store.name}</h1>
          </div>
          <AccountHeader
            slug={slug}
            accentColor={accentColor}
            itemCount={itemCount || 0}
            onCartOpen={() => setCartOpen(true)}
          />
        </div>
      </header>

      {/* Hero banner */}
      {config.hero.enabled && (
        <div
          className={styles.heroBanner}
          style={{
            background: config.hero.image_url
              ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${config.hero.image_url}) center/cover no-repeat`
              : `linear-gradient(135deg, ${accentColor}, ${secondaryColor})`,
          }}
        >
          {config.hero.heading && (
            <h2 className={styles.heroHeading}>{config.hero.heading}</h2>
          )}
          {config.hero.subheading && (
            <p className={styles.heroSubheading}>{config.hero.subheading}</p>
          )}
          {config.hero.cta_text && config.hero.cta_url && (
            <a
              href={config.hero.cta_url}
              className={styles.heroCta}
              style={{ color: accentColor }}
            >
              {config.hero.cta_text}
            </a>
          )}
          {config.hero.cta_text && !config.hero.cta_url && (
            <div className={styles.heroCta} style={{ color: accentColor }}>
              {config.hero.cta_text}
            </div>
          )}
        </div>
      )}

      <main className={styles.main}>
        {/* Featured product */}
        {featuredProduct && (
          <div className={styles.featuredSection}>
            <FeaturedCard
              product={featuredProduct}
              accentColor={accentColor}
              showDescription={showDescriptions}
              onSelect={setSelectedProduct}
              onBuy={openCheckout}
              slug={slug}
              paused={!!store.is_paused}
            />
          </div>
        )}

        {/* Search bar */}
        {config.show_search && (
          <div className={styles.searchWrap}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search products…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {filteredProducts.length === 0 && !featuredProduct ? (
          <div className={styles.emptyProducts}>
            <p>{searchQuery ? "No products match your search." : "No products available yet."}</p>
          </div>
        ) : filteredProducts.length === 0 && searchQuery ? (
          <div className={styles.emptyProducts}>
            <p>No products match "{searchQuery}".</p>
          </div>
        ) : config.layout === "list" ? (
          <div className={styles.productListLayout}>
            {filteredProducts.map((p) => (
              <ProductListCard
                key={p.id}
                product={p}
                accentColor={accentColor}
                showDescription={showDescriptions}
                onSelect={setSelectedProduct}
                onBuy={openCheckout}
                slug={slug}
                paused={!!store.is_paused}
              />
            ))}
          </div>
        ) : (
          <div className={styles.productGrid}>
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                accentColor={accentColor}
                showDescription={showDescriptions}
                onSelect={setSelectedProduct}
                onBuy={openCheckout}
                slug={slug}
                paused={!!store.is_paused}
              />
            ))}
          </div>
        )}
      </main>

      {/* From the Blog */}
      {recentPosts.length > 0 && (
        <div className={styles.blogSection}>
          <div className={styles.blogInner}>
            <div className={styles.blogHeadRow}>
              <h2 className={styles.blogHeading}>From the Blog</h2>
              <Link
                to={`/store/${encodeURIComponent(slug)}/blog`}
                className={styles.blogViewAll}
                style={{ color: accentColor }}
              >
                View all posts →
              </Link>
            </div>
            <div className={styles.blogGrid}>
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/store/${encodeURIComponent(slug)}/blog/${post.slug}`}
                  className={styles.blogCard}
                >
                  {post.cover_image_url ? (
                    <div className={styles.blogCardCover}>
                      <img
                        src={post.cover_image_url}
                        alt=""
                        className={styles.blogCardImg}
                        onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <div className={styles.blogCardCoverEmpty} style={{ background: accentColor + "10" }}>
                      <span style={{ color: accentColor }}>📝</span>
                    </div>
                  )}
                  <div className={styles.blogCardBody}>
                    <h3 className={styles.blogCardTitle}>{post.title}</h3>
                    {post.excerpt && (
                      <p className={styles.blogCardExcerpt}>{post.excerpt}</p>
                    )}
                    <span className={styles.blogCardRead} style={{ color: accentColor }}>
                      Read more →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subscribe section */}
      <div className={styles.subscribeSection}>
        <div className={styles.subscribeInner}>
          <div className={styles.subscribeText}>
            <strong className={styles.subscribeTitle}>Stay in the loop</strong>
            <p className={styles.subscribeDesc}>Subscribe for new products and special offers.</p>
          </div>
          {subscribeMsg ? (
            <p className={styles.subscribeMsg}>{subscribeMsg}</p>
          ) : (
            <form className={styles.subscribeForm} onSubmit={handleSubscribe}>
              <input
                className={styles.subscribeInput}
                type="email"
                placeholder="your@email.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className={styles.subscribeBtn}
                style={{ background: accentColor }}
                disabled={subscribing}
              >
                {subscribing ? "…" : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerName}>{store.name}</span>
        {config.footer_text ? (
          <>
            <span className={styles.footerSep} aria-hidden="true">·</span>
            <span className={styles.footerPowered}>{config.footer_text}</span>
          </>
        ) : (
          <>
            <span className={styles.footerSep} aria-hidden="true">·</span>
            <span className={styles.footerPowered}>Powered by Digital Store</span>
          </>
        )}
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

      {/* Checkout modal */}
      {buyingProduct && (
        <div className={styles.modalOverlay} onClick={() => setBuyingProduct(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{buyingProduct.title}</h2>
                <span className={styles.modalPrice} style={{ color: accentColor }}>
                  {discountResult
                    ? formatPrice(buyingProduct.price_cents - discountResult.discount_amount_cents, buyingProduct.currency)
                    : formatPrice(buyingProduct.price_cents, buyingProduct.currency)}
                  {discountResult && (
                    <span className={styles.modalPriceOriginal}>
                      {" "}{formatPrice(buyingProduct.price_cents, buyingProduct.currency)}
                    </span>
                  )}
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
                  disabled={checkoutLoading || (isLoggedIn && !!buyer?.email)}
                  autoComplete="email"
                />
                <span className={styles.hint}>Your download link will be emailed after payment.</span>
              </div>

              {/* Discount code */}
              <div className={styles.discountSection}>
                <p className={styles.discountLabel}>Have a discount code?</p>
                <div className={styles.discountRow}>
                  <input
                    className={styles.input}
                    placeholder="Enter code"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value.toUpperCase());
                      setDiscountResult(null);
                      setDiscountError(null);
                    }}
                    disabled={checkoutLoading}
                  />
                  <button
                    type="button"
                    className={styles.discountApplyBtn}
                    style={{ borderColor: accentColor, color: accentColor }}
                    onClick={applyDiscount}
                    disabled={!discountCode.trim() || validatingDiscount || checkoutLoading}
                  >
                    {validatingDiscount ? "…" : "Apply"}
                  </button>
                </div>
                {discountError && <p className={styles.discountError}>{discountError}</p>}
                {discountResult && (
                  <p className={styles.discountSuccess}>
                    ✓ {discountResult.discount_type === "percentage"
                      ? `${discountResult.discount_value}% off`
                      : `${formatPrice(discountResult.discount_amount_cents, buyingProduct.currency)} off`
                    } applied
                  </p>
                )}
              </div>

              <label className={styles.marketingCheckbox}>
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  disabled={checkoutLoading}
                />
                <span>Keep me updated on new products and offers</span>
              </label>

              <button
                type="submit"
                className={styles.checkoutBtn}
                style={{ background: accentColor }}
                disabled={checkoutLoading}
              >
                {checkoutLoading && <Spinner size={15} />}
                {checkoutLoading
                  ? "Redirecting to payment…"
                  : `Pay ${discountResult
                      ? formatPrice(buyingProduct.price_cents - discountResult.discount_amount_cents, buyingProduct.currency)
                      : formatPrice(buyingProduct.price_cents, buyingProduct.currency)
                    }`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        slug={slug}
        accentColor={accentColor}
      />
    </div>
  );
}
