import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import styles from "./Unsubscribe.module.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

export default function Unsubscribe() {
  const { token } = useParams();

  const [loading, setLoading]     = useState(true);
  const [info, setInfo]           = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone]           = useState(false);
  const [confirmError, setConfirmError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/unsubscribe/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Link not found");
        setInfo(data.subscriber);
        if (!data.subscriber.is_active) setDone(true);
      } catch (err) {
        setFetchError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/api/unsubscribe/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to unsubscribe");
      setDone(true);
    } catch (err) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>
          <p className={styles.loadingText}>Loading…</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>
          <p className={styles.bigEmoji}>😕</p>
          <h1 className={styles.title}>Link not found</h1>
          <p className={styles.desc}>{fetchError}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.shell}>
        <div className={styles.card}>
          <p className={styles.bigEmoji}>✅</p>
          <h1 className={styles.title}>Unsubscribed</h1>
          <p className={styles.desc}>
            You've been removed from <strong>{info?.store_name}</strong>'s mailing list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.bigEmoji}>📬</p>
        <h1 className={styles.title}>Unsubscribe</h1>
        <p className={styles.desc}>
          You are currently subscribed to updates from <strong>{info?.store_name}</strong>
          {info?.email ? ` (${info.email})` : ""}.
        </p>
        <p className={styles.desc}>Do you want to unsubscribe?</p>
        {confirmError && <p className={styles.errorMsg}>{confirmError}</p>}
        <button
          type="button"
          className={styles.unsubBtn}
          onClick={handleConfirm}
          disabled={confirming}
        >
          {confirming ? "Unsubscribing…" : "Yes, unsubscribe me"}
        </button>
      </div>
    </div>
  );
}
