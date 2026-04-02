import { useState } from "react";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { ownerLogin } from "../../api/owner";
import styles from "./OwnerLogin.module.css";

export default function OwnerLogin() {
  const { ownerStore, onboardingDone, setSessionToken, setOwnerStore } = useOwner();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isExpired = searchParams.get("expired") === "1";

  const [expiredDismissed, setExpiredDismissed] = useState(false);
  const [showForgotMsg, setShowForgotMsg]       = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  // Already authenticated — redirect immediately
  if (ownerStore) {
    return <Navigate to={onboardingDone ? "/owner/dashboard" : "/owner/onboarding"} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setShowForgotMsg(false);

    const trimId   = identifier.trim();
    const trimPass = password;

    if (!trimId) {
      setError("Email is required.");
      return;
    }
    if (!trimPass) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    try {
      const data = await ownerLogin({ identifier: trimId, password: trimPass });

      setSessionToken(data.session_token);
      setOwnerStore(data.store);

      // navigate clears ?expired=1 naturally
      navigate(onboardingDone ? "/owner/dashboard" : "/owner/onboarding", { replace: true });
    } catch (err) {
      if (err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError(err.message || "Unable to sign in.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Sign In</h1>
        <p className={styles.subtitle}>
          Sign in to manage your store.
        </p>

        {/* Session expired alert */}
        {isExpired && !expiredDismissed && (
          <div className={styles.alertWrap}>
            <Alert type="warning" onDismiss={() => setExpiredDismissed(true)}>
              Your session has expired. Please sign in again.
            </Alert>
          </div>
        )}

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="identifier">
              Email
            </label>
            <input
              id="identifier"
              type="email"
              className={styles.input}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              autoComplete="email"
            />
            <span className={styles.hint}>
              Use the email you signed up with.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Forgot password */}
        <div className={styles.forgotWrap}>
          <button
            type="button"
            className={styles.forgotLink}
            onClick={() => setShowForgotMsg((v) => !v)}
          >
            Forgot password?
          </button>
          {showForgotMsg && (
            <p className={styles.forgotMsg}>
              Password reset is coming soon. If you're locked out, contact support.
            </p>
          )}
        </div>

        <p className={styles.createLink}>
          New here?{" "}
          <Link to="/get-started">Create a store</Link>
        </p>
      </div>
    </div>
  );
}
