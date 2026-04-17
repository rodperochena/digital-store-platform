"use strict";

import { useEffect, useState, useRef, useCallback } from "react";
import { Outlet, Navigate, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useOwner } from "../context/OwnerContext";
import { ownerLogout, getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from "../api/owner";
import { timeAgo } from "../utils/time";
import styles from "./OwnerLayout.module.css";

const TYPE_ICON = {
  sale:              "💰",
  delivery_sent:     "📧",
  delivery_opened:   "✅",
  delivery_failed:   "❌",
  delivery_expired:  "⏰",
  product_milestone: "🎉",
  system:            "ℹ️",
};

const TYPE_NAV = {
  sale:              "/owner/orders",
  delivery_sent:     "/owner/orders",
  delivery_opened:   "/owner/orders",
  delivery_failed:   "/owner/orders",
  delivery_expired:  "/owner/orders",
  product_milestone: "/owner/products",
  system:            null,
};

const NAV_ITEMS = [
  { to: "/owner/dashboard",         icon: "🏠", label: "Home" },
  { to: "/owner/analytics",         icon: "📊", label: "Analytics" },
  { to: "/owner/products",          icon: "📦", label: "Products" },
  { to: "/owner/orders",            icon: "🛍️", label: "Orders" },
  { to: "/owner/customers",         icon: "👥", label: "Customers" },
  // DEMO: temporarily hidden for presentation — restore after demo
  // { to: "/owner/discounts",         icon: "🏷️", label: "Discounts" },
  // { to: "/owner/sales",             icon: "💰", label: "Sales" },
  // { to: "/owner/reviews",           icon: "⭐", label: "Reviews" },
  // { to: "/owner/subscribers",       icon: "📩", label: "Subscribers" },
  // { to: "/owner/email-updates",     icon: "✉️", label: "Email Updates" },
  // { to: "/owner/storefront-editor", icon: "🎨", label: "Storefront" },
  // { to: "/owner/blog",              icon: "📝", label: "Blog" },
  { to: "/owner/settings",          icon: "⚙️", label: "Settings" },
];

function navClass({ isActive }) {
  return `${styles.navItem} ${isActive ? styles.navItemActive : ""}`;
}

const AVATAR_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];
function getAvatarBg(initial) {
  return AVATAR_COLORS[initial.toUpperCase().charCodeAt(0) % AVATAR_COLORS.length];
}

