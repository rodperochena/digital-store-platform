import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { trackPageView } from "../api/tracking";
import styles from "./BlogListing.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogListing() {
  const { slug } = useParams();

  const [store, setStore]     = useState(null);
  const [posts, setPosts]     = useState(null);
  const [total, setTotal]     = useState(0);
  const [error, setError]     = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const PAGE = 10;
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
        const [storeRes, postsRes] = await Promise.all([
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/meta`),
          fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog?limit=${PAGE}&offset=0`),
        ]);
        if (!storeRes.ok) throw new Error("Store not found");
        const storeData = await storeRes.json();
        const postsData = postsRes.ok ? await postsRes.json() : { posts: [], total: 0 };
        if (!cancelled) {
          setStore(storeData.store);
          setPosts(postsData.posts ?? []);
          setTotal(postsData.total ?? 0);
          document.title = `Blog — ${storeData.store?.name || slug}`;
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [slug]);

  async function loadMore() {
    if (!posts) return;
    setLoadingMore(true);
    try {
      const res  = await fetch(`${API_BASE}/api/store/${encodeURIComponent(slug)}/blog?limit=${PAGE}&offset=${posts.length}`);
      const data = await res.json().catch(() => ({}));
      setPosts((prev) => [...(prev ?? []), ...(data.posts ?? [])]);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }

  const accentColor = store?.primary_color || "#0d6efd";

  if (error) {
    return (
      <div className={styles.shell}>
        <div className={styles.errorPage}><p>{error}</p></div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingPage}>Loading…</div>
      </div>
    );
  }

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
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.backLink}>
            ← Back to store
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Blog</h1>

        {posts === null ? (
          <p className={styles.loading}>Loading posts…</p>
        ) : posts.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>No posts yet. Check back soon!</p>
          </div>
        ) : (
          <>
            <div className={styles.postGrid}>
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/store/${encodeURIComponent(slug)}/blog/${post.slug}`}
                  className={styles.postCard}
                >
                  {post.cover_image_url && (
                    <div className={styles.cardCover}>
                      <img
                        src={post.cover_image_url}
                        alt=""
                        className={styles.cardCoverImg}
                        onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                      />
                    </div>
                  )}
                  <div className={styles.cardBody}>
                    <h2 className={styles.cardTitle}>{post.title}</h2>
                    {post.excerpt && (
                      <p className={styles.cardExcerpt}>{post.excerpt}</p>
                    )}
                    <div className={styles.cardMeta}>
                      {post.published_at && (
                        <span className={styles.cardDate}>{fmtDate(post.published_at)}</span>
                      )}
                      {post.author_name && (
                        <span className={styles.cardAuthor}>by {post.author_name}</span>
                      )}
                    </div>
                    <span className={styles.readMore} style={{ color: accentColor }}>Read more →</span>
                  </div>
                </Link>
              ))}
            </div>

            {posts.length < total && (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  className={styles.loadMoreBtn}
                  style={{ borderColor: accentColor, color: accentColor }}
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : `Load more (${total - posts.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
