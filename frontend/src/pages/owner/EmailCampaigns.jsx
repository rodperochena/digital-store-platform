import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOwner } from "../../context/OwnerContext";
import {
  listCampaigns, deleteCampaign, sendCampaign, duplicateCampaign, getCampaignStats,
} from "../../api/owner";
import styles from "./EmailCampaigns.module.css";

const STATUS_LABEL = {
  draft:   { label: "Draft",   cls: "draft"   },
  sending: { label: "Sending", cls: "sending" },
  sent:    { label: "Sent",    cls: "sent"    },
  failed:  { label: "Failed",  cls: "failed"  },
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StatsBadge({ c }) {
  if (c.status !== "sent") return null;
  const rate = c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0;
  return (
    <span className={styles.statsBadge}>
      {c.sent_count} sent · {rate}% open
    </span>
  );
}

export default function EmailCampaigns() {
  const { ownerCtx } = useOwner();
  const navigate = useNavigate();

  const [campaigns, setCampaigns]     = useState([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [actionId, setActionId]       = useState(null); // campaign id being acted on
  const [statsId, setStatsId]         = useState(null); // open stats modal
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCampaigns(ownerCtx, { limit: 50, offset: 0 });
      setCampaigns(data.campaigns ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleSend(campaign) {
    if (!confirm(`Send "${campaign.subject}" to all active subscribers?`)) return;
    setActionId(campaign.id);
    try {
      await sendCampaign(ownerCtx, campaign.id);
      await load();
    } catch (err) {
      alert(err.message || "Failed to send campaign.");
    } finally {
      setActionId(null);
    }
  }

  async function handleDuplicate(campaign) {
    setActionId(campaign.id);
    try {
      await duplicateCampaign(ownerCtx, campaign.id);
      await load();
    } catch (err) {
      alert(err.message || "Failed to duplicate campaign.");
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(campaign) {
    if (!confirm(`Delete "${campaign.subject}"? This cannot be undone.`)) return;
    setActionId(campaign.id);
    try {
      await deleteCampaign(ownerCtx, campaign.id);
      await load();
    } catch (err) {
      alert(err.message || "Failed to delete campaign.");
    } finally {
      setActionId(null);
    }
  }

  async function openStats(campaign) {
    setStatsId(campaign.id);
    setStats(null);
    setStatsLoading(true);
    try {
      const data = await getCampaignStats(ownerCtx, campaign.id);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Email Updates</h1>
          <p className={styles.subtitle}>
            {total} campaign{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => navigate("/owner/email-updates/new")}
        >
          + New Campaign
        </button>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {loading ? (
        <p className={styles.loadingRow}>Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEmoji}>📧</span>
          <p className={styles.emptyTitle}>No campaigns yet</p>
          <p className={styles.emptyDesc}>
            Create your first campaign to send an email update to all your subscribers.
          </p>
          <button
            className={styles.btnPrimary}
            style={{ marginTop: "1rem" }}
            onClick={() => navigate("/owner/email-updates/new")}
          >
            Create campaign
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Subject</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Recipients</th>
                <th className={styles.th}>Sent</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const busy = actionId === c.id;
                const { label, cls } = STATUS_LABEL[c.status] ?? { label: c.status, cls: "draft" };
                return (
                  <tr key={c.id} className={styles.row}>
                    <td className={styles.td}>
                      <span className={styles.subject}>{c.subject}</span>
                      <StatsBadge c={c} />
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.statusPill} ${styles[cls]}`}>{label}</span>
                    </td>
                    <td className={styles.td}>{c.recipient_count > 0 ? c.recipient_count : "—"}</td>
                    <td className={styles.td}>{fmtDate(c.sent_at)}</td>
                    <td className={styles.tdActions}>
                      <div className={styles.actions}>
                        {c.status === "draft" && (
                          <>
                            <button
                              className={styles.btnSmall}
                              disabled={busy}
                              onClick={() => navigate(`/owner/email-updates/${c.id}/edit`)}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btnSmall} ${styles.btnSend}`}
                              disabled={busy}
                              onClick={() => handleSend(c)}
                            >
                              {busy ? "Sending…" : "Send"}
                            </button>
                          </>
                        )}
                        {c.status === "sent" && (
                          <button
                            className={styles.btnSmall}
                            disabled={busy}
                            onClick={() => openStats(c)}
                          >
                            Stats
                          </button>
                        )}
                        <button
                          className={styles.btnSmall}
                          disabled={busy}
                          onClick={() => handleDuplicate(c)}
                        >
                          Duplicate
                        </button>
                        {["draft", "failed"].includes(c.status) && (
                          <button
                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                            disabled={busy}
                            onClick={() => handleDelete(c)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats modal */}
      {statsId && (
        <div className={styles.modalOverlay} onClick={() => setStatsId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Campaign Stats</h2>
              <button className={styles.modalClose} onClick={() => setStatsId(null)}>✕</button>
            </div>
            {statsLoading ? (
              <p className={styles.loadingRow}>Loading…</p>
            ) : !stats ? (
              <p className={styles.errorMsg}>Failed to load stats.</p>
            ) : (
              <>
                <p className={styles.statsSubject}>{stats.subject}</p>
                <div className={styles.statsGrid}>
                  <div className={styles.statBox}>
                    <span className={styles.statNum}>{stats.recipient_count}</span>
                    <span className={styles.statLbl}>Recipients</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statNum}>{stats.sent_count}</span>
                    <span className={styles.statLbl}>Delivered</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statNum}>{stats.open_count}</span>
                    <span className={styles.statLbl}>Opens</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statNum}>{stats.open_rate ?? 0}%</span>
                    <span className={styles.statLbl}>Open Rate</span>
                  </div>
                  <div className={styles.statBox}>
                    <span className={styles.statNum}>{stats.failed_count}</span>
                    <span className={styles.statLbl}>Failed</span>
                  </div>
                </div>
                {stats.recipients && stats.recipients.length > 0 && (
                  <div className={styles.recipientsWrap}>
                    <p className={styles.recipientsTitle}>Recipient Details</p>
                    <div className={styles.recipientsScroll}>
                      <table className={styles.recipientTable}>
                        <thead>
                          <tr>
                            <th className={styles.rth}>Email</th>
                            <th className={styles.rth}>Status</th>
                            <th className={styles.rth}>Opened</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.recipients.map((r, i) => (
                            <tr key={i} className={styles.rrow}>
                              <td className={styles.rtd}>{r.email}</td>
                              <td className={styles.rtd}>{r.status}</td>
                              <td className={styles.rtd}>{r.opened_at ? fmtDate(r.opened_at) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
