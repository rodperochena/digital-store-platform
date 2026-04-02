import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import CopyButton from "../components/CopyButton";
import { createStore, enableStore, getStoreSettings } from "../api/stores";
import styles from "./StorePage.module.css";

const SLUG_RE = /^[a-z0-9-]+$/;

export default function StorePage() {
  const { adminKey, apiBase, setActiveStore } = useApp();
  const navigate = useNavigate();
  const ctx = { adminKey, apiBase };

  const [tab, setTab] = useState("create");

  // Create form state
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");

  // Load form state
  const [loadId, setLoadId] = useState("");

  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enableLoading, setEnableLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  function switchTab(next) {
    setTab(next);
    clearFeedback();
  }

  async function handleCreate(e) {
    e.preventDefault();
    clearFeedback();

    const trimSlug = slug.trim();
    const trimName = name.trim();
    const trimCurrency = currency.trim();

    if (trimSlug.length < 2 || trimSlug.length > 63) {
      setError("Slug must be 2–63 characters.");
      return;
    }
    if (!SLUG_RE.test(trimSlug)) {
      setError("Slug must be lowercase letters, numbers, or hyphens only.");
      return;
    }
    if (trimName.length < 2 || trimName.length > 100) {
      setError("Name must be 2–100 characters.");
      return;
    }
    if (trimCurrency && (trimCurrency.length < 3 || trimCurrency.length > 10)) {
      setError("Currency must be 3–10 characters if provided.");
      return;
    }

    const body = { slug: trimSlug, name: trimName };
    if (trimCurrency) body.currency = trimCurrency;

    setLoading(true);
    try {
      const data = await createStore(body, ctx);
      setStore(data.store);
      setSuccess("Store created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoad(e) {
    e.preventDefault();
    clearFeedback();

    const trimId = loadId.trim();
    if (!trimId) {
      setError("Store ID is required.");
      return;
    }

    setLoading(true);
    try {
      const data = await getStoreSettings(trimId, ctx);
      setStore(data.store);
      setSuccess("Store loaded.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnable() {
    clearFeedback();
    setEnableLoading(true);
    try {
      await enableStore(store.id, ctx);
      // enable response may not include all settings — always re-fetch
      const data = await getStoreSettings(store.id, ctx);
      setStore(data.store);
      setSuccess("Store enabled.");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnableLoading(false);
    }
  }

  function handleUseStore() {
    setActiveStore(store);
    navigate("/admin/products");
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Store Setup</h1>
      <p className={styles.subtitle}>Create a new store or load an existing one by ID.</p>

      {error && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={clearFeedback}>
            {error}
          </Alert>
        </div>
      )}
      {success && (
        <div className={styles.alertWrap}>
          <Alert type="success" onDismiss={() => setSuccess(null)}>
            {success}
          </Alert>
        </div>
      )}

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "create" ? styles.tabActive : ""}`}
          onClick={() => switchTab("create")}
        >
          Create New Store
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "load" ? styles.tabActive : ""}`}
          onClick={() => switchTab("load")}
        >
          Load Existing Store
        </button>
      </div>

      {tab === "create" && (
        <form onSubmit={handleCreate} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="slug">
              Slug
            </label>
            <input
              id="slug"
              type="text"
              className={styles.input}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-store"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            <span className={styles.hint}>Lowercase letters, numbers, hyphens. 2–63 characters.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Store"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="currency">
              Currency <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="currency"
              type="text"
              className={styles.input}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="USD"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Creating…" : "Create Store"}
          </button>
        </form>
      )}

      {tab === "load" && (
        <form onSubmit={handleLoad} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="loadId">
              Store ID
            </label>
            <input
              id="loadId"
              type="text"
              className={styles.input}
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Loading…" : "Load Store"}
          </button>
        </form>
      )}

      {store && (
        <div className={styles.card}>
          <h2 className={styles.cardHeading}>Store Details</h2>

          <dl className={styles.details}>
            <div className={styles.row}>
              <dt className={styles.dt}>ID</dt>
              <dd className={styles.dd}>
                <span className={styles.mono}>{store.id}</span>
                <CopyButton text={store.id} />
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>Slug</dt>
              <dd className={styles.dd}>
                <span className={styles.mono}>{store.slug}</span>
                <CopyButton text={store.slug} />
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>Name</dt>
              <dd className={styles.dd}>{store.name}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>Currency</dt>
              <dd className={styles.dd}>{store.currency ?? "—"}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>Status</dt>
              <dd className={styles.dd}>
                {store.is_enabled ? (
                  <span className={styles.badgeEnabled}>Enabled</span>
                ) : (
                  <span className={styles.badgeDisabled}>Disabled</span>
                )}
              </dd>
            </div>
          </dl>

          <div className={styles.cardActions}>
            {!store.is_enabled && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleEnable}
                disabled={enableLoading}
              >
                {enableLoading && <Spinner size={14} />}
                {enableLoading ? "Enabling…" : "Enable Store"}
              </button>
            )}
            <button type="button" className={styles.btnPrimary} onClick={handleUseStore}>
              Use This Store
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
