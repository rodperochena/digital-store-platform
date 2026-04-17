"use strict";
// DEMO: Checkout button navigates to /store/:slug/checkout instead of calling Stripe.
// Replace with Stripe checkout flow after the demo.

import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import styles from "./CartDrawer.module.css";

function formatPrice(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "usd",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function CartDrawer({ isOpen, onClose, slug, accentColor }) {
  const { items, removeItem, updateQuantity, subtotalCents } = useCart() || {};
  const navigate = useNavigate();

  const safeItems    = items || [];
  const safeSubtotal = subtotalCents || 0;
  const primaryCurrency = safeItems[0]?.currency || "usd";

  function handleCheckout() {
    onClose();
    navigate(`/store/${encodeURIComponent(slug)}/checkout`);
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className={styles.overlay} onClick={onClose} />}

      {/* Drawer panel — always in DOM for transition */}
      <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`} aria-hidden={!isOpen}>

        {/* Header */}
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>Cart</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </div>

        {/* Item list */}
        <div className={styles.itemList}>
          {safeItems.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>Your cart is empty</p>
              <button type="button" className={styles.continueBtn} onClick={onClose}>
                Continue shopping
              </button>
            </div>
          ) : (
            safeItems.map((item) => (
              <div key={item.productId} className={styles.item}>
                <div className={styles.itemImgWrap}>
                  {item.image_url ? (
                    <img
                      src={String(item.image_url)}
                      alt={String(item.title)}
                      className={styles.itemImg}
                    />
                  ) : (
                    <div className={styles.itemImgPlaceholder}>📦</div>
                  )}
                </div>
                <div className={styles.itemInfo}>
                  <p className={styles.itemTitle}>{String(item.title)}</p>
                  <p className={styles.itemPrice} style={{ color: accentColor }}>
                    {formatPrice(item.price_cents * item.quantity, item.currency)}
                  </p>
                  <div className={styles.quantityRow}>
                    <div className={styles.quantityControls}>
                      <button
                        type="button"
                        className={styles.qtyBtn}
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className={styles.qtyNum}>{item.quantity}</span>
                      <button
                        type="button"
                        className={styles.qtyBtn}
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeItem(item.productId)}
                      aria-label="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer — only visible when cart has items */}
        {safeItems.length > 0 && (
          <div className={styles.drawerFooter}>
            <div className={styles.subtotalRow}>
              <span className={styles.subtotalLabel}>Subtotal</span>
              <span className={styles.subtotalAmount}>
                {formatPrice(safeSubtotal, primaryCurrency)}
              </span>
            </div>

            <button
              type="button"
              className={styles.checkoutBtn}
              style={{ background: accentColor }}
              onClick={handleCheckout}
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
