import { useEffect } from "react";
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useOwner } from "../context/OwnerContext";
import { ownerLogout } from "../api/owner";
import styles from "./OwnerLayout.module.css";

function navClass({ isActive }) {
  return `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`;
}

export default function OwnerLayout() {
  const { ownerStore, onboardingDone, sessionStatus, clearOwnerSession, ownerCtx } = useOwner();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
  const initial = (ownerStore.name || "S").charAt(0).toUpperCase();

  return (
    <div className={styles.shell}>
      <header className={styles.header} style={{ borderTopColor: accentColor }}>
        <div className={styles.headerInner}>
          <div className={styles.brandArea}>
            {ownerStore.logo_url ? (
              <img
                src={ownerStore.logo_url}
                alt=""
                className={styles.brandLogo}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <span
                className={styles.brandInitial}
                style={{ background: accentColor }}
              >
                {initial}
              </span>
            )}
            <span className={styles.brand}>{ownerStore.name}</span>
          </div>

          <nav className={styles.nav}>
            {onboardingDone ? (
              <>
                <NavLink to="/owner/dashboard" className={navClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/owner/settings" className={navClass}>
                  Settings
                </NavLink>
                <NavLink to="/owner/products" className={navClass}>
                  Products
                </NavLink>
                <NavLink to="/owner/orders" className={navClass}>
                  Orders
                </NavLink>
              </>
            ) : (
              <span className={styles.setupLabel}>Store Setup</span>
            )}
          </nav>

          <div className={styles.right}>
            {ownerStore.slug && onboardingDone && (
              <a
                href={`/store/${encodeURIComponent(ownerStore.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.storefrontLink}
              >
                View storefront ↗
              </a>
            )}
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
