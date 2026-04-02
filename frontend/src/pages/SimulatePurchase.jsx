import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import Alert from "../components/Alert";
import styles from "./SimulatePurchase.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

export default function SimulatePurchase() {
  const navigate = useNavigate();

  const [storeName, setStoreName] = useState("");
  const [email, setEmail]         = useState("");

  // "idle" | "provisioning" | "redirecting" | "error"
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);

    const trimName  = storeName.trim();
    const trimEmail = email.trim();

    if (trimName.length < 2) {
      setError("Store name must be at least 2 characters.");
      return;
    }
    if (!trimEmail || !trimEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setPhase("provisioning");

    let data;
    try {
      const res = await fetch(`${API_BASE}/api/dev/provision-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_name: trimName }),
      });
      data = await res.json();
      if (!res.ok) {
        const msg = typeof data?.message === "string" ? data.message : "Could not create store.";
        throw new Error(msg);
      }
    } catch (err) {
      setPhase("error");
      setError(err.message ?? "Network error — is the backend running?");
      return;
    }

    const { store_id, slug, bootstrap_token } = data;

    // Store claim data (including email) temporarily in localStorage.
    // ClaimAccess and Onboarding read this — it never goes in the URL.
    try {
      localStorage.setItem(
        "owner_claim_pending",
        JSON.stringify({ store_id, slug, bootstrap_token, email: trimEmail })
      );
    } catch {
      // ignore storage errors
    }

    setPhase("redirecting");
    setTimeout(() => {
      navigate("/owner/claim-access", { replace: true });
    }, 600);
  }

  const isWorking = phase === "provisioning" || phase === "redirecting";

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Create Your Store</h1>
        <p className={styles.subtitle}>
          Start selling digital products in minutes.
        </p>

        {error && (
          <div className={styles.alertWrap}>
            <Alert type="error" onDismiss={() => { setError(null); setPhase("idle"); }}>
              {error}
            </Alert>
          </div>
        )}

        {isWorking ? (
          <div className={styles.working}>
            <Spinner size={22} />
            <span className={styles.workingLabel}>
              {phase === "provisioning" ? "Creating your store…" : "Setting up your store…"}
            </span>
          </div>
        ) : (
          <form onSubmit={handleCreate} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="storeName">Store name</label>
              <input
                id="storeName"
                type="text"
                className={styles.input}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Design Templates Co."
                maxLength={100}
                autoComplete="organization"
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="email">Your email</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <button type="submit" className={styles.btnPrimary}>
              Create my store →
            </button>
          </form>
        )}

        <p className={styles.footerNote}>
          Already have a store?{" "}
          <a href="/owner/login">Sign in</a>
        </p>
      </div>
    </div>
  );
}
