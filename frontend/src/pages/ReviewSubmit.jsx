import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import styles from "./ReviewSubmit.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;
  return (
    <div className={styles.starPicker} onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.starBtn} ${n <= display ? styles.starActive : ""}`}
          onMouseEnter={() => setHovered(n)}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewSubmit() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [review, setReview]   = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const [rating, setRating]   = useState(0);
  const [body, setBody]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/review/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Review link not found");
        setReview(data.review);
        // If already submitted (rating > 0), show done
        if (data.review.rating > 0) setDone(true);
      } catch (err) {
        setFetchError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) return setSubmitError("Please select a rating");
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Submission failed");
      setDone(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const accentColor = review?.primary_color || "#0d6efd";

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>
          <p className={styles.loadingText}>Loading…</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>
          <p className={styles.errorEmoji}>😕</p>
          <h1 className={styles.cardTitle}>Link not found</h1>
          <p className={styles.cardDesc}>{fetchError}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.shell}>
        <div className={styles.card} style={{ "--accent": accentColor }}>
          <p className={styles.doneEmoji}>🎉</p>
          <h1 className={styles.cardTitle}>Thank you!</h1>
          <p className={styles.cardDesc}>Your review has been submitted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.card} style={{ "--accent": accentColor }}>
        <div className={styles.storeRow}>
          <span className={styles.storeName}>{review.store_name}</span>
        </div>
        <h1 className={styles.cardTitle}>Review your purchase</h1>
        <p className={styles.productName}>{review.product_title}</p>

        {submitError && <p className={styles.submitError}>{submitError}</p>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.ratingSection}>
            <label className={styles.ratingLabel}>Your rating</label>
            <StarPicker value={rating} onChange={setRating} />
            {rating > 0 && (
              <span className={styles.ratingWord} style={{ color: accentColor }}>
                {RATING_LABELS[rating]}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Tell us more (optional)</label>
            <textarea
              className={styles.textarea}
              placeholder="What did you like or dislike? What would you recommend?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={2000}
            />
            <span className={styles.charCount}>{body.length}/2000</span>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            style={{ background: accentColor }}
            disabled={submitting || !rating}
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </form>
      </div>
    </div>
  );
}
