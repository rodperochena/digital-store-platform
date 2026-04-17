"use strict";

// Queries: products
// Full CRUD plus bulk operations for store products.
// Key constraint: currency is inherited from the store — products cannot have a different currency.
// Soft-delete (deactivate) is used when a product has order history; hard-delete otherwise.

const { pool } = require("../pool");

const PRODUCT_FIELDS = `
  id, store_id, title, description, short_description, price_cents, currency, is_active,
  delivery_url, image_url, sales_count,
  product_type, product_category, product_tags, visibility,
  video_url, file_size_display,
  delivery_file_key, delivery_file_size_bytes, delivery_file_name,
  image_urls, pricing_type, minimum_price_cents,
  seo_title, seo_description, slug, cta_text,
  created_at, updated_at
`;

/**
 * Creates a product for a store.
 * - Enforces ONE currency per store (product currency must match store currency).
 * - If store doesn't exist, returns a clean 404 error (instead of FK 500).
 */
async function createProduct(
  storeId,
  {
    title, description, short_description, price_cents, currency, is_active, delivery_url, image_url,
    product_type, product_category, product_tags, visibility, video_url, file_size_display,
    delivery_file_key, delivery_file_size_bytes, delivery_file_name,
    image_urls, pricing_type, minimum_price_cents,
    seo_title, seo_description, slug, cta_text,
  }
) {
  // Always load store currency (DB is source of truth)
  const storeRes = await pool.query(
    `SELECT currency FROM stores WHERE id = $1 LIMIT 1;`,
    [storeId]
  );

  const store = storeRes.rows[0] || null;
  if (!store) {
    const err = new Error("Store not found");
    err.statusCode = 404;
    throw err;
  }

  const storeCurrency = String(store.currency || "usd").toLowerCase();
  const providedCurrency = currency ? String(currency).toLowerCase() : null;

  if (providedCurrency && providedCurrency !== storeCurrency) {
    const err = new Error("Product currency must match store currency");
    err.statusCode = 400;
    throw err;
  }

  const resolvedVisibility = visibility ?? (is_active === false ? "draft" : "published");

  const sql = `
    INSERT INTO products (
      store_id, title, description, short_description, price_cents, currency, is_active, delivery_url, image_url,
      product_type, product_category, product_tags, visibility, video_url, file_size_display,
      delivery_file_key, delivery_file_size_bytes, delivery_file_name,
      image_urls, pricing_type, minimum_price_cents,
      seo_title, seo_description, slug, cta_text
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    RETURNING ${PRODUCT_FIELDS};
  `;

  const result = await pool.query(sql, [
    storeId,
    title,
    description ?? null,
    short_description ?? null,
    price_cents,
    storeCurrency,
    is_active ?? (resolvedVisibility !== "draft"),
    delivery_url ?? null,
    image_url ?? null,
    product_type ?? null,
    product_category ?? null,
    product_tags ?? [],
    resolvedVisibility,
    video_url ?? null,
    file_size_display ?? null,
    delivery_file_key ?? null,
    delivery_file_size_bytes ?? null,
    delivery_file_name ?? null,
    image_urls ?? [],
    pricing_type ?? "fixed",
    minimum_price_cents ?? 0,
    seo_title ?? null,
    seo_description ?? null,
    slug ?? null,
    cta_text ?? null,
  ]);

  return result.rows[0];
}

