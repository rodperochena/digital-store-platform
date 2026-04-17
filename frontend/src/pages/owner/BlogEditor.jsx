import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import {
  getBlogPost, createBlogPost, updateBlogPost,
  checkBlogSlugAvailable, listOwnerProductsWithStats,
} from "../../api/owner";
import styles from "./BlogEditor.module.css";

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

export default function BlogEditor() {
  const { ownerStore, ownerCtx } = useOwner();
  const navigate = useNavigate();
  const { id }   = useParams(); // undefined = create mode

  const isEdit = Boolean(id);

  const [loading, setLoading]   = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [products, setProducts] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form fields
  const [title, setTitle]                   = useState("");
  const [slug, setSlug]                     = useState("");
  const [slugTouched, setSlugTouched]       = useState(false);
  const [slugStatus, setSlugStatus]         = useState(null); // null | 'checking' | 'available' | 'taken'
  const [excerpt, setExcerpt]               = useState("");
  const [coverImageUrl, setCoverImageUrl]   = useState("");
  const [coverPreview, setCoverPreview]     = useState(false);
  const [body, setBody]                     = useState("");
  const [featuredProductId, setFeaturedProductId] = useState("");
  const [seoTitle, setSeoTitle]             = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [authorName, setAuthorName]         = useState("");
  const [status, setStatus]                 = useState("draft");

  const slugDebounceRef = useRef(null);

  // Load existing post in edit mode + product list
  useEffect(() => {
    async function load() {
      try {
        const [productsData] = await Promise.all([
          listOwnerProductsWithStats(ownerCtx).catch(() => ({ products: [] })),
        ]);
        setProducts(productsData.products ?? []);

        if (isEdit) {
          const data = await getBlogPost(ownerCtx, id);
          const p    = data.post;
          setTitle(p.title);
          setSlug(p.slug);
          setSlugTouched(true); // don't auto-overwrite slug in edit mode
          setExcerpt(p.excerpt || "");
          setCoverImageUrl(p.cover_image_url || "");
          setBody(p.body);
          setFeaturedProductId(p.featured_product_id || "");
          setSeoTitle(p.seo_title || "");
          setSeoDescription(p.seo_description || "");
          setAuthorName(p.author_name || "");
          setStatus(p.status);
        }
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate slug from title (create mode only, before user touches slug field)
  useEffect(() => {
    if (!isEdit && !slugTouched && title) {
      setSlug(generateSlug(title));
    }
  }, [title, isEdit, slugTouched]);

  // Debounced slug availability check
  const checkSlug = useCallback((value) => {
    if (!value) return;
    setSlugStatus("checking");
    clearTimeout(slugDebounceRef.current);
    slugDebounceRef.current = setTimeout(async () => {
      try {
        const data = await checkBlogSlugAvailable(ownerCtx, value, isEdit ? id : null);
        setSlugStatus(data.available ? "available" : "taken");
      } catch {
        setSlugStatus(null);
      }
    }, 450);
  }, [ownerCtx.sessionToken, ownerCtx.apiBase, id, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slug) checkSlug(slug);
    else setSlugStatus(null);
  }, [slug, checkSlug]);

  function handleSlugChange(val) {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    setSlugTouched(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (!title.trim())  return setSaveError("Title is required");
    if (!slug.trim())   return setSaveError("Slug is required");
    if (!body.trim())   return setSaveError("Body is required");
    if (slugStatus === "taken") return setSaveError("This slug is already in use");

    const payload = {
      title:               title.trim(),
      slug:                slug.trim(),
      body:                body.trim(),
      excerpt:             excerpt.trim() || undefined,
      cover_image_url:     coverImageUrl.trim() || undefined,
      status,
      seo_title:           seoTitle.trim() || undefined,
      seo_description:     seoDescription.trim() || undefined,
      featured_product_id: featuredProductId || undefined,
      author_name:         authorName.trim() || undefined,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateBlogPost(ownerCtx, id, payload);
      } else {
        await createBlogPost(ownerCtx, payload);
      }
      setSaveSuccess(true);
      setTimeout(() => navigate("/owner/blog"), 800);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const storeSlug    = ownerStore?.slug ?? "";
  const previewUrl   = storeSlug && slug ? `/store/${storeSlug}/blog/${slug}` : null;
  const canPreview   = isEdit && status === "published" && previewUrl;

  if (loading) {
    return (
      <div className={styles.loadingPage}><Spinner size={22} /> Loading…</div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.page}>
        <p className={styles.errorBanner}>{loadError}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>{isEdit ? "Edit Post" : "New Blog Post"}</h1>
        </div>
        <div className={styles.headerActions}>
          {canPreview && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={styles.btnOutline}>
              Preview ↗
            </a>
          )}
          <button type="button" className={styles.btnOutline} onClick={() => navigate("/owner/blog")}>
            Cancel
          </button>
        </div>
      </div>

      {saveError   && <p className={styles.errorBanner}>{saveError}</p>}
      {saveSuccess && <p className={styles.successBanner}>Saved! Redirecting…</p>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.layout}>
          {/* ── Left column (main content) ── */}
          <div className={styles.mainCol}>
            <div className={styles.field}>
              <label className={styles.label}>Title <span className={styles.req}>*</span></label>
              <input
                className={styles.inputLarge}
                placeholder="Enter post title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Slug <span className={styles.req}>*</span></label>
              <div className={styles.slugRow}>
                <input
                  className={`${styles.input} ${
                    slugStatus === "taken"     ? styles.inputError :
                    slugStatus === "available" ? styles.inputOk    : ""
                  }`}
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="post-url-slug"
                />
                {slugStatus === "checking"  && <span className={styles.slugChecking}>checking…</span>}
                {slugStatus === "available" && <span className={styles.slugOk}>✓ available</span>}
                {slugStatus === "taken"     && <span className={styles.slugTaken}>✗ taken</span>}
              </div>
              {storeSlug && slug && (
                <span className={styles.slugPreview}>
                  /store/{storeSlug}/blog/{slug}
                </span>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Excerpt</label>
              <textarea
                className={styles.textarea}
                rows={3}
                maxLength={300}
                placeholder="Short summary shown in blog listing and SEO"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
              <span className={styles.charCount}>{excerpt.length}/300</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Body <span className={styles.req}>*</span>
                <span className={styles.labelHint}> — Supports Markdown formatting</span>
              </label>
              <textarea
                className={`${styles.textarea} ${styles.bodyTextarea}`}
                rows={20}
                placeholder="Write your post content here. Supports Markdown: **bold**, *italic*, # Heading, ## Subheading, [link](url), - list item, `code`"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
          </div>

          {/* ── Right column (meta) ── */}
          <div className={styles.sideCol}>
            <div className={styles.sideSection}>
              <h3 className={styles.sideHeading}>Publishing</h3>

              <div className={styles.field}>
                <label className={styles.label}>Status</label>
                <div className={styles.statusToggle}>
                  {["draft", "published"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`${styles.statusBtn} ${status === s ? styles.statusBtnActive : ""}`}
                      onClick={() => setStatus(s)}
                    >
                      {s === "draft" ? "⚫ Draft" : "🟢 Published"}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Author name</label>
                <input
                  className={styles.input}
                  placeholder="Defaults to store name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.sideSection}>
              <h3 className={styles.sideHeading}>Cover Image</h3>
              <div className={styles.field}>
                <input
                  className={styles.input}
                  placeholder="https://…"
                  value={coverImageUrl}
                  onChange={(e) => { setCoverImageUrl(e.target.value); setCoverPreview(false); }}
                />
                {coverImageUrl && (
                  <button
                    type="button"
                    className={styles.previewToggle}
                    onClick={() => setCoverPreview((v) => !v)}
                  >
                    {coverPreview ? "Hide preview" : "Preview"}
                  </button>
                )}
                {coverPreview && coverImageUrl && (
                  <img
                    src={coverImageUrl}
                    alt="Cover preview"
                    className={styles.coverPreview}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
              </div>
            </div>

            <div className={styles.sideSection}>
              <h3 className={styles.sideHeading}>Featured Product</h3>
              <div className={styles.field}>
                <select
                  className={styles.select}
                  value={featuredProductId}
                  onChange={(e) => setFeaturedProductId(e.target.value)}
                >
                  <option value="">None</option>
                  {products.filter((p) => p.visibility === "published").map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                <span className={styles.fieldHint}>Shown as a product card within the post</span>
              </div>
            </div>

            <div className={styles.sideSection}>
              <h3 className={styles.sideHeading}>SEO</h3>
              <div className={styles.field}>
                <label className={styles.label}>SEO Title <span className={styles.labelCount}>{seoTitle.length}/70</span></label>
                <input
                  className={styles.input}
                  placeholder="Custom title for search engines"
                  maxLength={70}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>SEO Description <span className={styles.labelCount}>{seoDescription.length}/160</span></label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Custom description for search engines"
                  maxLength={160}
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={saving || slugStatus === "taken"}
              >
                {saving ? <><Spinner size={14} /> Saving…</> : isEdit ? "Save changes" : "Create post"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
