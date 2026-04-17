import { Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { Component } from "react";

class StorefrontErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "40px", fontFamily: "monospace", color: "#dc2626" }}>
          <strong>Storefront Error:</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: "12px", fontSize: "13px" }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Internal admin tool
import AdminLayout from "./layout/AdminLayout";
import Connect from "./pages/Connect";
import StorePage from "./pages/StorePage";
import ProductsPage from "./pages/ProductsPage";
import OrdersPage from "./pages/OrdersPage";

// Dev simulation pages (outside all layouts)
import GetStarted from "./pages/GetStarted";
import Storefront from "./pages/Storefront";
import ProductDetail from "./pages/ProductDetail";
import ProductPage from "./pages/ProductPage";
import CheckoutSuccess from "./pages/CheckoutSuccess";
// DEMO: temporary checkout page — will be replaced with Stripe Checkout later
import CheckoutPage from "./pages/CheckoutPage";
import ReviewSubmit from "./pages/ReviewSubmit";
import Unsubscribe from "./pages/Unsubscribe";
import BlogListing from "./pages/BlogListing";
import BlogPost from "./pages/BlogPost";

// Buyer-facing pages
import { BuyerProvider } from "./context/BuyerContext";
import BuyerLogin from "./pages/buyer/BuyerLogin";
import BuyerRegister from "./pages/buyer/BuyerRegister";
import BuyerDashboard from "./pages/buyer/BuyerDashboard";
import BuyerForgotPassword from "./pages/buyer/BuyerForgotPassword";
import BuyerResetPassword from "./pages/buyer/BuyerResetPassword";

// Owner-facing admin
import OwnerLayout from "./layout/OwnerLayout";
import OwnerLogin from "./pages/owner/OwnerLogin";
import ClaimAccess from "./pages/owner/ClaimAccess";
import Onboarding from "./pages/owner/Onboarding";
import OwnerDashboard from "./pages/owner/DashboardLegacy";
import OwnerHome from "./pages/owner/Home";
import OwnerSettings from "./pages/owner/Settings";
import OwnerProducts from "./pages/owner/Products";
import OwnerOrders from "./pages/owner/Orders";
import Analytics from "./pages/owner/Analytics";
import ProductCreator from "./pages/owner/ProductCreator";
import StorefrontEditor from "./pages/owner/StorefrontEditor";
import Discounts from "./pages/owner/Discounts";
import Customers from "./pages/owner/Customers";
import ForgotPassword from "./pages/owner/ForgotPassword";
import ResetPassword from "./pages/owner/ResetPassword";
import Reviews from "./pages/owner/Reviews";
import Sales from "./pages/owner/Sales";
import Subscribers from "./pages/owner/Subscribers";
import BlogPosts from "./pages/owner/BlogPosts";
import BlogEditor from "./pages/owner/BlogEditor";
import EmailCampaigns from "./pages/owner/EmailCampaigns";
import EmailComposer from "./pages/owner/EmailComposer";

import { CartProvider } from "./context/CartContext";

// Wraps all /store/:slug/* routes so BuyerContext and CartContext are available to every child
function BuyerProviderWrapper() {
  const { slug } = useParams();
  return (
    <BuyerProvider storeSlug={slug}>
      <CartProvider storeSlug={slug}>
        <Outlet />
      </CartProvider>
    </BuyerProvider>
  );
}

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

      {/* ── Storefront + buyer account — share BuyerProvider via wrapper ── */}
      <Route path="/store/:slug" element={<StorefrontErrorBoundary><BuyerProviderWrapper /></StorefrontErrorBoundary>}>
        <Route index element={<Storefront />} />
        <Route path="product/:productId" element={<ProductPage />} />
        {/* Blog — /blog must come before /blog/:postSlug */}
        <Route path="blog" element={<BlogListing />} />
        <Route path="blog/:postSlug" element={<BlogPost />} />
        {/* Buyer auth + account */}
        <Route path="login" element={<BuyerLogin />} />
        <Route path="register" element={<BuyerRegister />} />
        <Route path="account" element={<BuyerDashboard />} />
        <Route path="forgot-password" element={<BuyerForgotPassword />} />
        <Route path="reset-password" element={<BuyerResetPassword />} />
        {/* DEMO: temporary checkout page — replace with Stripe flow later */}
        <Route path="checkout" element={<CheckoutPage />} />
      </Route>

      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/review/:token" element={<ReviewSubmit />} />
      <Route path="/unsubscribe/:token" element={<Unsubscribe />} />

      {/* ── Owner-facing admin (/owner/*) ── */}
      <Route path="/owner" element={<Navigate to="/owner/login" replace />} />
      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route path="/owner/claim-access" element={<ClaimAccess />} />
      <Route path="/owner/forgot-password" element={<ForgotPassword />} />
      <Route path="/owner/reset-password" element={<ResetPassword />} />
      <Route element={<OwnerLayout />}>
        <Route path="/owner/onboarding" element={<Onboarding />} />
        <Route path="/owner/dashboard" element={<OwnerHome />} />
        <Route path="/owner/settings" element={<OwnerSettings />} />
        <Route path="/owner/products" element={<OwnerProducts />} />
        <Route path="/owner/products/new" element={<ProductCreator />} />
        <Route path="/owner/products/:id/edit" element={<ProductCreator />} />
        <Route path="/owner/orders" element={<OwnerOrders />} />
        <Route path="/owner/analytics" element={<Analytics />} />
        <Route path="/owner/customers" element={<Customers />} />
        <Route path="/owner/discounts" element={<Discounts />} />
        <Route path="/owner/storefront-editor" element={<StorefrontEditor />} />
        <Route path="/owner/reviews" element={<Reviews />} />
        <Route path="/owner/sales" element={<Sales />} />
        <Route path="/owner/subscribers" element={<Subscribers />} />
        {/* Blog — /new must come before /:id/edit in case RR matches "new" as UUID */}
        <Route path="/owner/blog" element={<BlogPosts />} />
        <Route path="/owner/blog/new" element={<BlogEditor />} />
        <Route path="/owner/blog/:id/edit" element={<BlogEditor />} />
        {/* Email campaigns — /new must come before /:id/edit */}
        <Route path="/owner/email-updates" element={<EmailCampaigns />} />
        <Route path="/owner/email-updates/new" element={<EmailComposer />} />
        <Route path="/owner/email-updates/:id/edit" element={<EmailComposer />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin/connect" replace />} />
    </Routes>
  );
}
