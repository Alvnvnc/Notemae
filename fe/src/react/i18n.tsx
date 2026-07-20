/* i18n untuk React.

   lib/i18n.ts tetap jadi sumber kebenaran (locale, kamus, t()). Modul ini
   hanya menjembataninya ke React: useSyncExternalStore berlangganan event
   `scentsphere:localechange` yang sudah dipancarkan setLocale(), jadi setiap
   komponen yang membaca locale ikut re-render saat bahasanya berganti - tanpa
   context provider dan tanpa menduplikasi state.

   Aman di server: useSyncExternalStore memakai getServerSnapshot (getLocale)
   dan tidak pernah memanggil subscribe saat SSR. */
import { useSyncExternalStore } from "react";
import { getLocale, setLocale, t as translate, type Locale } from "../lib/i18n.ts";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("scentsphere:localechange", onChange);
  return () => window.removeEventListener("scentsphere:localechange", onChange);
}

/** Locale aktif; komponen pemanggil re-render saat locale berganti. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** `t` yang terikat locale aktif: memanggil useLocale() supaya komponen
    re-render saat bahasa berganti, lalu mengembalikan translate apa adanya. */
export function useT(): typeof translate {
  useLocale();
  return translate;
}

export { setLocale };
export type { Locale };
