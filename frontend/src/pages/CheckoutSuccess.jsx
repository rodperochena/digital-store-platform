import { useSearchParams, Link } from "react-router-dom";
import styles from "./CheckoutSuccess.module.css";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const slug = params.get("slug");

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">✓</div>
        <h1 className={styles.heading}>Order Confirmed!</h1>
        <p className={styles.body}>
          Your payment was successful. Here's what happens next:
        </p>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNum}>1</span>
            <span className={styles.stepText}>
              Check your inbox — a download link has been sent to your email.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum}>2</span>
            <span className={styles.stepText}>
              Click the link to access your digital product immediately.
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNum}>3</span>
            <span className={styles.stepText}>
              Can't find it? Check your spam folder or contact the store.
            </span>
          </li>
        </ol>

        {sessionId && (
          <p className={styles.ref}>
            Reference:{" "}
            <span className={styles.mono}>{sessionId.slice(0, 20)}…</span>
          </p>
        )}

        {slug && (
          <Link to={`/store/${encodeURIComponent(slug)}`} className={styles.returnLink}>
            ← Return to store
          </Link>
        )}
      </div>
    </div>
  );
}
