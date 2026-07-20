/* Locale ringan untuk frontend. Default sengaja English agar pengalaman baru
   konsisten, sementara pilihan pengguna disimpan di browser.

   Teksnya sendiri ada di messages.ts. Pemisahan itu yang membuat `t()` bisa
   menuntut kunci yang benar-benar ada: kunci salah ketik tidak lagi lolos ke
   produksi sebagai teks mentah "home.hreo" di layar. */
import { EN, ID, type MessageKey } from "./messages.ts";

export type Locale = "en" | "id";

const STORAGE_KEY = "scentsphere-locale";
const SUPPORTED: readonly Locale[] = ["en", "id"];

// Katalog menyimpan harga dalam IDR; display USD memakai kurs tampilan tetap
// agar nilai konsisten di seluruh halaman tanpa mengubah kontrak API.
export const IDR_PER_USD = 16000;

const DICT: Record<Locale, Record<MessageKey, string>> = { en: EN, id: ID };

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED as readonly string[]).includes(value);
}

let locale: Locale = "en";
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isLocale(saved)) locale = saved;
} catch {
  /* storage unavailable */
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (!isLocale(next) || next === locale) return;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scentsphere:localechange", { detail: { locale } }));
  }
}

export type MessageVars = Record<string, string | number | null | undefined>;

/* Kunci yang dirakit saat runtime tetap aman selama bagian yang berubah
   bertipe union tertutup: `relation.${RelationType}` dihitung TypeScript jadi
   union kunci yang nyata, jadi pemanggilnya tidak butuh cast apa pun. */
export function t(key: MessageKey, vars: MessageVars = {}): string {
  const value = DICT[locale][key] ?? DICT.en[key] ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}

/* Untuk nilai yang datangnya dari kawat dan tidak dijamin ada di kamus -
   mis. `gender` katalog yang bertipe string bebas. Mengembalikan `fallback`
   alih-alih menampilkan kuncinya sendiri di layar, yang selama ini terjadi
   diam-diam untuk nilai tak dikenal. */
export function tryT(key: string, fallback = ""): string {
  return Object.hasOwn(DICT.en, key) ? t(key as MessageKey) : fallback;
}

export function localeCurrency(): "IDR" | "USD" {
  return locale === "id" ? "IDR" : "USD";
}

function intlLocale(): string {
  return locale === "id" ? "id-ID" : "en-US";
}

export function localeNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(intlLocale(), options).format(value);
}

export function localeMoney(
  value: number | null | undefined,
  { compact = false }: { compact?: boolean } = {},
): string {
  if (!value && value !== 0) return t("currency.missing");
  const currency = localeCurrency();
  const amount = currency === "USD" ? Number(value) / IDR_PER_USD : Number(value);
  return new Intl.NumberFormat(intlLocale(), {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: currency === "IDR" ? (compact ? 1 : 0) : compact ? 1 : 2,
  }).format(amount);
}

/* priceRangeLabel() sengaja tinggal di lib/config.ts, bersama PRICE_RANGES:
   ambang harganya dulu tertulis dua kali - di sini dan di sana - sehingga
   mengubah salah satu diam-diam membuat label tidak cocok dengan filter yang
   benar-benar dijalankan. */

if (typeof document !== "undefined") document.documentElement.lang = locale;
