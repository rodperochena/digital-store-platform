import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../api/owner";
import styles from "./OwnerLogin.module.css";

export default function ForgotPassword() {
  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Reset password</h1>

        {sent ? (
          <>
            <p className={styles.subtitle}>
              If an account exists for <strong>{email}</strong>, you'll receive a
              reset link shortly. Check your inbox.
            </p>
            <Link to="/owner/login" className={styles.btn} style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: "1rem" }}>
              Back to login
            </Link>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Email address</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <div className={styles.forgotWrap}>
              <Link to="/owner/login" className={styles.forgotLink}>
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
