import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useBuyer } from "../../context/BuyerContext";
import { getBuyerOrders, updateBuyerProfile, buyerChangePassword } from "../../api/buyer";
import styles from "./BuyerDashboard.module.css";

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function BuyerDashboard() {
  const { slug }                          = useParams();
  const navigate                          = useNavigate();
  const { token, buyer, isLoggedIn, loading: sessionLoading, logout, updateBuyer } = useBuyer();

  const [orders,        setOrders]        = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Profile form state
  const [displayName,    setDisplayName]    = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [profileSaving,  setProfileSaving]  = useState(false);
  const [profileMsg,     setProfileMsg]     = useState(null);

  // Password form state
  const [currentPass,  setCurrentPass]  = useState("");
  const [newPass,      setNewPass]      = useState("");
  const [confirmPass,  setConfirmPass]  = useState("");
  const [passChanging, setPassChanging] = useState(false);
  const [passMsg,      setPassMsg]      = useState(null);

  // Redirect if not logged in (only after session validation is complete)
  useEffect(() => {
    if (!sessionLoading && !isLoggedIn) {
      navigate(`/store/${slug}/login`, { replace: true });
    }
  }, [isLoggedIn, sessionLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate profile form from context
  useEffect(() => {
    if (buyer) {
      setDisplayName(buyer.display_name || "");
      setMarketingOptIn(!!buyer.marketing_opt_in);
    }
  }, [buyer]);

  // Fetch orders
  useEffect(() => {
    if (!token) return;
    setOrdersLoading(true);
    getBuyerOrders(token)
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [token]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await updateBuyerProfile(token, {
        display_name:     displayName || null,
        marketing_opt_in: marketingOptIn,
      });
      updateBuyer({ display_name: displayName, marketing_opt_in: marketingOptIn });
      setProfileMsg({ type: "ok", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({ type: "err", text: err.message });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPassMsg(null);

    if (newPass !== confirmPass) {
      setPassMsg({ type: "err", text: "Passwords do not match." });
      return;
    }
    if (newPass.length < 8) {
      setPassMsg({ type: "err", text: "New password must be at least 8 characters." });
      return;
    }

    setPassChanging(true);
    try {
      await buyerChangePassword(token, currentPass, newPass);
      setPassMsg({ type: "ok", text: "Password updated successfully." });
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      setPassMsg({ type: "err", text: err.message });
    } finally {
      setPassChanging(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate(`/store/${slug}`);
  }

  if (sessionLoading || !isLoggedIn) return null; // validating session or being redirected

  const greeting = buyer?.display_name || buyer?.email?.split("@")[0] || "there";

  return (
    <div className={styles.page}>
      {/* Top nav */}
      <div className={styles.topNav}>
        <Link to={`/store/${slug}`} className={styles.backToStore}>
          ← Back to store
        </Link>
        <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>My Account</h1>
          <p className={styles.pageEmail}>{buyer?.email}</p>
        </div>

        {/* ── My Purchases ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Purchases</h2>

          {ordersLoading ? (
            <p className={styles.loadingText}>Loading orders…</p>
          ) : orders.length === 0 ? (
            <div className={styles.emptyOrders}>
              <p>No purchases yet.</p>
              <Link to={`/store/${slug}`} className={styles.browseLink}>
                Browse the store →
              </Link>
            </div>
          ) : (
            <div className={styles.orderList}>
              {orders.map((order) => (
                <div key={order.id} className={styles.orderCard}>
                  <div className={styles.orderHeader}>
                    <div className={styles.orderMeta}>
                      <span className={styles.orderDate}>
                        Purchased {formatDate(order.created_at)}
                      </span>
                      <span
                        className={
                          order.status === "paid"
                            ? styles.statusPaid
                            : styles.statusPending
                        }
                      >
                        {order.status}
                      </span>
                    </div>
                    <span className={styles.orderTotal}>
                      {formatPrice(order.total_cents, order.currency)}
                    </span>
                  </div>

                  <div className={styles.orderItems}>
                    {(order.items || []).map((item, i) => (
                      <div key={i} className={styles.orderItem}>
                        <span className={styles.itemIcon}>📦</span>
                        <span className={styles.itemTitle}>{item.title}</span>
                        {item.quantity > 1 && (
                          <span className={styles.itemQty}>×{item.quantity}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.status === "paid" && (
                    <p className={styles.downloadHint}>
                      Download link was sent to your email. Can&apos;t find it?{" "}
                      <a
                        href={`mailto:?subject=Resend download for order ${order.id.slice(0, 8)}`}
                        className={styles.downloadContact}
                      >
                        Contact the store owner
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Profile Settings ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Profile Settings</h2>

          <form className={styles.profileForm} onSubmit={handleSaveProfile}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                type="text"
                className={styles.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
              />
              <span>Keep me updated on new products and special offers</span>
            </label>

            {profileMsg && (
              <p className={profileMsg.type === "ok" ? styles.successMsg : styles.errorMsg}>
                {profileMsg.text}
              </p>
            )}

            <button type="submit" className={styles.saveBtn} disabled={profileSaving}>
              {profileSaving ? "Saving…" : "Save"}
            </button>
          </form>

          {/* Change Password */}
          <div className={styles.divider} />
          <h3 className={styles.subsectionTitle}>Change Password</h3>

          <form className={styles.profileForm} onSubmit={handleChangePassword}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currentPass">Current password</label>
              <input
                id="currentPass"
                type="password"
                className={styles.input}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="newPass">New password</label>
              <input
                id="newPass"
                type="password"
                className={styles.input}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirmPassField">Confirm new password</label>
              <input
                id="confirmPassField"
                type="password"
                className={styles.input}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            {passMsg && (
              <p className={passMsg.type === "ok" ? styles.successMsg : styles.errorMsg}>
                {passMsg.text}
              </p>
            )}

            <button
              type="submit"
              className={styles.saveBtn}
              disabled={passChanging || !currentPass || !newPass || !confirmPass}
            >
              {passChanging ? "Updating…" : "Change Password"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
