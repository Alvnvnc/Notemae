/* Server FE: melayani aset klien dan mem-proxy /v1/* ke backend.
 *
 * Dijalankan Node apa adanya - type stripping bawaan Node >= 22.18 membuang
 * anotasi tipenya saat dimuat, jadi tidak ada langkah build untuk sisi server.
 * Yang butuh build hanya klien (Vite), dan hanya untuk produksi.
 *
 * Dev  (`npm run dev`)   : Vite jalan sebagai middleware, sumber disajikan
 *                          apa adanya dengan HMR.
 * Prod (`npm start`)     : dist/client hasil `npm run build` yang disajikan.
 *
 * Dua mode itu berbagi seluruh rantai lain - proxy, SSR, header - supaya
 * perbedaan perilaku antara laptop dan container tetap sesempit mungkin.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

import compression from "compression";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist", "client");
const PORT = Number(process.env.PORT ?? 4173);
const DEV = process.env.NODE_ENV !== "production";
// Di container: http://backend:8000. Di laptop: port yang dipublish compose.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// Loader SSR (di modul React) memanggil backend lewat config yang membaca
// globalThis; harus terpasang sebelum bundel SSR yang mengimpor config dimuat.
(globalThis as { __SCENTSPHERE_CONFIG__?: { backendUrl?: string } }).__SCENTSPHERE_CONFIG__ = { backendUrl: BACKEND_URL };

const app = express();
app.disable("x-powered-by");

/* Kompresi dipasang paling awal supaya berlaku untuk semuanya: HTML hasil SSR,
   bundel JS, dan app.css yang sendirian sudah puluhan kilobyte. Sebelumnya
   tidak ada sama sekali - semua dikirim mentah. Aset ber-hash di /assets sudah
   dianggap immutable oleh browser, jadi ongkos kompresinya hanya dibayar
   sekali per klien. */
app.use(compression());

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

// API same-origin: browser memanggil /v1/* di host ini, server meneruskan ke
// backend sehingga tidak butuh port backend publik maupun setup CORS.
// Didaftarkan sebelum middleware aset apa pun - /v1 tidak pernah boleh jatuh
// ke Vite atau ke static handler.
app.use(
  createProxyMiddleware({
    pathFilter: "/v1",
    target: BACKEND_URL,
    changeOrigin: false,
    xfwd: true,
    proxyTimeout: 120_000,
    timeout: 120_000,
    on: {
      error: (err, _req, res) => {
        console.error(`[proxy] ${BACKEND_URL} -> ${err.message}`);
        if (!("writeHead" in res) || typeof res.writeHead !== "function" || res.headersSent) return;
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "backend unreachable" }));
      },
    },
  }),
);

const YEAR_SECONDS = 31_536_000;

/* Aset dari Vite (/assets/*) namanya memuat hash isinya, dan font tidak pernah
   berubah: keduanya aman di-cache selamanya. Sisanya - index.html, background.js,
   runtime-env.js - namanya tetap sehingga harus selalu divalidasi ulang, kalau
   tidak deploy baru akan mengendap di cache edge. */
function setAssetHeaders(res: express.Response, filePath: string): void {
  const rel = path.relative(DIST, filePath);
  const immutable = rel.startsWith("assets" + path.sep) || rel.startsWith("fonts" + path.sep);
  res.setHeader(
    "Cache-Control",
    immutable ? `public, max-age=${YEAR_SECONDS}, immutable` : "no-cache",
  );
}

/** Diisi berbeda per mode; keduanya mengembalikan shell HTML yang siap pakai. */
let loadShell: (url: string) => Promise<string>;

interface SsrResult {
  html: string;
  hydrationData: unknown;
  title: string;
  desc: string;
  stage: boolean;
  locale: string;
}
/** Merender pohon React di server untuk rute yang di-SSR. */
let renderSsr: (url: string) => Promise<SsrResult>;

if (DEV) {
  // Impor dinamis: `vite` adalah devDependency dan tidak ada di image produksi.
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: ROOT,
    appType: "custom",
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);
  // Shell dev harus lewat Vite dulu: di situlah klien HMR dan penulisan ulang
  // jalur modul disisipkan.
  loadShell = async (url) => {
    const raw = await readFile(path.join(ROOT, "index.html"), "utf8");
    return vite.transformIndexHtml(url, raw);
  };
  // Vite yang mentransform JSX + menyusun graf modul untuk SSR di dev - tak
  // ada langkah build; ssrLoadModule juga ikut HMR.
  renderSsr = async (url) => {
    const mod = await vite.ssrLoadModule("/src/react/entry-server.tsx");
    return (mod as { render: (u: string) => Promise<SsrResult> }).render(url);
  };
} else {
  app.use(express.static(DIST, { index: false, dotfiles: "ignore", setHeaders: setAssetHeaders }));
  // index.html hasil build sudah memuat <link>/<script> ber-hash yang benar.
  // Dibaca sekali lalu ditahan di memori: isinya tidak berubah selama proses hidup.
  let cached: Promise<string> | null = null;
  loadShell = () => (cached ??= readFile(path.join(DIST, "index.html"), "utf8"));
  // Bundel SSR hasil `vite build --ssr` (dist/server). Diimpor sekali.
  const entry = pathToFileURL(path.join(ROOT, "dist", "server", "entry-server.js")).href;
  let mod: Promise<{ render: (u: string) => Promise<SsrResult> }> | null = null;
  renderSsr = (url) => (mod ??= import(entry)).then((m) => m.render(url));
}

