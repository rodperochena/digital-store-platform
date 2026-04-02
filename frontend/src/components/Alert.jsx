import styles from "./Alert.module.css";

export default function Alert({ type = "info", children, onDismiss }) {
  return (
    <div className={`${styles.alert} ${styles[type]}`} role="alert">
      <span className={styles.message}>{children}</span>
      {onDismiss && (
        <button
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
