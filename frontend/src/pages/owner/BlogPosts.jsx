import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import { listBlogPosts, deleteBlogPost } from "../../api/owner";
import styles from "./BlogPosts.module.css";

const TABS = ["all", "published", "draft"];

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogPosts() {
  const { ownerStore, ownerCtx } = useOwner();
  const navigate = useNavigate();

  const [posts, setPosts]         = useState(null);
  const [total, setTotal]         = useState(0);
  const [tab, setTab]             = useState("all");
  const [error, setError]         = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchPosts = useCallback(async () => {
    setError(null);
    try {
      const status = tab === "all" ? undefined : tab;
      const data   = await listBlogPosts(ownerCtx, { status, limit: 100 });
      setPosts(data.posts ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err.message);
      setPosts([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function handleDelete(post) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setDeletingId(post.id);
    try {
      await deleteBlogPost(ownerCtx, post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // Tab counts based on loaded posts (all status loaded when tab=all)
  const allPosts = posts ?? [];
  const counts = {
    all:       allPosts.length,
    published: allPosts.filter((p) => p.status === "published").length,
    draft:     allPosts.filter((p) => p.status === "draft").length,
  };

  const slug = ownerStore?.slug ?? "";

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Blog Posts</h1>
          <p className={styles.subtitle}>
            {posts === null ? "Loading…" : `${total} post${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => navigate("/owner/blog/new")}>
          + New Post
        </button>
      </div>

      {/* Tabs */}
      <div className={styles.tabRow}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            {posts !== null && (
              <span className={styles.tabCount}>({counts[t]})</span>
            )}
          </button>
        ))}
      </div>

      {error && <p className={styles.errorMsg}>Failed to load: {error}</p>}

      {posts === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : allPosts.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>✍️</span>
          <h2 className={styles.emptyTitle}>No blog posts yet</h2>
          <p className={styles.emptyDesc}>
            Write your first blog post to engage your audience and promote your products.
          </p>
          <button type="button" className={styles.btnPrimary} onClick={() => navigate("/owner/blog/new")}>
            Write your first post
          </button>
        </div>
      ) : (
        <div className={styles.postList}>
          {allPosts.map((post) => (
            <div key={post.id} className={styles.postRow}>
              {/* Thumbnail */}
              <div className={styles.thumb}>
                {post.cover_image_url ? (
                  <img
                    src={post.cover_image_url}
                    alt=""
                    className={styles.thumbImg}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <span className={styles.thumbPlaceholder}>📝</span>
                )}
              </div>

              {/* Info */}
              <div className={styles.postInfo}>
                <div className={styles.postTitleRow}>
                  <Link to={`/owner/blog/${post.id}/edit`} className={styles.postTitle}>
                    {post.title}
                  </Link>
                  <span className={`${styles.statusBadge} ${post.status === "published" ? styles.badgePublished : styles.badgeDraft}`}>
                    {post.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>
                {post.excerpt && (
                  <p className={styles.postExcerpt}>{post.excerpt}</p>
                )}
                <span className={styles.postDate}>
                  {post.status === "published" && post.published_at
                    ? `Published ${fmtDate(post.published_at)}`
                    : `Created ${fmtDate(post.created_at)}`}
                </span>
              </div>

              {/* Actions */}
              <div className={styles.postActions}>
                <button
                  type="button"
                  className={styles.btnSmall}
                  onClick={() => navigate(`/owner/blog/${post.id}/edit`)}
                  disabled={deletingId === post.id}
                >
                  Edit
                </button>
                {post.status === "published" && slug && (
                  <a
                    href={`/store/${encodeURIComponent(slug)}/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnSmall}
                  >
                    View
                  </a>
                )}
                <button
                  type="button"
                  className={`${styles.btnSmall} ${styles.btnDanger}`}
                  onClick={() => handleDelete(post)}
                  disabled={deletingId === post.id}
                >
                  {deletingId === post.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
