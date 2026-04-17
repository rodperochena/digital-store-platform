import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { updateOwnerStore, getOwnerStore, updateOwnerAccount, getOwnerAccount, completeOnboarding } from "../../api/owner";
import styles from "./Onboarding.module.css";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const CURRENCIES = [
  { code: "usd", name: "US Dollar",        symbol: "$"  },
  { code: "eur", name: "Euro",             symbol: "€"  },
  { code: "gbp", name: "British Pound",    symbol: "£"  },
  { code: "cad", name: "Canadian Dollar",  symbol: "$"  },
  { code: "aud", name: "Australian Dollar",symbol: "$"  },
  { code: "jpy", name: "Japanese Yen",     symbol: "¥"  },
  { code: "chf", name: "Swiss Franc",      symbol: "Fr" },
  { code: "sgd", name: "Singapore Dollar", symbol: "$"  },
  { code: "nzd", name: "NZ Dollar",        symbol: "$"  },
  { code: "inr", name: "Indian Rupee",     symbol: "₹"  },
  { code: "brl", name: "Brazilian Real",   symbol: "R$" },
  { code: "mxn", name: "Mexican Peso",     symbol: "$"  },
  { code: "hkd", name: "HK Dollar",        symbol: "$"  },
  { code: "nok", name: "Norwegian Krone",  symbol: "kr" },
  { code: "sek", name: "Swedish Krona",    symbol: "kr" },
  { code: "dkk", name: "Danish Krone",     symbol: "kr" },
];

const TOTAL_STEPS = 4;

