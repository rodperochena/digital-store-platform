import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { buyerResetPassword } from "../../api/buyer";
import styles from "./BuyerResetPassword.module.css";

export default function BuyerResetPassword() {
  const { slug }       = useParams();
  const [params]       = useSearchParams();
  const token          = params.get("token") || "";

  const [password,    setPassword]    = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState(false);
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid or missing reset token. Please request a new link.");
      return;
    }
    if (password !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await buyerResetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.title}>Password updated!</h1>
          <p className={styles.successText}>
            Your password has been changed. You can now log in with your new password.
          </p>
          <Link to={`/store/${slug}/login`} className={styles.loginBtn}>
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Set a new password</h1>
        <p className={styles.subtitle}>Enter and confirm your new password below.</p>

        {!token && (
          <div className={styles.error}>
            Invalid or missing reset token.{" "}
            <Link to={`/store/${slug}/forgot-password`} className={styles.errorLink}>
              Request a new link
            </Link>
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPass">Confirm password</label>
            <input
              id="confirmPass"
              type="password"
              className={styles.input}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !token || !password || !confirmPass}
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>

        <Link to={`/store/${slug}/login`} className={styles.backLink}>
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
