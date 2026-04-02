import { Routes, Route, Navigate } from "react-router-dom";

// Internal admin tool
import AdminLayout from "./layout/AdminLayout";
import Connect from "./pages/Connect";
import StorePage from "./pages/StorePage";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";

// Dev simulation pages (outside all layouts)
import GetStarted from "./pages/GetStarted";
import Storefront from "./pages/Storefront";
import CheckoutSuccess from "./pages/CheckoutSuccess";

// Owner-facing admin
import OwnerLayout from "./layout/OwnerLayout";
import OwnerLogin from "./pages/owner/OwnerLogin";
import ClaimAccess from "./pages/owner/ClaimAccess";
import Onboarding from "./pages/owner/Onboarding";
import OwnerDashboard from "./pages/owner/Dashboard";
import OwnerSettings from "./pages/owner/Settings";
import OwnerProducts from "./pages/owner/Products";
import OwnerOrders from "./pages/owner/Orders";

export default function App() {
  return (
    <Routes>
      {/* Default: internal tool */}
      <Route path="/" element={<Navigate to="/admin/connect" replace />} />

      {/* ── Internal provisioning tool (/admin/*) ── */}
      <Route path="/admin/connect" element={<Connect />} />
      <Route element={<AdminLayout />}>
        <Route path="/admin/store" element={<StorePage />} />
        <Route path="/admin/products" element={<ProductsPage />} />
        <Route path="/admin/orders" element={<OrdersPage />} />
      </Route>

      {/* ── Dev / public pages (outside layouts) ── */}
      <Route path="/get-started" element={<GetStarted />} />
      <Route path="/simulate-purchase" element={<Navigate to="/get-started" replace />} />
      <Route path="/store/:slug" element={<Storefront />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />

      {/* ── Owner-facing admin (/owner/*) ── */}
      <Route path="/owner" element={<Navigate to="/owner/login" replace />} />
      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route path="/owner/claim-access" element={<ClaimAccess />} />
      <Route element={<OwnerLayout />}>
        <Route path="/owner/onboarding" element={<Onboarding />} />
        <Route path="/owner/dashboard" element={<OwnerDashboard />} />
        <Route path="/owner/settings" element={<OwnerSettings />} />
        <Route path="/owner/products" element={<OwnerProducts />} />
        <Route path="/owner/orders" element={<OwnerOrders />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin/connect" replace />} />
    </Routes>
  );
}
