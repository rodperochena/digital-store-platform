import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import { listReviews, updateReview, deleteReview } from "../../api/owner";
import styles from "./Reviews.module.css";

function StarDisplay({ rating, max = 5 }) {
  return (
    <span className={styles.stars}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < rating ? styles.starFilled : styles.starEmpty}>★</span>
      ))}
    </span>
  );
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  const masked = local.length <= 2
    ? local[0] + "*"
    : local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}

export default function Reviews() {
  const { ownerCtx } = useOwner();
  const [reviews, setReviews] = useState(null);
  const [error, setError]     = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchReviews = useCallback(async () => {
    setError(null);
    try {
      const data = await listReviews(ownerCtx);
      setReviews(data.reviews ?? []);
    } catch (err) {
      setError(err.message);
      setReviews([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  async function handleToggleApproval(r) {
    setUpdatingId(r.id);
    try {
      const data = await updateReview(ownerCtx, r.id, { is_approved: !r.is_approved });
      setReviews((prev) => prev.map((x) => x.id === r.id ? { ...x, is_approved: data.review.is_approved } : x));
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(r) {
    if (!confirm(`Delete review from ${maskEmail(r.buyer_email)}? This cannot be undone.`)) return;
    setDeletingId(r.id);
    try {
      await deleteReview(ownerCtx, r.id);
      setReviews((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const avgRating = reviews && reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Reviews</h1>
          <p className={styles.subtitle}>
            {reviews === null
              ? "Loading…"
              : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}${avgRating ? ` · ${avgRating} avg rating` : ""}`}
          </p>
        </div>
      </div>

      {error && <p className={styles.errorMsg}>Failed to load reviews: {error}</p>}

      {reviews === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : reviews.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>⭐</span>
          <h2 className={styles.emptyTitle}>No reviews yet</h2>
          <p className={styles.emptyDesc}>
            Review invitations are sent automatically in the delivery email after each purchase.
          </p>
        </div>
      ) : (
        <div className={styles.reviewList}>
          {reviews.map((r) => (
            <div key={r.id} className={`${styles.reviewCard} ${!r.is_approved ? styles.reviewHidden : ""}`}>
              <div className={styles.reviewTop}>
                <div className={styles.reviewMeta}>
                  <StarDisplay rating={r.rating} />
                  <span className={styles.reviewerEmail}>{maskEmail(r.buyer_email)}</span>
                  <span className={styles.reviewProduct}>on {r.product_title}</span>
                </div>
                <div className={styles.reviewActions}>
                  <span className={`${styles.approvalBadge} ${r.is_approved ? styles.badgeApproved : styles.badgeHidden}`}>
                    {r.is_approved ? "Visible" : "Hidden"}
                  </span>
                  <button
                    type="button"
                    className={styles.btnSmall}
                    onClick={() => handleToggleApproval(r)}
                    disabled={updatingId === r.id || deletingId === r.id}
                  >
                    {updatingId === r.id ? "…" : r.is_approved ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btnSmall} ${styles.btnDanger}`}
                    onClick={() => handleDelete(r)}
                    disabled={updatingId === r.id || deletingId === r.id}
                  >
                    {deletingId === r.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
              {r.body && <p className={styles.reviewBody}>{r.body}</p>}
              <span className={styles.reviewDate}>
                {new Date(r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
