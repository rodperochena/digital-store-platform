import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useApp } from "../context/AppContext";
import styles from "./AdminLayout.module.css";

export default function AdminLayout() {
  const { adminKey, activeStore } = useApp();

  if (!adminKey) {
    return <Navigate to="/admin/connect" replace />;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>Digital Store Admin</span>

          <nav className={styles.nav}>
            <NavLink
              to="/admin/connect"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              Connection
            </NavLink>
            <NavLink
              to="/admin/store"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              Store
            </NavLink>
            <NavLink
              to="/admin/products"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              Products
            </NavLink>
            <NavLink
              to="/admin/orders"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              Orders
            </NavLink>
          </nav>

          {activeStore && (
            <span className={styles.storePill}>
              <span className={styles.storePillLabel}>{activeStore.name}</span>
              {" "}· {activeStore.slug}
            </span>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