export default function OwnerLayout() {
  const { ownerStore, onboardingDone, sessionStatus, clearOwnerSession, ownerCtx } = useOwner();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Notification bell state
  const [unreadCount, setUnreadCount]     = useState(0);
  const [bellOpen, setBellOpen]           = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading]   = useState(false);
  const bellRef = useRef(null);

  // Account dropdown state
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  // Poll unread count every 60 seconds
  const fetchUnreadCount = useCallback(() => {
    if (!ownerCtx.sessionToken) return;
    getUnreadCount(ownerCtx).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [ownerCtx.sessionToken, ownerCtx.apiBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    if (!bellOpen) return;
    function onClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [bellOpen]);

  // Close account dropdown when clicking outside
  useEffect(() => {
    if (!accountOpen) return;
    function onClick(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [accountOpen]);

  async function openBell() {
    if (bellOpen) { setBellOpen(false); return; }
    setBellOpen(true);
    setNotifLoading(true);
    try {
      const d = await getNotifications(ownerCtx, { limit: 15 });
      setNotifications(d.notifications ?? []);
      setUnreadCount(d.unread_count ?? 0);
    } catch {
      // ignore
    } finally {
      setNotifLoading(false);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(ownerCtx).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function handleNotifClick(n) {
    if (!n.is_read) {
      markNotificationRead(ownerCtx, n.id).catch(() => {});
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    const dest = TYPE_NAV[n.type];
    if (dest) { setBellOpen(false); navigate(dest); }
  }

  useEffect(() => {
    if (sessionStatus === "invalid") {
      clearOwnerSession();
      navigate("/owner/login?expired=1", { replace: true });
    }
  }, [sessionStatus, clearOwnerSession, navigate]);

  if (!ownerStore) {
    return <Navigate to="/owner/login" replace />;
  }

  if (!onboardingDone && pathname !== "/owner/onboarding") {
    return <Navigate to="/owner/onboarding" replace />;
  }

  function handleLogout() {
    ownerLogout(ownerCtx).catch(() => {});
    clearOwnerSession();
    navigate("/owner/login");
  }

  const accentColor = ownerStore.primary_color || "#0d6efd";
  const initial     = (ownerStore.name || "S").charAt(0).toUpperCase();
  const avatarBg    = getAvatarBg(initial);

  return (
    <div className={styles.shell}>

      {/* ── Top bar — full-width, first child of shell ─────── */}
      <header className={styles.topBar}>

        {/* Left: platform branding */}
        <div className={styles.topBarBranding}>
          <span className={styles.topBarPlatformName}>Digital Store Platform</span>
          <span className={styles.topBarStoreName}>{ownerStore.name || "My Store"}</span>
        </div>

        {/* Center: search (fills remaining space) */}
        <div className={styles.topBarSearch}>
          <span className={styles.topBarSearchIcon}>🔍</span>
          <input
            type="search"
            className={styles.topBarSearchInput}
            placeholder="Search products, orders, customers..."
          />
        </div>

        {/* Right: bell + account */}
        <div className={styles.topBarRight}>

          {/* Notification bell */}
          {onboardingDone && (
            <div className={styles.bellWrap} ref={bellRef}>
              <button
                type="button"
                className={styles.topBarBellBtn}
                onClick={openBell}
                aria-label="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span className={styles.topBarBellBadge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>

              {bellOpen && (
                <div className={styles.bellDropdown}>
                  <div className={styles.bellDropHeader}>
                    <span className={styles.bellDropTitle}>Notifications</span>
                    {unreadCount > 0 && (
                      <button type="button" className={styles.markAllBtn} onClick={handleMarkAllRead}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className={styles.bellDropBody}>
                    {notifLoading ? (
                      <div className={styles.bellEmpty}>Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className={styles.bellEmpty}>No notifications yet</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`${styles.notifRow} ${!n.is_read ? styles.notifUnread : ""}`}
                          onClick={() => handleNotifClick(n)}
                        >
                          <span className={styles.notifIcon}>{TYPE_ICON[n.type] ?? "ℹ️"}</span>
                          <div className={styles.notifContent}>
                            <span className={styles.notifTitle}>{n.title}</span>
                            {n.body && <span className={styles.notifBody}>{n.body}</span>}
                            <span className={styles.notifTime}>{timeAgo(n.created_at)}</span>
                          </div>
                          {!n.is_read && <span className={styles.notifDot} />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Account avatar + dropdown */}
          <div className={styles.accountWrap} ref={accountRef}>
            <button
              type="button"
              className={styles.accountAvatar}
              style={{ background: avatarBg }}
              onClick={() => setAccountOpen((o) => !o)}
              aria-label="Account menu"
            >
              {initial}
            </button>
            {accountOpen && (
              <div className={styles.accountDropdown}>
                <button
                  type="button"
                  className={styles.accountDropItem}
                  onClick={() => { setAccountOpen(false); navigate("/owner/settings"); }}
                >
                  ⚙️ Settings
                </button>
                <div className={styles.accountDropSep} />
                <button
                  type="button"
                  className={`${styles.accountDropItem} ${styles.accountDropItemDanger}`}
                  onClick={() => { setAccountOpen(false); handleLogout(); }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ── Body row: sidebar + page content ───────────────── */}
      <div className={styles.body}>

        {/* Sidebar */}
        <aside className={styles.sidebar} style={{ borderRightColor: accentColor }}>

          <nav className={styles.sidebarNav}>
            {onboardingDone ? (
              NAV_ITEMS.map(({ to, icon, label }) => (
                <NavLink key={to} to={to} className={navClass}>
                  <span className={styles.navIcon}>{icon}</span>
                  <span>{label}</span>
                </NavLink>
              ))
            ) : (
              <span className={styles.setupLabel}>Store Setup</span>
            )}
          </nav>

          <div className={styles.sidebarFooter}>
            {onboardingDone && (
              <>
                <Link
                  to="/owner/storefront-editor"
                  className={styles.editStorefrontBtn}
                  style={{ background: accentColor }}
                >
                  ✏️ Edit Storefront
                </Link>
                {ownerStore.slug && (
                  <a
                    href={`/store/${encodeURIComponent(ownerStore.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.viewStoreLink}
                  >
                    View Store ↗
                  </a>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Page content */}
        <main className={styles.mainContent}>
          <Outlet />
        </main>

      </div>
    </div>
  );
}
