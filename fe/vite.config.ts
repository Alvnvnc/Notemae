import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/* Build klien saja. Server (server.ts, ssr.ts) dijalankan Node langsung lewat
   type stripping, jadi tidak ada bundle server yang perlu dihasilkan di sini.
   `appType: "custom"` mematikan fallback SPA bawaan Vite: rute non-aset
   ditangani server.ts, yang tahu mana yang harus di-SSR. */
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  appType: "custom",
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    // Nama file ber-hash konten dipetakan di sini supaya ssr.ts bisa menyisip
    // <link>/<script> yang benar tanpa menebak.
    manifest: true,
    sourcemap: true,
    target: "es2022",
    // Aset kecil di-inline sebagai data URI; sisanya dapat nama ber-hash.
    assetsInlineLimit: 2048,
  },
});
