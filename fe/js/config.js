/* Konfigurasi statis aplikasi. Nilai runtime (backendUrl) datang dari
   runtime-env.js agar image Docker yang sama bisa dipakai di host mana pun. */

const runtime = window.__SCENTSPHERE_CONFIG__ || {};

export const BACKEND_URL =
  typeof runtime.backendUrl === "string" ? runtime.backendUrl : "http://localhost:8000";

/* Keluarga aroma untuk filter katalog (KF-03) dan palet latar WebGL. */
export const FAMILIES = [
  { name: "Citrus",   note: "bergamot", q: "citrus",  a: [0.90, 0.78, 0.30], b: [0.55, 0.70, 0.28] },
  { name: "Woody",    note: "cedar",    q: "wood",    a: [0.55, 0.38, 0.22], b: [0.28, 0.34, 0.24] },
  { name: "Floral",   note: "jasmine",  q: "floral",  a: [0.86, 0.60, 0.72], b: [0.52, 0.40, 0.55] },
  { name: "Amber",    note: "amber",    q: "amber",   a: [0.82, 0.62, 0.36], b: [0.52, 0.30, 0.16] },
  { name: "Fresh",    note: "lavender", q: "fresh",   a: [0.55, 0.78, 0.62], b: [0.30, 0.52, 0.42] },
  { name: "Musky",    note: "musk",     q: "musk",    a: [0.80, 0.72, 0.62], b: [0.44, 0.40, 0.35] },
  { name: "Spicy",    note: "cinnamon", q: "spice",   a: [0.82, 0.42, 0.26], b: [0.42, 0.18, 0.14] },
  { name: "Aquatic",  note: "marine",   q: "aquatic", a: [0.40, 0.70, 0.82], b: [0.18, 0.40, 0.52] },
  { name: "Gourmand", note: "vanilla",  q: "vanilla", a: [0.88, 0.72, 0.48], b: [0.50, 0.34, 0.20] }
];

/* Palet default stage (hero) - selaras token --ink / --amber. */
export const STAGE_DEFAULT = {
  a: [0.36, 0.42, 0.28],
  b: [0.85, 0.63, 0.36]
};

/* Original unggulan untuk konten kurasi beranda (KF-10). Daftar slug
   dikurasi manual; datanya selalu diambil langsung dari API sehingga
   harga dan relasinya tidak pernah basi. */
export const FEATURED_ORIGINALS = [
  "creed-aventus",
  "maison-francis-kurkdjian-baccarat-rouge-540",
  "dior-sauvage-elixir",
  "jean-paul-gaultier-ultra-male",
  "kilian-angels-share"
];

/* Rentang harga filter katalog (KF-03). */
export const PRICE_RANGES = [
  { label: "Semua harga", min: 0, max: null },
  { label: "Di bawah Rp500 rb", min: 0, max: 500000 },
  { label: "Rp500 rb sampai Rp1 jt", min: 500000, max: 1000000 },
  { label: "Rp1 jt sampai Rp2,5 jt", min: 1000000, max: 2500000 },
  { label: "Di atas Rp2,5 jt", min: 2500000, max: null }
];

export const GENDERS = [
  { value: "", label: "Semua" },
  { value: "men", label: "Pria" },
  { value: "women", label: "Wanita" },
  { value: "unisex", label: "Unisex" }
];

export const PAGE_SIZE = 12;
export const FETCH_LIMIT = 50; // batas maksimum API publik
