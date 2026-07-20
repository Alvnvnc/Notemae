/* Konfigurasi runtime yang ditanam public/runtime-env.js di browser, dan yang
   dipasang ssr.ts sebelum mengimpor modul view di Node. Dideklarasikan sebagai
   `var` supaya terbaca lewat `globalThis` di kedua lingkungan - src/legacy/config.js
   sengaja membacanya begitu justru agar satu modul yang sama bisa dipakai dua-duanya. */
declare global {
  // eslint-disable-next-line no-var
  var __SCENTSPHERE_CONFIG__: { backendUrl?: string } | undefined;
}

export {};
