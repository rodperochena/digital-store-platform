import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { buyerForgotPassword } from "../../api/buyer";
import styles from "./BuyerForgotPassword.module.css";

export default function BuyerForgotPassword() {
  const { slug } = useParams();
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await buyerForgotPassword(slug, email);
    } catch {
      // intentionally ignored — never expose whether email exists
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset your password</h1>

        {submitted ? (
          <div className={styles.success}>
            <p className={styles.successText}>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a
              password reset link. Check your inbox (and spam folder).
            </p>
            <Link to={`/store/${slug}/login`} className={styles.loginLink}>
              ← Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className={styles.subtitle}>
              Enter your email and we&apos;ll send you a reset link.
            </p>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading || !email}
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>

            <Link to={`/store/${slug}/login`} className={styles.backLink}>
              ← Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