async function listProductsByStore(storeId) {
  const sql = `
    SELECT ${PRODUCT_FIELDS}
    FROM products
    WHERE store_id = $1
    ORDER BY created_at DESC;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows;
}

async function getProductById(storeId, productId) {
  const sql = `
    SELECT ${PRODUCT_FIELDS}
    FROM products
    WHERE store_id = $1 AND id = $2
    LIMIT 1;
  `;
  const result = await pool.query(sql, [storeId, productId]);
  return result.rows[0] ?? null;
}

/**
 * Products list enriched with sales stats (paid orders only).
 * Used by the owner dashboard Products tab.
 */
async function listProductsWithStats(storeId) {
  const sql = `
    SELECT
      p.id, p.store_id, p.title, p.description, p.price_cents, p.currency,
      p.is_active, p.delivery_url, p.delivery_file_key, p.image_url, p.sales_count,
      p.product_type, p.product_category, p.product_tags, p.visibility,
      p.video_url, p.file_size_display, p.pricing_type, p.minimum_price_cents,
      p.short_description,
      p.created_at, p.updated_at,
      COALESCE(SUM(oi.quantity), 0)::int                          AS order_sales_count,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue_cents,
      COALESCE(pv.view_count, 0)::int                             AS view_count
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN orders      o  ON o.id = oi.order_id
                             AND o.status   = 'paid'
                             AND o.store_id = $1
    LEFT JOIN (
      SELECT product_id, COUNT(*)::int AS view_count
      FROM page_views
      WHERE store_id = $1 AND product_id IS NOT NULL
      GROUP BY product_id
    ) pv ON pv.product_id = p.id
    WHERE p.store_id = $1
    GROUP BY p.id, p.store_id, p.title, p.description, p.price_cents,
             p.currency, p.is_active, p.delivery_url, p.delivery_file_key, p.image_url, p.sales_count,
             p.product_type, p.product_category, p.product_tags, p.visibility,
             p.video_url, p.file_size_display, p.pricing_type, p.minimum_price_cents,
             p.short_description,
             p.created_at, p.updated_at, pv.view_count
    ORDER BY p.created_at DESC;
  `;
  const result = await pool.query(sql, [storeId]);
  return result.rows.map((r) => ({
    ...r,
    sales_count:   Number(r.order_sales_count ?? r.sales_count ?? 0),
    revenue_cents: Number(r.revenue_cents),
  }));
}

/**
 * Updates a product. Only fields present in `updates` are changed.
 * Scoped to storeId — returns null if product not found or belongs to a different store.
 */
async function updateProduct(productId, storeId, updates) {
  const allowed = [
    "title", "description", "short_description", "price_cents", "delivery_url", "image_url", "is_active",
    "product_type", "product_category", "product_tags", "visibility", "video_url", "file_size_display",
    "delivery_file_key", "delivery_file_size_bytes", "delivery_file_name",
    "image_urls", "pricing_type", "minimum_price_cents",
    "seo_title", "seo_description", "slug", "cta_text",
  ];
  const setClauses = [];
  const values = [productId, storeId];
  let idx = 3;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = NOW()`);

  const sql = `
    UPDATE products
    SET ${setClauses.join(", ")}
    WHERE id = $1 AND store_id = $2
    RETURNING ${PRODUCT_FIELDS};
  `;

  const result = await pool.query(sql, values);
  return result.rows[0] ?? null;
}

/**
 * Deletes a product scoped to storeId.
 * - If the product has no order_items references: hard DELETE.
 * - If it has order references: soft-delete (set is_active = false + visibility = 'draft').
 * Returns { kind: "DELETED" | "DEACTIVATED" | "NOT_FOUND", product? }
 */
async function deleteProduct(productId, storeId) {
  const ownerCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND store_id = $2 LIMIT 1",
    [productId, storeId]
  );
  if (ownerCheck.rowCount === 0) return { kind: "NOT_FOUND" };

  const refCheck = await pool.query(
    "SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1",
    [productId]
  );

  if (refCheck.rowCount === 0) {
    await pool.query("DELETE FROM products WHERE id = $1 AND store_id = $2", [productId, storeId]);
    return { kind: "DELETED" };
  }

  const result = await pool.query(
    `UPDATE products
     SET is_active = false, visibility = 'draft', updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING ${PRODUCT_FIELDS}`,
    [productId, storeId]
  );
  return { kind: "DEACTIVATED", product: result.rows[0] };
}