/* Cakupan SSR sama seperti dulu: hanya rute yang datanya publik dan stabil.
   Sisanya dirender klien; shell apa adanya sudah jadi fallback yang benar. */
const SSR_PATHS = new Set(["/", "/konsultan"]);

function escapeAttr(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* Ditanam di <script>, jadi yang berbahaya hanya urutan yang menutup tag itu. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/* Sisipkan hasil render: konten ke #root; data hidrasi + locale sebagai skrip
   saudara (bukan di dalam #root, supaya isi #root persis cocok dengan render
   klien = hidrasi bersih). data-loading dilepas - konten sudah ada, tirai tak
   perlu jalan. title/desc/canonical/data-stage disetel seperti dulu. */
function injectSsr(shell: string, result: SsrResult, pathname: string): string {
  const fullTitle = result.title ? `${result.title} | Notemae` : "Notemae | Perfume Dupe Guide";
  const boot =
    `<script>window.__staticRouterHydrationData=${safeJson(result.hydrationData)};` +
    `window.__SSR_LOCALE__=${safeJson(result.locale)};</script>`;
  let out = shell
    .replace('<body data-loading="true">', result.stage ? '<body data-stage="on">' : "<body>")
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(fullTitle)}</title>`)
    .replace('<div id="root"></div>', `<div id="root">${result.html}</div>\n    ${boot}`);
  if (result.desc) {
    out = out.replace(/(<meta\s+name="description"\s+content=")[\s\S]*?(")/, `$1${escapeAttr(result.desc)}$2`);
  }
  out = out.replace(
    /(<link rel="canonical" href=")([^"]*)(")/,
    (_m, open: string, href: string, close: string) => `${open}${escapeAttr(new URL(pathname, href).href)}${close}`,
  );
  return out;
}

// Router SPA (History API): rute non-aset jatuh ke shell. Rute yang di-SSR
// (/ , /konsultan) dikirim sudah berisi konten + data hidrasi; sisanya shell
// kosong, dirender klien. Kalau render server gagal (backend mati dll.), jatuh
// ke shell kosong - halaman tetap tayang, hanya sepenuhnya client-side.
app.use(async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const pathname = req.path.replace(/\/+$/, "") || "/";
  try {
    const shell = await loadShell(req.originalUrl);
    res.setHeader("Cache-Control", "no-cache");
    if (SSR_PATHS.has(pathname)) {
      try {
        const result = await renderSsr(`http://ssr.local${req.originalUrl}`);
        res.type("html").send(injectSsr(shell, result, pathname));
        return;
      } catch (error) {
        console.error(`[ssr] ${pathname} -> ${(error as Error).message}`);
      }
    }
    res.type("html").send(shell);
  } catch (error) {
    next(error);
  }
});

// Log kesuksesan dipasang lewat event `listening`, bukan callback listen():
// callback-nya tetap jalan meski bind gagal, jadi barisnya sempat tercetak
// untuk server yang sebenarnya tidak pernah hidup.
const server = app.listen(PORT);
server.on("listening", () => {
  console.log(
    `fe  http://localhost:${PORT}  [${DEV ? "dev" : "prod"}]  ->  /v1 proxied to ${BACKEND_URL}`,
  );
});

// Tanpa ini kegagalan listen keluar tanpa suara dengan status 0, dan
// `node --watch` melaporkannya sebagai "Completed running" - persis seperti
// server yang sehat lalu berhenti sendiri. Penyebab tersering: container fe
// dari compose masih memegang portnya.
server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `fe  port ${PORT} sudah dipakai proses lain.\n` +
        `    Hentikan yang lama dulu (mis. \`docker compose stop fe\`), ` +
        `atau jalankan dengan port lain: \`PORT=4174 npm run dev\`.`,
    );
  } else {
    console.error(`fe  gagal listen di port ${PORT}: ${error.message}`);
  }
  process.exit(1);
});
