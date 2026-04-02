import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { updateOwnerStore, getOwnerStore, updateOwnerAccount } from "../../api/owner";
import styles from "./Onboarding.module.css";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function loadPendingEmail() {
  try {
    const raw = localStorage.getItem("owner_claim_pending");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.email ?? "";
  } catch {
    return "";
  }
}

export default function Onboarding() {
  const { ownerStore, ownerCtx, setOwnerStore, setOnboardingDone } = useOwner();
  const navigate = useNavigate();

  const orig = ownerStore ?? {};

  const [email, setEmail]             = useState(loadPendingEmail);
  const [name, setName]               = useState(orig.name ?? "");
  const [currency, setCurrency]       = useState(orig.currency ?? "");
  const [primaryColor, setPrimaryColor] = useState(orig.primary_color ?? "");
  const [logoUrl, setLogoUrl]         = useState(orig.logo_url ?? "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [done, setDone]               = useState(false);

  // Already completed onboarding — send straight to settings (all hooks above this line)
  if (onboardingDone) return <Navigate to="/owner/settings" replace />;

  const colorPickerValue = HEX_RE.test(primaryColor) ? primaryColor : "#0d6efd";
  const storeSlug = orig.slug ?? "";
  const storeUrl = storeSlug ? `/store/${storeSlug}` : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const trimEmail    = email.trim();
    const trimName     = name.trim();
    const trimCurrency = currency.trim();
    const trimColor    = primaryColor.trim();
    const trimLogo     = logoUrl.trim();

    // Validate email if provided
    if (trimEmail && !trimEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    // Build body: only non-empty values that differ from original
    const body = {};
    if (trimName && trimName !== (orig.name ?? ""))               body.name = trimName;
    if (trimCurrency && trimCurrency !== (orig.currency ?? ""))   body.currency = trimCurrency;
    if (trimColor && trimColor !== (orig.primary_color ?? ""))    body.primary_color = trimColor;
    if (trimLogo && trimLogo !== (orig.logo_url ?? ""))           body.logo_url = trimLogo;

    // Client-side validation for fields being sent
    if (body.name !== undefined && (body.name.length < 2 || body.name.length > 100)) {
      setError("Store name must be 2–100 characters.");
      return;
    }
    if (body.currency !== undefined && (body.currency.length < 3 || body.currency.length > 10)) {
      setError("Currency must be 3–10 characters (e.g. USD, EUR).");
      return;
    }
    if (body.primary_color !== undefined && !HEX_RE.test(body.primary_color)) {
      setError("Primary color must be a 6-digit hex value like #RRGGBB.");
      return;
    }

    setLoading(true);
    try {
      const tasks = [];
      if (Object.keys(body).length > 0) {
        tasks.push(updateOwnerStore(body, ownerCtx));
      }
      if (trimEmail) {
        tasks.push(updateOwnerAccount({ email: trimEmail }, ownerCtx));
      }
      await Promise.all(tasks);

      // Re-fetch authoritative store state
      const data = await getOwnerStore(ownerCtx);
      setOwnerStore(data.store);
      setOnboardingDone(true);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <div className={styles.successIcon} aria-hidden="true">✓</div>
          <h1 className={styles.successHeading}>Your store is ready</h1>
          {storeSlug && (
            <p className={styles.successUrl}>
              <span className={styles.mono}>/store/{storeSlug}</span>
            </p>
          )}
          <p className={styles.successNote}>
            You can customise your store further from the Settings page at any time.
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => navigate("/owner/dashboard", { replace: true })}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageHeading}>Set Up Your Store</h1>
      <p className={styles.pageSubtitle}>
        Review and configure your store. Everything here can be changed later in Settings.
      </p>

      {error && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {/* ── Contact ─────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Contact</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ownerEmail">
              Email <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="ownerEmail"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              autoComplete="email"
            />
            <span className={styles.hint}>
              Used to contact you about your store. Not shown publicly.
            </span>
          </div>
        </section>

        {/* ── Store Identity ──────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Store Identity</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="storeName">
              Store Name
            </label>
            <input
              id="storeName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Store"
              disabled={loading}
              maxLength={100}
            />
          </div>

          <div className={styles.readonlyRow}>
            <span className={styles.label}>Store URL</span>
            <div className={styles.readonlyValue}>
              <span className={styles.mono}>/store/{orig.slug}</span>
              <span className={styles.fixedPill}>Fixed</span>
            </div>
            <span className={styles.hint}>
              Your store's web address is permanent and cannot be changed.
            </span>
          </div>

          {storeSlug && (
            <div className={styles.urlPreview}>
              <span className={styles.urlPreviewLabel}>Your store's public address</span>
              <span className={styles.urlPreviewValue}>/store/{storeSlug}</span>
              <span className={styles.urlWarning}>
                This URL cannot be changed later.
              </span>
            </div>
          )}
        </section>

        {/* ── Branding ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Branding</h2>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">
                Currency
              </label>
              <select
                id="currency"
                className={styles.input}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={loading}
              >
                <option value="usd">USD – US Dollar</option>
                <option value="eur">EUR – Euro</option>
                <option value="gbp">GBP – British Pound</option>
                <option value="cad">CAD – Canadian Dollar</option>
                <option value="aud">AUD – Australian Dollar</option>
                <option value="jpy">JPY – Japanese Yen</option>
                <option value="chf">CHF – Swiss Franc</option>
                <option value="sgd">SGD – Singapore Dollar</option>
                <option value="nzd">NZD – New Zealand Dollar</option>
                <option value="inr">INR – Indian Rupee</option>
                <option value="brl">BRL – Brazilian Real</option>
                <option value="mxn">MXN – Mexican Peso</option>
                <option value="hkd">HKD – Hong Kong Dollar</option>
                <option value="nok">NOK – Norwegian Krone</option>
                <option value="sek">SEK – Swedish Krona</option>
                <option value="dkk">DKK – Danish Krone</option>
              </select>
              <span className={styles.hint}>Cannot be changed after you add products.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="primaryColor">
                Primary Color
              </label>
              <div className={styles.colorRow}>
                <input
                  type="color"
                  className={styles.colorSwatch}
                  value={colorPickerValue}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={loading}
                  title="Pick a color"
                />
                <input
                  id="primaryColor"
                  type="text"
                  className={styles.input}
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#0d6efd"
                  disabled={loading}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <span className={styles.hint}>Hex format: #RRGGBB.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="logoUrl">
              Logo URL <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="logoUrl"
              type="url"
              className={styles.input}
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              disabled={loading}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className={styles.footer}>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Saving…" : "Save & Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
