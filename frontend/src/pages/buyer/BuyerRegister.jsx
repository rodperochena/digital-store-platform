import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useBuyer } from "../../context/BuyerContext";
import { buyerRegister } from "../../api/buyer";
import styles from "./BuyerRegister.module.css";

export default function BuyerRegister() {
  const { slug }  = useParams();
  const navigate  = useNavigate();
  const { login } = useBuyer();

  const [email,          setEmail]          = useState("");
  const [displayName,    setDisplayName]    = useState("");
  const [password,       setPassword]       = useState("");
  const [confirmPass,    setConfirmPass]    = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const data = await buyerRegister(slug, email, password, displayName || undefined, marketingOptIn);
      // data: { token, account_id, email, display_name }
      login(data.token, { account_id: data.account_id, email: data.email, display_name: data.display_name });
      navigate(`/store/${slug}/account`);
    } catch (err) {
      if (err.message?.toLowerCase().includes("already exists")) {
        setError("An account with this email already exists. Please log in.");
      } else {
        setError(err.message || "Registration failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Access your purchases from any device</p>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="displayName">
              Display name <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPass">Confirm password</label>
            <input
              id="confirmPass"
              type="password"
              className={styles.input}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            <span>Keep me updated on new products and offers</span>
          </label>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !email || !password || !confirmPass}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have an account?{" "}
          <Link to={`/store/${slug}/login`} className={styles.switchLink}>
            Log in
          </Link>
        </p>

        <Link to={`/store/${slug}`} className={styles.backLink}>
          ← Back to store
        </Link>
      </div>
    </div>
  );
}
