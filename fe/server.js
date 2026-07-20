/* Server FE: melayani aset statis dan mem-proxy /v1/* ke backend.
 *
 * Dipakai sama persis untuk dev (`npm run dev`) dan produksi (`npm start`),
 * jadi tidak ada beda perilaku antara mesin lokal dan container. Tidak ada
 * build-step: file di folder ini disajikan apa adanya, sama seperti yang
 * dilakukan nginx sebelumnya.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
// Di container: http://backend:8000. Di laptop: port yang dipublish compose.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const app = express();
app.disable("x-powered-by");

app.get("/health", (_req, res) => res.type("text/plain").send("ok"));

// API same-origin: browser memanggil /v1/* di host ini, server meneruskan ke
// backend sehingga tidak butuh port backend publik maupun setup CORS.
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
        if (typeof res.writeHead !== "function" || res.headersSent) return;
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "backend unreachable" }));
      },
    },
  }),
);

// Sumber server dan manifest npm hidup di folder yang sama dengan aset publik,
// jadi tutup sebelum static handler sempat menyajikannya.
const PRIVATE = new Set(["/server.js", "/package.json", "/package-lock.json", "/Dockerfile", "/README.md"]);
app.use((req, res, next) => (PRIVATE.has(req.path) ? res.status(404).end() : next()));

const YEAR_MS = 31_536_000_000;

// Lib pihak ketiga dan font self-hosted tidak pernah berubah -> cache keras.
const immutable = (dir) =>
  express.static(path.join(ROOT, dir), { maxAge: YEAR_MS, immutable: true, index: false });
app.use("/vendor", immutable("vendor"));
app.use("/fonts", immutable("fonts"));

// Sisanya (app shell) berubah tiap deploy -> selalu revalidasi supaya build
// baru langsung tayang, tidak mengendap di cache edge Cloudflare.
app.use(
  express.static(ROOT, {
    index: false,
    dotfiles: "ignore",
    setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
  }),
);

// Router SPA pakai History API -> semua rute non-aset jatuh ke index.html.
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(PORT, () => {
  console.log(`fe  http://localhost:${PORT}  ->  /v1 proxied to ${BACKEND_URL}`);
});
