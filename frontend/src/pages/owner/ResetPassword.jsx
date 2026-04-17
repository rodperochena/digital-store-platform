import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { resetPassword } from "../../api/owner";
import styles from "./OwnerLogin.module.css";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [done, setDone]           = useState(false);

  if (!token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Invalid link</h1>
          <p className={styles.subtitle}>This reset link is missing or invalid.</p>
          <Link to="/owner/forgot-password" className={styles.forgotLink}>
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/owner/login"), 2500);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Set new password</h1>

        {done ? (
          <p className={styles.subtitle}>
            Password updated! Redirecting to login…
          </p>
        ) : (
          <>
            <p className={styles.subtitle}>
              Choose a new password for your account.
            </p>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>New password</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Confirm password</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? "Saving…" : "Set password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
