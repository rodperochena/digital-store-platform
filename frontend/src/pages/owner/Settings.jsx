import { useState, useEffect, useRef, useMemo } from "react";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import {
  updateOwnerStore,
  getOwnerStore,
  getOwnerAccount,
  fetchOwnerStats,
  changePassword,
} from "../../api/owner";
import styles from "./Settings.module.css";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function OwnerSettings() {
  const { ownerStore, ownerCtx, setOwnerStore } = useOwner();
  const orig = ownerStore ?? {};

  const [name, setName]                       = useState(orig.name             ?? "");
  const [tagline, setTagline]                 = useState(orig.tagline          ?? "");
  const [description, setDescription]         = useState(orig.description      ?? "");
  const [currency, setCurrency]               = useState(orig.currency         ?? "");
  const [primaryColor, setPrimaryColor]       = useState(orig.primary_color    ?? "");
  const [secondaryColor, setSecondaryColor]   = useState(orig.secondary_color  ?? "");
  const [fontFamily, setFontFamily]           = useState(orig.font_family      ?? "system");
  const [logoUrl, setLogoUrl]                 = useState(orig.logo_url         ?? "");
  const [socialTwitter, setSocialTwitter]     = useState(orig.social_twitter   ?? "");
  const [socialInstagram, setSocialInstagram] = useState(orig.social_instagram ?? "");
  const [socialYoutube, setSocialYoutube]     = useState(orig.social_youtube   ?? "");
  const [socialWebsite, setSocialWebsite]     = useState(orig.social_website   ?? "");
  const [isPaused, setIsPaused]               = useState(orig.is_paused        ?? false);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew]         = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError]     = useState(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [account, setAccount]           = useState(null);
  const [totalProducts, setTotalProducts] = useState(null);
  const [copied, setCopied]             = useState(false);

  const toastTimer = useRef(null);

  useEffect(() => {
    getOwnerAccount(ownerCtx).then((d) => setAccount(d.account ?? null)).catch(() => {});
    fetchOwnerStats(ownerCtx).then((d) => setTotalProducts(d.stats?.total_products ?? 0)).catch(() => {});
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (success) {
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setSuccess(false), 3000);
    }
    return () => clearTimeout(toastTimer.current);
  }, [success]);

  // ── Dirty detection ──────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    return (
      name.trim()            !== (orig.name             ?? "") ||
      tagline.trim()         !== (orig.tagline          ?? "") ||
      description.trim()     !== (orig.description      ?? "") ||
      currency               !== (orig.currency         ?? "") ||
      primaryColor           !== (orig.primary_color    ?? "") ||
      secondaryColor         !== (orig.secondary_color  ?? "") ||
      fontFamily             !== (orig.font_family      ?? "system") ||
      logoUrl.trim()         !== (orig.logo_url         ?? "") ||
      socialTwitter.trim()   !== (orig.social_twitter   ?? "") ||
      socialInstagram.trim() !== (orig.social_instagram ?? "") ||
      socialYoutube.trim()   !== (orig.social_youtube   ?? "") ||
      socialWebsite.trim()   !== (orig.social_website   ?? "") ||
      isPaused               !== (orig.is_paused        ?? false)
    );
  }, [name, tagline, description, currency, primaryColor, secondaryColor, fontFamily,
      logoUrl, socialTwitter, socialInstagram, socialYoutube, socialWebsite, isPaused, orig]);

  function handleDiscard() {
    setName(orig.name             ?? "");
    setTagline(orig.tagline       ?? "");
    setDescription(orig.description ?? "");
    setCurrency(orig.currency     ?? "");
    setPrimaryColor(orig.primary_color  ?? "");
    setSecondaryColor(orig.secondary_color ?? "");
    setFontFamily(orig.font_family ?? "system");
    setLogoUrl(orig.logo_url      ?? "");
    setSocialTwitter(orig.social_twitter   ?? "");
    setSocialInstagram(orig.social_instagram ?? "");
    setSocialYoutube(orig.social_youtube   ?? "");
    setSocialWebsite(orig.social_website   ?? "");
    setIsPaused(orig.is_paused    ?? false);
    setError(null);
  }

  const storefrontUrl = orig.slug ? `${window.location.origin}/store/${orig.slug}` : null;
  const hasProducts   = totalProducts !== null && totalProducts > 0;
  const currencyChanged = currency.trim().toLowerCase() !== (orig.currency ?? "").toLowerCase();

  const colorPickerValue          = HEX_RE.test(primaryColor)   ? primaryColor   : "#0d6efd";
  const secondaryColorPickerValue = HEX_RE.test(secondaryColor) ? secondaryColor : "#6366f1";

  function handleCopyUrl() {
    if (!storefrontUrl) return;
    navigator.clipboard.writeText(storefrontUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const body = {};
    const trimName        = name.trim();
    const trimTagline     = tagline.trim();
    const trimDescription = description.trim();
    const trimCurrency    = currency.trim();
    const trimColor       = primaryColor.trim();
    const trimSecondary   = secondaryColor.trim();
    const trimLogo        = logoUrl.trim();
    const trimTwitter     = socialTwitter.trim();
    const trimInstagram   = socialInstagram.trim();
    const trimYoutube     = socialYoutube.trim();
    const trimWebsite     = socialWebsite.trim();

    if (trimName && trimName !== (orig.name ?? ""))                             body.name             = trimName;
    if (trimTagline !== (orig.tagline ?? ""))                                   body.tagline          = trimTagline     || undefined;
    if (trimDescription !== (orig.description ?? ""))                           body.description      = trimDescription || undefined;
    if (trimCurrency && trimCurrency !== (orig.currency ?? ""))                 body.currency         = trimCurrency;
    if (trimColor && trimColor !== (orig.primary_color ?? ""))                  body.primary_color    = trimColor;
    if (trimSecondary && trimSecondary !== (orig.secondary_color ?? ""))        body.secondary_color  = trimSecondary;
    if (fontFamily !== (orig.font_family ?? "system"))                          body.font_family      = fontFamily;
    if (trimLogo !== (orig.logo_url ?? ""))                                     body.logo_url         = trimLogo || undefined;
    if (trimTwitter !== (orig.social_twitter ?? ""))                            body.social_twitter   = trimTwitter   || undefined;
    if (trimInstagram !== (orig.social_instagram ?? ""))                        body.social_instagram = trimInstagram || undefined;
    if (trimYoutube !== (orig.social_youtube ?? ""))                            body.social_youtube   = trimYoutube   || undefined;
    if (trimWebsite !== (orig.social_website ?? ""))                            body.social_website   = trimWebsite   || undefined;
    if (isPaused !== (orig.is_paused ?? false))                                 body.is_paused        = isPaused;

    if (body.tagline !== undefined && body.tagline.length > 150) {
      setError("Tagline must be 150 characters or fewer."); return;
    }
    if (body.description !== undefined && body.description.length > 2000) {
      setError("Description must be 2000 characters or fewer."); return;
    }
    if (body.name !== undefined && (body.name.length < 2 || body.name.length > 100)) {
      setError("Store name must be 2–100 characters."); return;
    }
    if (body.currency !== undefined && (body.currency.length < 3 || body.currency.length > 10)) {
      setError("Currency must be 3–10 characters."); return;
    }
    if (body.primary_color !== undefined && !HEX_RE.test(body.primary_color)) {
      setError("Primary color must be #RRGGBB."); return;
    }
    if (body.secondary_color !== undefined && !HEX_RE.test(body.secondary_color)) {
      setError("Secondary color must be #RRGGBB."); return;
    }

    if (Object.keys(body).length === 0) { setSuccess(true); return; }

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

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (pwNew.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }
    setPwLoading(true);
    try {
      await changePassword(ownerCtx, { currentPassword: pwCurrent, newPassword: pwNew });
      setPwSuccess(true);
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>
      <p className={styles.subtitle}>Manage your store settings and account.</p>

      {success && (
        <div className={styles.successToast}>
          <span className={styles.successToastIcon}>✓</span>
          Settings saved
        </div>
      )}
      {error && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}

      <form id="settings-form" onSubmit={handleSubmit} noValidate>

        {/* ── Section 1: Store Profile ─────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Store Profile</h2>
          <p className={styles.cardDesc}>Information shown to your buyers</p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Store Name</label>
            <input
              id="name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              maxLength={100}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="tagline">Tagline</label>
            <input
              id="tagline"
              type="text"
              className={styles.input}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Premium design templates for creators"
              disabled={loading}
              maxLength={150}
            />
            <span className={styles.charCount}>{tagline.length}/150</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="description">Description</label>
            <textarea
              id="description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell buyers about your store, what you sell, and why they should trust you"
              disabled={loading}
              rows={5}
              maxLength={2000}
            />
            <span className={styles.charCount}>{description.length}/2000</span>
          </div>
        </div>

        {/* ── Section 2: Branding ──────────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Branding</h2>
          <p className={styles.cardDesc}>Customize the look of your storefront</p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="currency">Currency</label>
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
            {hasProducts && currencyChanged ? (
              <div className={styles.currencyWarning}>
                ⚠ Changing your currency may cause issues with existing products. Consider keeping {(orig.currency || "").toUpperCase()}.
              </div>
            ) : (
              <span className={styles.hint}>Cannot change after products exist.</span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="primaryColor">Primary Color</label>
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
            <span className={styles.hint}>Hex format: #RRGGBB</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="secondaryColor">Secondary Color</label>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorSwatch}
                value={secondaryColorPickerValue}
                onChange={(e) => setSecondaryColor(e.target.value)}
                disabled={loading}
                title="Pick a secondary color"
              />
              <input
                id="secondaryColor"
                type="text"
                className={styles.input}
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="#6366f1"
                disabled={loading}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <span className={styles.hint}>Used for hover effects and accent elements on your storefront.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Font Family</label>
            <div className={styles.fontCards}>
              {[
                { value: "system",  label: "Clean",   sample: "The quick brown fox", fontPreview: "system-ui, sans-serif" },
                { value: "rounded", label: "Rounded",  sample: "The quick brown fox", fontPreview: "'Quicksand', sans-serif" },
                { value: "serif",   label: "Elegant",  sample: "The quick brown fox", fontPreview: "'Playfair Display', serif" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.fontCard} ${fontFamily === opt.value ? styles.fontCardActive : ""}`}
                  onClick={() => setFontFamily(opt.value)}
                  disabled={loading}
                  style={fontFamily === opt.value ? { borderColor: colorPickerValue } : undefined}
                >
                  <span className={styles.fontCardLabel}>{opt.label}</span>
                  <span className={styles.fontCardSample} style={{ fontFamily: opt.fontPreview }}>{opt.sample}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="logoUrl">Logo URL</label>
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
        </div>

        {/* ── Section 3: Store URL ─────────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Store URL</h2>
          <p className={styles.cardDesc}>Your store's web address</p>

          <div className={styles.urlRow}>
            {storefrontUrl ? (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.urlText}
              >
                {storefrontUrl}
              </a>
            ) : (
              <span className={styles.urlText}>/store/{orig.slug}</span>
            )}
            {storefrontUrl && (
              <button type="button" className={styles.copyBtn} onClick={handleCopyUrl}>
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
          </div>
          <p className={styles.urlNote}>
            Your store URL is permanent and cannot be changed to protect existing links.
          </p>
        </div>

        {/* ── Section 4: Social Links ──────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Social Links</h2>
          <p className={styles.cardDesc}>Connect your social accounts so buyers can find you</p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="socialTwitter">Twitter / X</label>
            <input
              id="socialTwitter"
              type="text"
              className={styles.input}
              value={socialTwitter}
              onChange={(e) => setSocialTwitter(e.target.value)}
              placeholder="@handle or full URL"
              disabled={loading}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="socialInstagram">Instagram</label>
            <input
              id="socialInstagram"
              type="text"
              className={styles.input}
              value={socialInstagram}
              onChange={(e) => setSocialInstagram(e.target.value)}
              placeholder="@handle or full URL"
              disabled={loading}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="socialYoutube">YouTube</label>
            <input
              id="socialYoutube"
              type="text"
              className={styles.input}
              value={socialYoutube}
              onChange={(e) => setSocialYoutube(e.target.value)}
              placeholder="Channel URL"
              disabled={loading}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="socialWebsite">Website</label>
            <input
              id="socialWebsite"
              type="text"
              className={styles.input}
              value={socialWebsite}
              onChange={(e) => setSocialWebsite(e.target.value)}
              placeholder="https://yoursite.com"
              disabled={loading}
              maxLength={500}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        {/* ── Section 5: Store Status ──────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Store Status</h2>
          <p className={styles.cardDesc}>Control whether your store is accepting orders</p>

          <div className={styles.statusRow}>
            <button
              type="button"
              className={`${styles.togglePill} ${!isPaused ? styles.togglePillOn : ""}`}
              onClick={() => setIsPaused((v) => !v)}
              disabled={loading}
              aria-label={isPaused ? "Store paused — click to activate" : "Store active — click to pause"}
            >
              <span className={styles.toggleKnob} />
            </button>
            <span className={isPaused ? styles.statusLabelOff : styles.statusLabelOn}>
              {isPaused ? "Paused" : "Active"}
            </span>
          </div>
          <p className={styles.hint} style={{ marginTop: "10px" }}>
            When paused, buyers can browse your storefront but cannot check out.
          </p>
        </div>

      </form>

      {/* ── Section 6: Your Account ──────────────────────────────────── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Your Account</h2>
        <p className={styles.cardDesc}>Personal account details and security</p>

        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="acctFirstName">First Name</label>
            <input
              id="acctFirstName"
              type="text"
              className={styles.input}
              value={account?.first_name ?? ""}
              readOnly
              disabled
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="acctLastName">Last Name</label>
            <input
              id="acctLastName"
              type="text"
              className={styles.input}
              value={account?.last_name ?? ""}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="acctEmail">Email</label>
          <input
            id="acctEmail"
            type="email"
            className={styles.input}
            value={account?.email ?? ""}
            readOnly
            disabled
          />
        </div>

        <div className={styles.pwSubsection}>
          <h3 className={styles.pwSubtitle}>Password</h3>

          {pwSuccess && (
            <div className={styles.successToast} style={{ marginBottom: "12px" }}>
              <span className={styles.successToastIcon}>✓</span>
              Password updated
            </div>
          )}
          {pwError && (
            <div className={styles.alertWrap}>
              <Alert type="error" onDismiss={() => setPwError(null)}>{pwError}</Alert>
            </div>
          )}

          <form onSubmit={handleChangePassword} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pwCurrent">Current Password</label>
              <input
                id="pwCurrent"
                type="password"
                className={styles.input}
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                disabled={pwLoading}
                autoComplete="current-password"
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pwNew">New Password</label>
              <input
                id="pwNew"
                type="password"
                className={styles.input}
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                disabled={pwLoading}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className={styles.hint}>Minimum 8 characters.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pwConfirm">Confirm New Password</label>
              <input
                id="pwConfirm"
                type="password"
                className={styles.input}
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                disabled={pwLoading}
                autoComplete="new-password"
                required
              />
            </div>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={pwLoading || !pwCurrent || !pwNew || !pwConfirm}
            >
              {pwLoading && <Spinner size={14} />}
              {pwLoading ? "Updating…" : "Update Password"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Sticky save bar ──────────────────────────────────────────── */}
      {isDirty && (
        <div className={styles.stickyBar}>
          <span className={styles.stickyBarMsg}>You have unsaved changes</span>
          <div className={styles.stickyBarActions}>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={handleDiscard}
              disabled={loading}
            >
              Discard
            </button>
            <button
              type="submit"
              form="settings-form"
              className={styles.btnPrimary}
              disabled={loading}
            >
              {loading && <Spinner size={14} />}
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
