/* Lapisan API tipis di atas backend publik (lihat docs/api-contract.md).
   GET di-cache singkat di memori supaya navigasi bolak-balik terasa instan
   (KNF-01) tanpa menyimpan data basi terlalu lama (KNF-13). */

import { BACKEND_URL, FETCH_LIMIT } from "./config.js";

const cache = new Map();
const TTL_MS = 90_000;

async function getJson(path, { signal } = {}) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await fetch(BACKEND_URL + path, { signal });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const data = await res.json();
  cache.set(path, { at: Date.now(), data });
  return data;
}

export async function searchFragrances({ q, note, maxPriceIdr, limit = FETCH_LIMIT, signal } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (q) qs.set("q", q);
  if (note) qs.set("note", note);
  if (maxPriceIdr) qs.set("max_price_idr", String(maxPriceIdr));
  const data = await getJson(`/v1/fragrances?${qs}`, { signal });
  return data.items || [];
}

export function getFragrance(slug, opts = {}) {
  return getJson(`/v1/fragrances/${encodeURIComponent(slug)}`, opts);
}

export function getDupes(slug, { explain = false, signal } = {}) {
  const qs = explain ? "?explain=true" : "";
  return getJson(`/v1/fragrances/${encodeURIComponent(slug)}/dupes${qs}`, { signal });
}

async function postJson(path, payload) {
  const res = await fetch(BACKEND_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

export function recommend(payload) {
  return postJson("/v1/recommendations", payload);
}

export function recommendFromText(text, limit = 3) {
  return postJson("/v1/recommendations/from-text", { text, limit });
}