async function duplicateProduct(productId, storeId) {
  const sql = `
    INSERT INTO products (
      store_id, title, description, price_cents, currency, is_active, delivery_url, image_url,
      product_type, product_category, product_tags, visibility, video_url, file_size_display, sort_order
    )
    SELECT
      store_id, title || ' (copy)', description, price_cents, currency, false, delivery_url, image_url,
      product_type, product_category, product_tags, 'draft', video_url, file_size_display,
      (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products WHERE store_id = $2)
    FROM products
    WHERE id = $1 AND store_id = $2
    RETURNING ${PRODUCT_FIELDS};
  `;
  const result = await pool.query(sql, [productId, storeId]);
  return result.rows[0] ?? null;
}

/**
 * Reorder products for a store.
 * `order` is an array of { id, sort_order } objects.
 * All products must belong to the given storeId.
 */
async function reorderProducts(storeId, order) {
  if (!order || order.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { id, sort_order } of order) {
      await client.query(
        `UPDATE products SET sort_order = $3, updated_at = NOW()
         WHERE id = $1 AND store_id = $2`,
        [id, storeId, sort_order]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bulk-update a set of product IDs for a store.
 * Supports `visibility` and `price_cents` fields.
 */
async function bulkUpdateProducts(storeId, productIds, updates) {
  const allowed = ["visibility", "price_cents"];
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
  }
  if (setClauses.length === 0) throw Object.assign(new Error("No valid update fields"), { statusCode: 400 });
  setClauses.push(`updated_at = NOW()`);

  values.push(productIds, storeId);
  const sql = `
    UPDATE products
    SET ${setClauses.join(", ")}
    WHERE id = ANY($${idx}::uuid[]) AND store_id = $${idx + 1}
    RETURNING id
  `;
  const result = await pool.query(sql, values);
  return { updated: result.rowCount };
}

/**
 * Bulk-delete products for a store.
 * Products with order history are soft-deactivated; others are hard-deleted.
 * Returns { deleted, deactivated }.
 */
async function bulkDeleteProducts(storeId, productIds) {
  // Verify ownership first
  const owned = await pool.query(
    `SELECT id FROM products WHERE id = ANY($1::uuid[]) AND store_id = $2`,
    [productIds, storeId]
  );
  const verifiedIds = owned.rows.map((r) => r.id);
  if (verifiedIds.length === 0) return { deleted: 0, deactivated: 0 };

  // Soft-deactivate products referenced by order_items
  const deactivateRes = await pool.query(
    `UPDATE products
     SET is_active = false, visibility = 'draft', updated_at = NOW()
     WHERE id = ANY($1::uuid[]) AND store_id = $2
       AND id IN (SELECT DISTINCT product_id FROM order_items)
     RETURNING id`,
    [verifiedIds, storeId]
  );
  const deactivatedIds = new Set(deactivateRes.rows.map((r) => r.id));
  const toDelete = verifiedIds.filter((id) => !deactivatedIds.has(id));

  let deleted = 0;
  if (toDelete.length > 0) {
    const del = await pool.query(
      `DELETE FROM products WHERE id = ANY($1::uuid[]) AND store_id = $2`,
      [toDelete, storeId]
    );
    deleted = del.rowCount;
  }

  return { deleted, deactivated: deactivatedIds.size };
}

/**
 * Returns true if the slug is already used by another product in the same store.
 * Pass excludeProductId when updating an existing product (to allow keeping its own slug).
 */
async function isSlugTaken(storeId, slug, excludeProductId = null) {
  const result = await pool.query(
    `SELECT id FROM products
     WHERE store_id = $1 AND slug = $2 AND ($3::uuid IS NULL OR id != $3)
     LIMIT 1`,
    [storeId, slug, excludeProductId]
  );
  return result.rows.length > 0;
}

module.exports = { createProduct, listProductsByStore, getProductById, listProductsWithStats, updateProduct, deleteProduct, duplicateProduct, reorderProducts, bulkUpdateProducts, bulkDeleteProducts, isSlugTaken };
