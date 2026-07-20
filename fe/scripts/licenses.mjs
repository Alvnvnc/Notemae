/* Menyusun public/THIRD-PARTY-LICENSES.txt dari node_modules.
 *
 * Pustaka pihak ketiga dulu disajikan apa adanya dari /vendor, lengkap dengan
 * banner lisensi di dalam file minified-nya (dan vendor/THREE-LICENSE di
 * sebelahnya). Sekarang semuanya masuk bundle Vite, yang membuang komentar
 * legal saat minify - padahal MIT mewajibkan notice-nya ikut terdistribusi.
 * File ini mengembalikan kewajiban itu dengan membaca teks lisensi aslinya,
 * bukan menuliskannya ulang dari ingatan.
 *
 * Dijalankan otomatis oleh `npm run build`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODULES = path.join(ROOT, "node_modules");

/* Hanya paket yang kodenya benar-benar sampai ke browser. `file: null` berarti
   paket itu tidak menyertakan berkas lisensi dan syaratnya harus dirujuk. */
const BUNDLED = [
  { name: "three", file: "LICENSE" },
  { name: "lenis", file: "LICENSE" },
  { name: "react", file: "LICENSE" },
  { name: "react-dom", file: "LICENSE" },
  {
    name: "gsap",
    file: null,
    note:
      "GreenSock standard 'no charge' license.\n" +
      "Teks lengkap: https://gsap.com/standard-license\n" +
      "Copyright (c) 2008-2026, GreenSock. All rights reserved.",
  },
];

async function version(name) {
  const pkg = JSON.parse(await readFile(path.join(MODULES, name, "package.json"), "utf8"));
  return pkg.version;
}

const blocks = [];
for (const entry of BUNDLED) {
  const v = await version(entry.name);
  const body = entry.file
    ? (await readFile(path.join(MODULES, entry.name, entry.file), "utf8")).trim()
    : entry.note;
  blocks.push(`${"=".repeat(74)}\n${entry.name} ${v}\n${"=".repeat(74)}\n\n${body}`);
}

const header =
  "Frontend ScentSphere memuat pustaka pihak ketiga berikut di dalam bundelnya.\n" +
  "Berkas ini disajikan di /THIRD-PARTY-LICENSES.txt dan dihasilkan ulang setiap\n" +
  "kali `npm run build` dijalankan - jangan disunting tangan.\n";

const out = path.join(ROOT, "public", "THIRD-PARTY-LICENSES.txt");
await writeFile(out, `${header}\n${blocks.join("\n\n")}\n`, "utf8");
console.log(`licenses  ${path.relative(ROOT, out)}  (${BUNDLED.length} paket)`);
