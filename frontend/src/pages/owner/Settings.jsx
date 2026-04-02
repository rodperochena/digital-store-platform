import { useState } from "react";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { updateOwnerStore, getOwnerStore } from "../../api/owner";
import styles from "./Settings.module.css";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function OwnerSettings() {
  const { ownerStore, ownerCtx, setOwnerStore } = useOwner();
  const orig = ownerStore ?? {};

  const [name, setName]               = useState(orig.name ?? "");
  const [currency, setCurrency]       = useState(orig.currency ?? "");
  const [primaryColor, setPrimaryColor] = useState(orig.primary_color ?? "");
  const [logoUrl, setLogoUrl]         = useState(orig.logo_url ?? "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(false);

  const colorPickerValue = HEX_RE.test(primaryColor) ? primaryColor : "#0d6efd";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const body = {};
    const trimName     = name.trim();
    const trimCurrency = currency.trim();
    const trimColor    = primaryColor.trim();
    const trimLogo     = logoUrl.trim();

    if (trimName && trimName !== (orig.name ?? ""))             body.name = trimName;
    if (trimCurrency && trimCurrency !== (orig.currency ?? "")) body.currency = trimCurrency;
    if (trimColor && trimColor !== (orig.primary_color ?? ""))  body.primary_color = trimColor;
    if (trimLogo !== (orig.logo_url ?? ""))                     body.logo_url = trimLogo || undefined;

    if (body.name !== undefined && (body.name.length < 2 || body.name.length > 100)) {
      setError("Store name must be 2–100 characters."); return;
    }
    if (body.currency !== undefined && (body.currency.length < 3 || body.currency.length > 10)) {
      setError("Currency must be 3–10 characters."); return;
    }
    if (body.primary_color !== undefined && !HEX_RE.test(body.primary_color)) {
      setError("Primary color must be #RRGGBB."); return;
    }

    if (Object.keys(body).length === 0) {
      setSuccess(true); return;
    }

    setLoading(true);
    try {
      await updateOwnerStore(body, ownerCtx);
      const data = await getOwnerStore(ownerCtx);
      setOwnerStore(data.store);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>
      <p className={styles.subtitle}>Update your store details and branding.</p>

      {error && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}
      {success && (
        <div className={styles.alertWrap}>
          <Alert type="success" onDismiss={() => setSuccess(false)}>Settings saved.</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Store Identity</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Store Name</label>
            <input id="name" type="text" className={styles.input}
              value={name} onChange={(e) => setName(e.target.value)}
              disabled={loading} maxLength={100} />
          </div>

          <div className={styles.readonlyRow}>
            <span className={styles.label}>Store URL</span>
            <div className={styles.readonlyValue}>
              <span className={styles.mono}>/store/{orig.slug}</span>
              <span className={styles.fixedPill}>Fixed</span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Branding</h2>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">Currency</label>
              <select id="currency" className={styles.input}
                value={currency} onChange={(e) => setCurrency(e.target.value)}
                disabled={loading}>
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
              <span className={styles.hint}>Cannot change after products exist.</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="primaryColor">Primary Color</label>
              <div className={styles.colorRow}>
                <input type="color" className={styles.colorSwatch}
                  value={colorPickerValue}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  disabled={loading} title="Pick a color" />
                <input id="primaryColor" type="text" className={styles.input}
                  value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#0d6efd" disabled={loading} maxLength={7}
                  spellCheck={false} autoComplete="off" />
              </div>
              <span className={styles.hint}>Hex format: #RRGGBB.</span>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="logoUrl">
              Logo URL <span className={styles.optional}>(optional)</span>
            </label>
            <input id="logoUrl" type="url" className={styles.input}
              value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…" disabled={loading}
              spellCheck={false} autoComplete="off" />
          </div>
        </section>

        <div className={styles.footer}>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading && <Spinner size={15} />}
            {loading ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
