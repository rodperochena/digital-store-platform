import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useBuyer } from "../../context/BuyerContext";
import { buyerLogin } from "../../api/buyer";
import styles from "./BuyerLogin.module.css";

export default function BuyerLogin() {
  const { slug } = useParams();
  const navigate  = useNavigate();
  const { login } = useBuyer();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await buyerLogin(slug, email, password);
      // data: { token, account_id, email, display_name }
      login(data.token, { account_id: data.account_id, email: data.email, display_name: data.display_name });
      navigate(`/store/${slug}/account`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Log in to your account</h1>
        <p className={styles.subtitle}>Access your purchases and downloads</p>

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
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="password">Password</label>
              <Link to={`/store/${slug}/forgot-password`} className={styles.forgotLink}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !email || !password}
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className={styles.switchText}>
          Don&apos;t have an account?{" "}
          <Link to={`/store/${slug}/register`} className={styles.switchLink}>
            Create one
          </Link>
        </p>

        <Link to={`/store/${slug}`} className={styles.backLink}>
          ← Back to store
        </Link>
      </div>
    </div>
  );
}