function StepIndicator({ step }) {
  return (
    <div className={styles.stepIndicator}>
      <span className={styles.stepLabel}>Step {step} of {TOTAL_STEPS}</span>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function Onboarding() {
  const { ownerStore, ownerCtx, setOwnerStore, setOnboardingDone, onboardingDone } = useOwner();
  const navigate = useNavigate();

  const orig = ownerStore ?? {};

  // All form state collected across steps
  const [step, setStep]               = useState(1);
  const [name, setName]               = useState(orig.name ?? "");
  const [tagline, setTagline]         = useState(orig.tagline ?? "");
  const [currency, setCurrency]       = useState(orig.currency || "usd");
  const [primaryColor, setPrimaryColor] = useState(orig.primary_color ?? "#0d6efd");
  const [logoUrl, setLogoUrl]         = useState(orig.logo_url ?? "");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // Already completed onboarding — all hooks above this line
  if (onboardingDone) return <Navigate to="/owner/dashboard" replace />;

  const colorPickerValue = HEX_RE.test(primaryColor) ? primaryColor : "#0d6efd";
  const accentColor = HEX_RE.test(primaryColor) ? primaryColor : "#0d6efd";
  const storeSlug = orig.slug ?? "";

  function goNext() {
    setError(null);
    // Validate current step
    if (step === 1) {
      if (!name.trim() || name.trim().length < 2) {
        setError("Store name must be at least 2 characters.");
        return;
      }
      if (name.trim().length > 100) {
        setError("Store name must be 100 characters or fewer.");
        return;
      }
    }
    if (step === 2) {
      if (!currency) {
        setError("Please choose a currency.");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  function goBack() {
    setError(null);
    setStep((s) => s - 1);
  }

  async function handleFinish() {
    setError(null);
    setLoading(true);
    try {
      const body = {};
      const trimName     = name.trim();
      const trimTagline  = tagline.trim();
      const trimColor    = primaryColor.trim();
      const trimLogo     = logoUrl.trim();

      if (trimName && trimName !== (orig.name ?? ""))             body.name = trimName;
      if (trimTagline !== (orig.tagline ?? ""))                   body.tagline = trimTagline || undefined;
      if (currency && currency !== (orig.currency ?? ""))         body.currency = currency;
      if (trimColor && trimColor !== (orig.primary_color ?? ""))  body.primary_color = trimColor;
      if (trimLogo !== (orig.logo_url ?? ""))                     body.logo_url = trimLogo || undefined;

      if (Object.keys(body).length > 0) {
        await updateOwnerStore(body, ownerCtx);
      }

      const data = await getOwnerStore(ownerCtx);
      setOwnerStore(data.store);
      completeOnboarding(ownerCtx).catch(() => {});
      setOnboardingDone(true);
      navigate("/owner/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 1: Store identity ────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className={styles.page}>
        <StepIndicator step={1} />
        <h1 className={styles.pageHeading}>Set up your store</h1>
        <p className={styles.pageSubtitle}>Give your store a name that buyers will remember.</p>

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
          </div>
        )}

        {/* Store preview */}
        <div className={styles.storePreview} style={{ borderColor: accentColor }}>
          <div className={styles.previewHeader} style={{ background: accentColor + "18", borderBottomColor: accentColor }}>
            <div className={styles.previewLogo} style={{ background: accentColor }}>
              {name.trim().charAt(0).toUpperCase() || "S"}
            </div>
            <span className={styles.previewName}>{name.trim() || "Your Store Name"}</span>
          </div>
          {tagline.trim() && (
            <div className={styles.previewTagline}>{tagline.trim()}</div>
          )}
          <div className={styles.previewUrl}>/store/{storeSlug}</div>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="storeName">Store Name</label>
            <input
              id="storeName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Creative Assets Co."
              maxLength={100}
              autoFocus
            />
            <span className={styles.hint}>This is the first thing buyers see.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="tagline">
              Tagline <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="tagline"
              type="text"
              className={styles.input}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Premium templates for modern creators"
              maxLength={150}
            />
            <span className={styles.charCount}>{tagline.length}/150</span>
          </div>

          <div className={styles.stepFooter}>
            <div /> {/* spacer */}
            <button type="button" className={styles.btnPrimary} onClick={goNext}>
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Currency ──────────────────────────────────────────────────────

  if (step === 2) {
    return (
      <div className={styles.page}>
        <StepIndicator step={2} />
        <h1 className={styles.pageHeading}>Choose your currency</h1>
        <p className={styles.pageSubtitle}>All your products will use this currency for pricing and Stripe payments.</p>

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
          </div>
        )}

        <div className={styles.currencyWarning}>
          <span className={styles.warningIcon}>⚠</span>
          <span>Choose carefully — this will apply to all products. Changing it later may affect existing products.</span>
        </div>

        <div className={styles.currencyGrid}>
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`${styles.currencyCard} ${currency === c.code ? styles.currencyCardSelected : ""}`}
              style={currency === c.code ? { borderColor: accentColor, background: accentColor + "0d" } : {}}
              onClick={() => setCurrency(c.code)}
            >
              <span className={styles.currencySymbol}>{c.symbol}</span>
              <span className={styles.currencyCode}>{c.code.toUpperCase()}</span>
              <span className={styles.currencyName}>{c.name}</span>
            </button>
          ))}
        </div>

        <div className={styles.stepFooter}>
          <button type="button" className={styles.btnGhost} onClick={goBack}>
            ← Back
          </button>
          <button type="button" className={styles.btnPrimary} onClick={goNext}>
            Next →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Branding ──────────────────────────────────────────────────────

  if (step === 3) {
    return (
      <div className={styles.page}>
        <StepIndicator step={3} />
        <h1 className={styles.pageHeading}>Personalize your brand</h1>
        <p className={styles.pageSubtitle}>Choose a color and logo that represent your store. You can always change these later.</p>

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
          </div>
        )}

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="primaryColor">Primary Color</label>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorSwatch}
                value={colorPickerValue}
                onChange={(e) => setPrimaryColor(e.target.value)}
                title="Pick a color"
              />
              <input
                id="primaryColor"
                type="text"
                className={styles.input}
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#0d6efd"
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
              />
              <div
                className={styles.colorPreviewDot}
                style={{ background: HEX_RE.test(primaryColor) ? primaryColor : "#0d6efd" }}
              />
            </div>
            <span className={styles.hint}>Hex format: #RRGGBB. Used for buttons, borders, and accents.</span>
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
              placeholder="https://example.com/logo.png"
              spellCheck={false}
              autoComplete="off"
            />
            <span className={styles.hint}>A direct link to your logo image. Shown in your store header.</span>
          </div>

          <div className={styles.stepFooter}>
            <button type="button" className={styles.btnGhost} onClick={goBack}>
              ← Back
            </button>
            <div className={styles.stepFooterRight}>
              <button type="button" className={styles.btnSkip} onClick={goNext}>
                Skip for now →
              </button>
              <button type="button" className={styles.btnPrimary} onClick={goNext}>
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Summary / finish ──────────────────────────────────────────────

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className={styles.page}>
      <StepIndicator step={4} />
      <h1 className={styles.pageHeading}>You're all set!</h1>
      <p className={styles.pageSubtitle}>Here's a summary of your store setup. You can change everything in Settings later.</p>

      {error && (
        <div className={styles.alertWrap}>
          <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}

      <div className={styles.summaryCard}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Store Name</span>
          <span className={styles.summaryValue}>{name.trim() || orig.name || "—"}</span>
        </div>
        {tagline.trim() && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Tagline</span>
            <span className={styles.summaryValue}>{tagline.trim()}</span>
          </div>
        )}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Currency</span>
          <span className={styles.summaryValue}>
            {selectedCurrency ? `${selectedCurrency.code.toUpperCase()} — ${selectedCurrency.name}` : currency.toUpperCase()}
          </span>
        </div>
        {HEX_RE.test(primaryColor) && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>Brand Color</span>
            <div className={styles.summaryColorRow}>
              <div className={styles.summaryColorDot} style={{ background: primaryColor }} />
              <span className={styles.summaryValue}>{primaryColor}</span>
            </div>
          </div>
        )}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Store URL</span>
          <span className={`${styles.summaryValue} ${styles.summaryMono}`}>/store/{storeSlug}</span>
        </div>
      </div>

      <div className={styles.stepFooter}>
        <button type="button" className={styles.btnGhost} onClick={goBack} disabled={loading}>
          ← Back
        </button>
        <button type="button" className={styles.btnPrimary} onClick={handleFinish} disabled={loading}>
          {loading && <Spinner size={14} />}
          {loading ? "Saving…" : "Go to Dashboard →"}
        </button>
      </div>
    </div>
  );
}
