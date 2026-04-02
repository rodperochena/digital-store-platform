import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { claimAccess } from "../../api/owner";
import styles from "./ClaimAccess.module.css";

function loadPendingClaim() {
  try {
    const raw = localStorage.getItem("owner_claim_pending");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingClaim() {
  try {
    localStorage.removeItem("owner_claim_pending");
  } catch {
    // ignore
  }
}

export default function ClaimAccess() {
  const { setSessionToken, setOwnerStore } = useOwner();
  const navigate = useNavigate();

  const [pendingClaim] = useState(() => loadPendingClaim());
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // If there's no pending claim, we can't proceed
  if (!pendingClaim?.store_id || !pendingClaim?.bootstrap_token) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.heading}>Claim Access</h1>
          <p className={styles.subtitle}>
            No pending store claim found. You need to provision a store first.
          </p>
          <Link to="/simulate-purchase" className={styles.linkBtn}>
            Create a new store
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await claimAccess({
        store_id:        pendingClaim.store_id,
        bootstrap_token: pendingClaim.bootstrap_token,
        password,
      });

      // Clear the one-time claim data
      clearPendingClaim();

      // Persist session
      setSessionToken(data.session_token);
      setOwnerStore(data.store);

      navigate("/owner/onboarding", { replace: true });
    } catch (err) {
      if (err.status === 401) {
        setError("The setup link has expired or is invalid. Please create a new store.");
      } else if (err.status === 409) {
        setError("This store has already been claimed. Please log in instead.");
      } else {
        setError(err.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Claim Your Store</h1>
        <p className={styles.subtitle}>
          Create a password to secure your store. You'll use it to log in going forward.
        </p>

        {pendingClaim.slug && (
          <div className={styles.slugBadge}>
            Store: <span className={styles.mono}>{pendingClaim.slug}</span>
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
            <label className={styles.label} htmlFor="password">
              Create Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">
              Confirm Password
            </label>
            <input
              id="confirm"
              type="password"
              className={styles.input}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Setting up…" : "Claim Access"}
          </button>
        </form>

        <p className={styles.loginLink}>
          Already claimed? <Link to="/owner/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
