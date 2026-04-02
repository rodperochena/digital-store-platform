import { useState, useRef } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useOwner } from "../context/OwnerContext";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import { claimAccess, updateOwnerStore, updateOwnerAccount, checkSlug, checkEmail } from "../api/owner";
import styles from "./GetStarted.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

// Internal substeps: 1 = Account, 2 = Store name, 3 = Store username, 4 = Success
// Progress bar circles map: substep 1 → circle 1, substeps 2–3 → circle 2, substep 4 → circle 3
const PROGRESS_LABELS = ["Account", "Store", "Ready"];

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function progressCircle(substep) {
  if (substep === 1) return 1;
  if (substep === 4) return 3;
  return 2;
}

function formatUsername(raw) {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")        // spaces → hyphens
    .replace(/[^a-z0-9-]/g, ""); // strip anything else
}

export default function GetStarted() {
  const { ownerStore, setSessionToken, setOwnerStore, setOnboardingDone } = useOwner();
  const navigate = useNavigate();

  // ── Substep ─────────────────────────────────────────────────────────────────
  const [substep, setSubstep] = useState(1);

  // ── Step 1 fields ────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");

  // ── Step 2a field ────────────────────────────────────────────────────────────
  const [storeName, setStoreName] = useState("");

  // ── Step 2b fields ───────────────────────────────────────────────────────────
  const [username, setUsername]   = useState("");
  // "idle" | "checking" | "available" | "taken" | "invalid"
  const [slugStatus, setSlugStatus] = useState("idle");
  const slugTimerRef = useRef(null);

  // ── Session established after step 1 ────────────────────────────────────────
  const [claimedToken, setClaimedToken]   = useState(null);
  const [claimedStore, setClaimedStore]   = useState(null); // provisional store from provision

  // ── Wizard active flag (prevents premature redirect after step 1 sets session) ─
  const [wizardActive, setWizardActive] = useState(false);

  // ── Shared ───────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // Derived
  const finalSlug = claimedStore?.slug ?? "";
  const activeCircle = progressCircle(substep);

  // Already-authenticated owners go straight to dashboard (guard bypassed while wizard is active)
  if (ownerStore && !wizardActive) {
    return <Navigate to="/owner/dashboard" replace />;
  }

  // ── Username availability debounce ──────────────────────────────────────────

  function handleUsernameChange(e) {
    const formatted = formatUsername(e.target.value);
    setUsername(formatted);
    setSlugStatus("idle");

    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (!formatted) return;

    if (formatted.length < 3 || formatted.length > 40 || !SLUG_RE.test(formatted)) {
      setSlugStatus("invalid");
      return;
    }

    slugTimerRef.current = setTimeout(async () => {
      setSlugStatus("checking");
      try {
        const data = await checkSlug(formatted);
        setSlugStatus(data.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
  }

  // ── Step 1 submit ────────────────────────────────────────────────────────────

  async function handleStep1(e) {
    e.preventDefault();
    setError(null);

    // Already provisioned (Back was clicked from step 2) — just advance
    if (claimedToken) {
      setSubstep(2);
      return;
    }

    const trimFirst = firstName.trim();
    const trimLast  = lastName.trim();
    const trimEmail = email.trim();

    if (!trimFirst)                              { setError("First name is required."); return; }
    if (!trimLast)                               { setError("Last name is required."); return; }
    if (!trimEmail || !trimEmail.includes("@")) { setError("Please enter a valid email address."); return; }
    if (password.length < 8)                    { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm)                   { setError("Passwords do not match."); return; }

    setWizardActive(true);
    setLoading(true);
    try {
      const emailCheck = await checkEmail(trimEmail);
      if (emailCheck.exists) {
        setError("An account with this email already exists. Please sign in instead.");
        setLoading(false);
        return;
      }
    } catch {
      // Non-fatal — proceed; server will enforce uniqueness
    }
    try {
      // 1. Provision a temporary store (name updated in step 2a)
      const provRes = await fetch(`${API_BASE}/api/dev/provision-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_name: `${trimFirst}'s Store` }),
      });
      const provData = await provRes.json();
      if (!provRes.ok) throw new Error(provData?.message ?? "Could not create your account.");

      // 2. Claim access — sets password, returns session token
      const claimData = await claimAccess({
        store_id:        provData.store_id,
        bootstrap_token: provData.bootstrap_token,
        password,
      });

      const ctx = { sessionToken: claimData.session_token, apiBase: API_BASE };

      // 3. Persist session in context
      setSessionToken(claimData.session_token);
      setOwnerStore(claimData.store);
      setClaimedToken(claimData.session_token);
      setClaimedStore(claimData.store);

      // 4. Write name + email (best-effort, non-blocking)
      updateOwnerAccount({ email: trimEmail, first_name: trimFirst, last_name: trimLast }, ctx)
        .catch(() => {});

      // Pre-fill store name for step 2a
      setStoreName(`${trimFirst}'s Store`);
      setSubstep(2);
    } catch (err) {
      if (err.status === 409) {
        setError("This account already exists. Please sign in instead.");
      } else {
        setError(err.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2a submit (store name) ──────────────────────────────────────────────

  function handleStep2a(e) {
    e.preventDefault();
    setError(null);
    const trimName = storeName.trim();
    if (trimName.length < 2) { setError("Store name must be at least 2 characters."); return; }
    setSubstep(3);
  }

  // ── Step 2b submit (username / slug) ─────────────────────────────────────────

  async function handleStep2b(e) {
    e.preventDefault();
    setError(null);

    if (slugStatus !== "available") return;

    const ctx = { sessionToken: claimedToken, apiBase: API_BASE };

    setLoading(true);
    try {
      const data = await updateOwnerStore(
        { name: storeName.trim(), slug: username },
        ctx
      );
      setOwnerStore(data.store);
      setClaimedStore(data.store);
      setOnboardingDone(true);
      setSubstep(4);
    } catch (err) {
      if (err.status === 409) {
        setSlugStatus("taken");
        setError("That username was just taken. Please choose another one.");
      } else {
        setError(err.message ?? "Could not save your store settings.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* ── Progress bar ──────────────────────────────────────── */}
        <div className={styles.progress} aria-label="Setup progress">
          {PROGRESS_LABELS.map((label, i) => {
            const circleNum = i + 1;
            const done      = activeCircle > circleNum;
            const active    = activeCircle === circleNum;
            return (
              <div key={label} className={styles.progressRow}>
                {i > 0 && (
                  <div className={`${styles.connector} ${activeCircle > i ? styles.connectorDone : ""}`} />
                )}
                <div className={styles.progressItem}>
                  <div className={`${styles.dot} ${(active || done) ? styles.dotActive : ""}`}>
                    {done ? "✓" : circleNum}
                  </div>
                  <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""}`}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Step content (keyed for CSS fade-in) ──────────────── */}
        <div className={styles.stepContent} key={substep}>

          {/* ── SUBSTEP 1: Create Your Account ────────────────── */}
          {substep === 1 && (
            <>
              <h1 className={styles.heading}>Create Your Account</h1>
              <p className={styles.subtitle}>
                Start selling digital products in minutes — completely free.
              </p>

              {error && (
                <div className={styles.alertWrap}>
                  <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
                </div>
              )}

              {/* Placeholder space for future social sign-up buttons */}
              {/* <div className={styles.socialBtns}>
                <button className={styles.socialBtn}>Continue with Google</button>
                <button className={styles.socialBtn}>Continue with Apple</button>
              </div>
              <div className={styles.divider}><span>or</span></div> */}

              <form onSubmit={handleStep1} className={styles.form} noValidate>
                <div className={styles.row2}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="gs-firstName">First name</label>
                    <input
                      id="gs-firstName"
                      type="text"
                      className={styles.input}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      autoComplete="given-name"
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="gs-lastName">Last name</label>
                    <input
                      id="gs-lastName"
                      type="text"
                      className={styles.input}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      autoComplete="family-name"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gs-email">Email</label>
                  <input
                    id="gs-email"
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gs-password">Password</label>
                  <input
                    id="gs-password"
                    type="password"
                    className={styles.input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gs-confirm">Confirm password</label>
                  <input
                    id="gs-confirm"
                    type="password"
                    className={styles.input}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>

                <div className={styles.btnRow}>
                  <button type="submit" className={styles.btnPrimary} disabled={loading}>
                    {loading && <Spinner size={15} />}
                    {loading ? "Creating account…" : "Continue →"}
                  </button>
                </div>
              </form>

              <p className={styles.footerNote}>
                Already have an account? <Link to="/owner/login">Sign in</Link>
              </p>
            </>
          )}

          {/* ── SUBSTEP 2: Store Name ──────────────────────────── */}
          {substep === 2 && (
            <>
              <h1 className={styles.heading}>Tell us about your store</h1>
              <p className={styles.subtitle}>
                Don't worry, you can always change this later.
              </p>

              {error && (
                <div className={styles.alertWrap}>
                  <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
                </div>
              )}

              <form onSubmit={handleStep2a} className={styles.form} noValidate>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gs-storeName">Store name</label>
                  <input
                    id="gs-storeName"
                    type="text"
                    className={styles.input}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g. Jane's Design Templates"
                    maxLength={100}
                    autoComplete="organization"
                    autoFocus
                    disabled={loading}
                  />
                  <span className={styles.hint}>
                    This will be displayed on your store's homepage.
                  </span>
                </div>

                <div className={styles.btnRow}>
                  <button type="submit" className={styles.btnPrimary} disabled={loading}>
                    Continue →
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── SUBSTEP 3: Store Username ──────────────────────── */}
          {substep === 3 && (
            <>
              <h1 className={styles.heading}>Choose your store username</h1>
              <p className={styles.subtitle}>
                This will be your store's web address.
              </p>

              {error && (
                <div className={styles.alertWrap}>
                  <Alert type="error" onDismiss={() => setError(null)}>{error}</Alert>
                </div>
              )}

              <form onSubmit={handleStep2b} className={styles.form} noValidate>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="gs-username">Username</label>
                  <input
                    id="gs-username"
                    type="text"
                    className={`${styles.input} ${
                      slugStatus === "available" ? styles.inputValid :
                      slugStatus === "taken" || slugStatus === "invalid" ? styles.inputInvalid : ""
                    }`}
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="my-store"
                    maxLength={40}
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    disabled={loading}
                  />

                  {/* Availability indicator */}
                  <div className={styles.availRow}>
                    {slugStatus === "checking" && (
                      <span className={styles.availChecking}>
                        <Spinner size={13} /> Checking availability…
                      </span>
                    )}
                    {slugStatus === "available" && (
                      <span className={styles.availOk}>✓ Username is available!</span>
                    )}
                    {slugStatus === "taken" && (
                      <span className={styles.availErr}>✗ This username is already taken. Try another one.</span>
                    )}
                    {slugStatus === "invalid" && username.length > 0 && (
                      <span className={styles.availErr}>
                        ✗ 3–40 characters, lowercase letters, numbers, and hyphens only.
                      </span>
                    )}
                  </div>

                  {/* Live URL preview */}
                  {username && (
                    <div className={styles.urlPreview}>
                      <span className={styles.urlPreviewBase}>/store/</span>
                      <span className={styles.urlPreviewSlug}>{username}</span>
                    </div>
                  )}
                </div>

                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => { setError(null); setSubstep(2); }}
                    disabled={loading}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={loading || slugStatus !== "available"}
                  >
                    {loading && <Spinner size={15} />}
                    {loading ? "Saving…" : "Continue →"}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── SUBSTEP 4: Welcome / Success ──────────────────── */}
          {substep === 4 && (
            <div className={styles.success}>
              <div className={styles.successIcon} aria-hidden="true">✓</div>
              <h1 className={styles.heading}>
                Welcome to {claimedStore?.name || "your store"}!
              </h1>

              {finalSlug && (
                <div className={styles.successUrl}>
                  <span className={styles.successUrlLabel}>Your store address</span>
                  <span className={styles.successUrlValue}>/store/{finalSlug}</span>
                </div>
              )}

              <p className={styles.successSubtitle}>
                Your store is ready. Here's what to do next:
              </p>

              {/* Setup checklist */}
              <ul className={styles.checklist}>
                <li className={styles.checklistItem}>
                  <span className={styles.checklistIcon} aria-hidden="true">○</span>
                  <span className={styles.checklistText}>
                    Connect a payment method
                    <span className={styles.checklistNote}> — coming soon</span>
                  </span>
                </li>
                <li className={styles.checklistItem}>
                  <span className={styles.checklistIcon} aria-hidden="true">○</span>
                  <Link to="/owner/products" className={styles.checklistLink}>
                    Create your first product
                  </Link>
                </li>
                <li className={styles.checklistItem}>
                  <span className={styles.checklistIcon} aria-hidden="true">○</span>
                  <Link to="/owner/settings" className={styles.checklistLink}>
                    Customize your store design
                  </Link>
                </li>
              </ul>

              <div className={styles.ctaRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => navigate("/owner/products", { replace: true })}
                >
                  Add your first product →
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => navigate("/owner/dashboard", { replace: true })}
                >
                  Go to dashboard
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
