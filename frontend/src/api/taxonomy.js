const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:5051";

export async function fetchTypes() {
  const res = await fetch(`${API_BASE}/api/taxonomy/types`);
  if (!res.ok) throw new Error("Failed to load product types");
  const data = await res.json();
  return data.types;
}

export async function fetchCategories(typeSlug) {
  const res = await fetch(`${API_BASE}/api/taxonomy/types/${encodeURIComponent(typeSlug)}/categories`);
  if (!res.ok) throw new Error("Failed to load categories");
  const data = await res.json();
  return data.categories;
}

export async function searchTags(query) {
  const qs = query ? `?search=${encodeURIComponent(query)}` : "";
  const res = await fetch(`${API_BASE}/api/taxonomy/tags${qs}`);
  if (!res.ok) throw new Error("Failed to load tags");
  const data = await res.json();
  return data.tags;
}
