import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import { checkHealth } from "../api/client";
import styles from "./Connect.module.css";

export default function Connect() {
  const { adminKey, apiBase, setAdminKey, setApiBase } = useApp();
  const navigate = useNavigate();

  const [formApiBase, setFormApiBase] = useState(apiBase);
  const [formAdminKey, setFormAdminKey] = useState(adminKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimmedBase = formApiBase.trim().replace(/\/$/, "");
    const trimmedKey = formAdminKey.trim();

    if (!trimmedBase) {
      setError("API base URL is required.");
      return;
    }
    if (!trimmedKey) {
      setError("Admin key is required.");
      return;
    }

    setLoading(true);
    try {
      await checkHealth(trimmedBase);
      setApiBase(trimmedBase);
      setAdminKey(trimmedKey);
      navigate("/admin/store");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Connect to Backend</h1>
        <p className={styles.subtitle}>
          Enter your API base URL and admin key to access the admin panel.
        </p>

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="apiBase">
              API Base URL
            </label>
            <input
              id="apiBase"
              type="url"
              className={styles.input}
              value={formApiBase}
              onChange={(e) => setFormApiBase(e.target.value)}
              placeholder="http://127.0.0.1:5051"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="adminKey">
              Admin Key
            </label>
            <input
              id="adminKey"
              type="password"
              className={styles.input}
              value={formAdminKey}
              onChange={(e) => setFormAdminKey(e.target.value)}
              placeholder="your-admin-key"
              disabled={loading}
              autoComplete="off"
            />
            <span className={styles.hint}>
              Dev/demo use only — do not enter a production secret in a browser.
            </span>
          </div>

          <p className={styles.notice}>
            <strong>Note:</strong> Connecting only verifies that the backend is
            reachable. Your admin key is not validated until you perform an admin
            action in the next step.
          </p>

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
