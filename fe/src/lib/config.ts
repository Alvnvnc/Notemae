/* Konfigurasi statis aplikasi. Nilai runtime (backendUrl) datang dari
   public/runtime-env.js agar image Docker yang sama bisa dipakai di host mana
   pun tanpa build ulang.

   Modul ini juga dipakai ssr.ts saat render di server, jadi bacanya lewat
   globalThis: di browser itu window, di Node itu global. */
import type { RequestGender } from "./api-types.ts";
import { localeMoney, t } from "./i18n.ts";

const runtime = globalThis.__SCENTSPHERE_CONFIG__ ?? {};

export const BACKEND_URL: string =
  typeof runtime.backendUrl === "string" ? runtime.backendUrl : "http://localhost:8000";

/** Warna RGB 0..1 untuk shader latar, bukan token CSS. */
export type StagePalette = readonly [number, number, number];

export interface ScentFamily {
  name: string;
  /** Notes wakil, dipakai sebagai filter `note` ke API. */
  note: string;
  /** Kata kunci pencarian teks, dipakai kalau filter note terlalu ketat. */
  q: string;
  a: StagePalette;
  b: StagePalette;
}

/* Keluarga aroma untuk filter katalog (KF-03) dan palet latar WebGL. */
export const FAMILIES: readonly ScentFamily[] = [
  { name: "Citrus",   note: "bergamot", q: "citrus",  a: [0.90, 0.78, 0.30], b: [0.55, 0.70, 0.28] },
  { name: "Woody",    note: "cedar",    q: "wood",    a: [0.55, 0.38, 0.22], b: [0.28, 0.34, 0.24] },
  { name: "Floral",   note: "jasmine",  q: "floral",  a: [0.86, 0.60, 0.72], b: [0.52, 0.40, 0.55] },
  { name: "Amber",    note: "amber",    q: "amber",   a: [0.82, 0.62, 0.36], b: [0.52, 0.30, 0.16] },
  { name: "Fresh",    note: "lavender", q: "fresh",   a: [0.55, 0.78, 0.62], b: [0.30, 0.52, 0.42] },
  { name: "Musky",    note: "musk",     q: "musk",    a: [0.80, 0.72, 0.62], b: [0.44, 0.40, 0.35] },
  { name: "Spicy",    note: "cinnamon", q: "spice",   a: [0.82, 0.42, 0.26], b: [0.42, 0.18, 0.14] },
  { name: "Aquatic",  note: "marine",   q: "aquatic", a: [0.40, 0.70, 0.82], b: [0.18, 0.40, 0.52] },
  { name: "Gourmand", note: "vanilla",  q: "vanilla", a: [0.88, 0.72, 0.48], b: [0.50, 0.34, 0.20] },
];

/* Palet default stage (hero) - selaras token --ink / --amber. */
export const STAGE_DEFAULT: { a: StagePalette; b: StagePalette } = {
  a: [0.36, 0.42, 0.28],
  b: [0.85, 0.63, 0.36],
};

/* Berapa banyak original unggulan yang diminta beranda (KF-10). Daftarnya
   sendiri datang dari GET /v1/featured, diurutkan dari kedalaman kurasi
   dupe-nya, supaya tidak pernah menunjuk slug yang sudah hilang dari
   katalog seperti daftar hardcode sebelumnya. */
export const FEATURED_LIMIT = 5;

export interface PriceRange {
  min: number;
  /** null = tanpa batas atas. */
  max: number | null;
}

/* Rentang harga filter katalog (KF-03), dalam IDR. Urutannya adalah
   kontraknya: query string `?harga=` menyimpan indeks, bukan nilainya. */
export const PRICE_RANGES: readonly PriceRange[] = [
  { min: 0, max: null },
  { min: 0, max: 500_000 },
  { min: 500_000, max: 1_000_000 },
  { min: 1_000_000, max: 2_500_000 },
  { min: 2_500_000, max: null },
];

/* Label diturunkan dari datanya, bukan ditulis kedua kali. Versi sebelumnya
   menyimpan ambang yang sama di dua tempat - config dan i18n - sehingga
   mengubah salah satu diam-diam membuat label tidak lagi cocok dengan filter
   yang benar-benar dijalankan. */
export function priceRangeLabel(index: number): string {
  const range = PRICE_RANGES[index];
  if (!range) return t("currency.all");
  const { min, max } = range;
  if (!min && max == null) return t("currency.all");
  if (!min) return t("currency.below", { value: localeMoney(max) });
  if (max == null) return t("currency.above", { value: localeMoney(min) });
  return t("currency.range", { from: localeMoney(min), to: localeMoney(max) });
}

/* Nilai gender filter katalog. "" = semua. Labelnya datang dari kamus
   (`gender.*`), bukan dari sini - daftar teks Indonesia yang dulu ada di
   berkas ini sudah tidak pernah dibaca sejak i18n masuk. */
export const GENDERS: readonly ("" | RequestGender)[] = ["", "men", "women", "unisex"];

export const PAGE_SIZE = 12;
export const FETCH_LIMIT = 50; // batas maksimum API publik

/* ---- showcase 3D (beranda) -----------------------------------------------
   Daftar kurasi untuk galeri botol 3D. Slug di sini hanya sebuah preferensi
   urutan, bukan janji: showcase mengambil katalog sekali lalu memakai slug
   yang benar-benar ada, dan menambal sisanya dari katalog. Jadi satu parfum
   yang hilang dari katalog tidak pernah menyisakan lubang di galeri.

   `glass`/`liquid`/`metal` adalah arah seni, bukan data produk - warnanya
   sengaja dijaga rendah saturasi supaya sederet botol tetap terbaca satu
   keluarga dengan palet forest, dan amber tetap jadi satu-satunya aksen UI. */

/** Konstruksi bodi botol di legacy/showcase3d.ts. */
export type BottleShape =
  /** Balok pipih bersudut membulat (flakon EDT klasik). */
  | "flask"
  /** Prisma segi delapan berpinggul talang. */
  | "faceted"
  /** Flask sempit dan jangkung. */
  | "slim";

/** Kepala botol. */
export type BottleCap =
  /** Silinder beralur vertikal. */
  | "ribbed"
  /** Pelat label persegi di atas kerah kubah. */
  | "plate"
  /** Kerucut segi empat. */
  | "pyramid";

export interface ShowcaseEntry {
  slug: string;
  shape: BottleShape;
  cap: BottleCap;
  glass: string;
  liquid: string;
  metal: string;
}

export const SHOWCASE: readonly ShowcaseEntry[] = [
  { slug: "creed-aventus",            shape: "flask",   cap: "ribbed",  glass: "#3a4636", liquid: "#c9a45c", metal: "#3c4636" },
  { slug: "bleu-de-chanel-edp",       shape: "faceted", cap: "plate",   glass: "#2c3a42", liquid: "#5f7f8c", metal: "#333f46" },
  { slug: "tom-ford-tobacco-vanille", shape: "flask",   cap: "plate",   glass: "#3c3026", liquid: "#a9713a", metal: "#463726" },
  { slug: "le-labo-santal-33",        shape: "slim",    cap: "ribbed",  glass: "#3d3c35", liquid: "#c3b393", metal: "#414136" },
  { slug: "dior-sauvage-edt",         shape: "faceted", cap: "pyramid", glass: "#333c3d", liquid: "#7d9184", metal: "#39423f" },
  { slug: "kilian-angels-share",      shape: "flask",   cap: "ribbed",  glass: "#40342a", liquid: "#b8763c", metal: "#4a3826" },
];
