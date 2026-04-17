import { useState, useEffect, useCallback } from "react";
import { useOwner } from "../../context/OwnerContext";
import Spinner from "../../components/Spinner";
import { listSubscribers, deleteSubscriber, exportSubscribersCSV } from "../../api/owner";
import styles from "./Subscribers.module.css";

export default function Subscribers() {
  const { ownerCtx } = useOwner();
  const [subscribers, setSubscribers] = useState(null);
  const [error, setError]             = useState(null);
  const [deletingId, setDeletingId]   = useState(null);
  const [exporting, setExporting]     = useState(false);

  const fetchSubscribers = useCallback(async () => {
    setError(null);
    try {
      const data = await listSubscribers(ownerCtx);
      setSubscribers(data.subscribers ?? []);
    } catch (err) {
      setError(err.message);
      setSubscribers([]);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSubscribers(); }, [fetchSubscribers]);

  async function handleDelete(sub) {
    if (!confirm(`Remove ${sub.email} from subscribers?`)) return;
    setDeletingId(sub.id);
    try {
      await deleteSubscriber(ownerCtx, sub.id);
      setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err) {
      alert("Failed: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportSubscribersCSV(ownerCtx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "subscribers.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  }

  const activeCount = subscribers ? subscribers.filter((s) => s.is_active).length : 0;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Subscribers</h1>
          <p className={styles.subtitle}>
            {subscribers === null
              ? "Loading…"
              : `${activeCount} active subscriber${activeCount === 1 ? "" : "s"}`}
          </p>
        </div>
        {subscribers && subscribers.length > 0 && (
          <button
            type="button"
            className={styles.btnOutline}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>Failed to load: {error}</p>}

      {subscribers === null ? (
        <div className={styles.loadingRow}><Spinner size={18} /> Loading…</div>
      ) : subscribers.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>📬</span>
          <h2 className={styles.emptyTitle}>No subscribers yet</h2>
          <p className={styles.emptyDesc}>
            Add an email signup form to your storefront to start building your list.
            Visitors can also subscribe during checkout.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Subscribed</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((sub) => (
                <tr key={sub.id} className={styles.row}>
                  <td className={styles.td}>{sub.email}</td>
                  <td className={styles.td}>{sub.first_name || <span className={styles.empty}>—</span>}</td>
                  <td className={styles.td}>
                    {new Date(sub.subscribed_at).toLocaleDateString(undefined, {
                      year: "numeric", month: "short", day: "numeric"
                    })}
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.statusPill} ${sub.is_active ? styles.active : styles.inactive}`}>
                      {sub.is_active ? "Active" : "Unsubscribed"}
                    </span>
                  </td>
                  <td className={styles.tdActions}>
                    <button
                      type="button"
                      className={`${styles.btnSmall} ${styles.btnDanger}`}
                      onClick={() => handleDelete(sub)}
                      disabled={deletingId === sub.id}
                    >
                      {deletingId === sub.id ? "…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
