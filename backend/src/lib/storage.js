"use strict";

// Lib: storage
// Wraps Supabase Storage for two purposes: private product deliverables and public product images.
// The service-role key is required (not the anon key) because we write to a private bucket.
// This module is optional — if SUPABASE_URL/SUPABASE_SERVICE_KEY are missing, the import in app.js
// is wrapped in a try/catch so the server starts fine without file upload capability.

const { createClient } = require("@supabase/supabase-js");

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for file uploads");
  }
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

const BUCKETS = {
  DELIVERABLES:   "deliverables",
  PRODUCT_IMAGES: "product-images",
};

const MAX_DELIVERABLE_SIZE  = 25 * 1024 * 1024; // 25 MB
const MAX_IMAGE_SIZE        =  2 * 1024 * 1024; //  2 MB
const MAX_IMAGES_PER_PRODUCT = 10;

const ALLOWED_DELIVERABLE_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
  "application/epub+zip",
  "application/json",
  "text/csv",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  // xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "application/octet-stream",
]);

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Called once at startup to make sure our buckets exist with the right access settings.
// Fire-and-forget in app.js — a failure here should warn but not crash the server.
async function ensureBucketsExist() {
  const supabase = getSupabase();

  // Deliverables — private
  const { error: delErr } = await supabase.storage.getBucket(BUCKETS.DELIVERABLES);
  if (delErr && (delErr.message || "").toLowerCase().includes("not found")) {
    await supabase.storage.createBucket(BUCKETS.DELIVERABLES, {
      public: false,
      fileSizeLimit: MAX_DELIVERABLE_SIZE,
    });
  }

  // Product images — public
  const { error: imgErr } = await supabase.storage.getBucket(BUCKETS.PRODUCT_IMAGES);
  if (imgErr && (imgErr.message || "").toLowerCase().includes("not found")) {
    await supabase.storage.createBucket(BUCKETS.PRODUCT_IMAGES, {
      public: true,
      fileSizeLimit: MAX_IMAGE_SIZE,
    });
  } else {
    // Make sure it's public even if it already existed
    await supabase.storage.updateBucket(BUCKETS.PRODUCT_IMAGES, { public: true }).catch(() => {});
  }
}

// Uploads a product deliverable to the private bucket. Key path is store-scoped.
// Returns { key, size, name } — key is stored on the product and used to generate signed URLs at download time.
async function uploadDeliverable(storeId, file, originalName) {
  const supabase = getSupabase();
  const safeName = sanitizeFilename(originalName);
  const key = `stores/${storeId}/deliverables/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKETS.DELIVERABLES)
    .upload(key, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    key:  data.path,
    size: file.size,
    name: originalName,
  };
}

// Uploads a product cover image to the public bucket and returns the public URL.
// Images go in a per-product folder so they can be listed/deleted without scanning all store files.
async function uploadProductImage(storeId, productId, file, originalName) {
  const supabase = getSupabase();
  const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
  const key = `stores/${storeId}/products/${productId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKETS.PRODUCT_IMAGES)
    .upload(key, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(BUCKETS.PRODUCT_IMAGES)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// Best-effort file deletion. Never throws — if Supabase is down or the key is wrong, we log and move on.
async function deleteFile(bucket, key) {
  try {
    const supabase = getSupabase();
    await supabase.storage.from(bucket).remove([key]);
  } catch (err) {
    console.warn("storage.deleteFile failed", { bucket, key, err: err.message });
  }
}

// Creates a time-limited signed URL for a private deliverable file.
// Used by the delivery endpoint — raw storage keys are never exposed to the client directly.
async function getSignedDeliverableUrl(key, expiresIn = 3600) {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKETS.DELIVERABLES)
    .createSignedUrl(key, expiresIn);

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
  return data.signedUrl;
}

/** Remove characters that could cause path issues. */
function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
}

/** Human-readable file size. */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  BUCKETS,
  MAX_DELIVERABLE_SIZE,
  MAX_IMAGE_SIZE,
  MAX_IMAGES_PER_PRODUCT,
  ALLOWED_DELIVERABLE_TYPES,
  ALLOWED_IMAGE_TYPES,
  ensureBucketsExist,
  uploadDeliverable,
  uploadProductImage,
  deleteFile,
  getSignedDeliverableUrl,
  sanitizeFilename,
  formatFileSize,
};
