import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { trackPageView } from "../api/tracking";
import styles from "./BlogPost.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

// ── Simple Markdown → HTML renderer ─────────────────────────────────────────
// No external library. Handles: headings, bold, italic, code, links, lists,
// paragraph breaks, horizontal rules.
// Security: strips <script> tags and on* event handlers before rendering.

function sanitize(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}

function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    // Escape raw HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings (must come before other inline rules)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Horizontal rule
    .replace(/^---$/gm, "<hr />")
    // Bold + italic combo
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Links [text](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered list items (- item)
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Ordered list items (1. item)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*?<\/li>)(\n(<li>.*?<\/li>))*/gs, (m) => `<ul>${m}</ul>`)
    // Double newline → paragraph break
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Don't wrap block-level HTML in <p>
      if (/^<(h[1-6]|ul|ol|li|hr|blockquote)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return sanitize(html);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BlogPost() {
  const { slug, postSlug } = useParams();

  const [store, setStore]   = useState(null);
  const [post, setPost]     = useState(null);
  const [error, setError]   = useState(null);
  const [copied, setCopied] = useState(false);

  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || !slug) return;
    trackedRef.current = true;
    trackPageView(slug, { pageType: "storefront" });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [storeRes, postRes] = await Promise.all([
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`),
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog/${encodeURIComponent(postSlug)}`),
        ]);
        if (!storeRes.ok) throw new Error("Store not found");
        if (!postRes.ok) throw new Error("Post not found");

        const storeData = await storeRes.json();
        const postData  = await postRes.json();

        if (!cancelled) {
          setStore(storeData.store);
          setPost(postData.post);
          const seoTitle = postData.post?.seo_title || postData.post?.title;
          document.title = `${seoTitle} — ${storeData.store?.name || slug}`;
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug, postSlug]);

  function copyUrl() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const accentColor = store?.primary_color || "#0d6efd";

  if (error) {
    return (
      <div className={styles.shell}>
        <div className={styles.errorPage}>
          <p>{error}</p>
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backLink}>← Back to store</Link>
        </div>
      </div>
    );
  }

  if (!store || !post) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingPage}>Loading…</div>
      </div>
    );
  }

  const fp = post.featured_product;

  return (
    <div className={styles.shell}>
      {/* Store header */}
      <header className={styles.header} style={{ borderBottomColor: accentColor }}>
        <div className={styles.headerInner}>
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.storeMeta}>
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder} style={{ background: accentColor }}>
                {store.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={styles.storeName}>{store.name}</span>
          </Link>
          <div className={styles.headerNav}>
            <Link to={`/store/${encodeURIComponent(slug)}/blog`} className={styles.navLink}>
              ← Blog
            </Link>
            <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.navLink}>
              Store →
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <article className={styles.article}>
          {/* Cover image */}
          {post.cover_image_url && (
            <div className={styles.coverWrap}>
              <img
                src={post.cover_image_url}
                alt={post.title}
                className={styles.coverImg}
                onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
              />
            </div>
          )}

          {/* Header */}
          <header className={styles.articleHeader}>
            <h1 className={styles.articleTitle}>{post.title}</h1>
            <div className={styles.articleMeta}>
              {post.published_at && (
                <time className={styles.metaItem}>{fmtDate(post.published_at)}</time>
              )}
              {post.author_name && (
                <span className={styles.metaItem}>by {post.author_name || store.name}</span>
              )}
            </div>
          </header>

          {/* Body */}
          <div
            className={styles.articleBody}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
          />

          {/* Featured product card */}
          {fp && fp.visibility === "published" && (
            <div className={styles.featuredProductWrap}>
              <p className={styles.featuredLabel}>Featured in this post</p>
              <Link
                to={`/store/${encodeURIComponent(slug)}/product/${fp.id}`}
                className={styles.featuredCard}
                style={{ borderColor: accentColor + "40" }}
              >
                {fp.image_url ? (
                  <img src={fp.image_url} alt={fp.title} className={styles.fpImg} />
                ) : (
                  <div className={styles.fpImgPlaceholder} style={{ background: accentColor + "18" }}>
                    <span style={{ color: accentColor }}>📦</span>
                  </div>
                )}
                <div className={styles.fpInfo}>
                  <span className={styles.fpTitle}>{fp.title}</span>
                  <span className={styles.fpPrice} style={{ color: accentColor }}>
                    {formatPrice(fp.price_cents, fp.currency)}
                  </span>
                </div>
                <span className={styles.fpBuyBtn} style={{ background: accentColor }}>
                  Buy now →
                </span>
              </Link>
            </div>
          )}

          {/* Footer */}
          <footer className={styles.articleFooter}>
            <Link to={`/store/${encodeURIComponent(slug)}/blog`} className={styles.backToBlog}>
              ← Back to blog
            </Link>
            <div className={styles.shareRow}>
              <span className={styles.shareLabel}>Share:</span>
              <span className={styles.shareUrl}>{window.location.href}</span>
              <button
                type="button"
                className={styles.copyBtn}
                style={{ borderColor: accentColor, color: accentColor }}
                onClick={copyUrl}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </footer>
        </article>
      </main>
    </div>
  );
}
