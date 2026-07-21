# Deploy Notemae ke VPS (notemae.pavernor.site)

Seluruh aplikasi berjalan sebagai satu stack Docker Compose: Postgres/pgvector,
Redis, `backend`, `agent`, `scraping`, dan `fe`. Hanya `fe` yang perlu terekspos
ke publik — ia mem-proxy `/v1/*` ke `backend` di jaringan internal, jadi API dan
database tak pernah punya port publik.

## 1. Prasyarat di server

- Docker + Docker Compose plugin (`docker compose version`).
- DNS: record **A** `notemae.pavernor.site` → IP server ini.
- Firewall: port **80** dan **443** terbuka.

## 2. Ambil kode

```bash
git clone <repo-url> notemae && cd notemae
# atau, kalau sudah pernah:  cd notemae && git pull
```

## 3. Siapkan secret (.env di server)

`.env` tidak ikut ke git. Buat dari contohnya lalu isi:

```bash
cp .env.example .env
```

Yang penting diisi untuk produksi:

| Variabel | Kenapa |
|---|---|
| `LLM_API_KEY` (atau `DASHSCOPE_API_KEY`) | Parsing, embedding, rerank, penjelasan agen. Tanpa ini demo tetap jalan pakai fallback katalog deterministik. |
| `SERVICE_SHARED_SECRET` | Ganti dari `change-me-before-production` — dipakai backend ↔ scraping. |
| `FRONTEND_ORIGINS` | Sudah default menyertakan `https://notemae.pavernor.site`. Ubah kalau domainnya lain. |

## 4. Jalankan

Pilih **salah satu** sesuai kondisi server.

### A. Server belum punya reverse proxy → pakai Caddy bawaan (TLS otomatis)

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up --build -d
```

Caddy akan mengurus sertifikat Let's Encrypt sendiri begitu DNS sudah mengarah
dan port 80/443 terbuka. Selesai — buka `https://notemae.pavernor.site`.

### B. Server sudah punya nginx/caddy di host

Jangan pakai overlay proxy. Cukup:

```bash
docker compose up --build -d
```

Lalu arahkan proxy host ke `fe` yang dipublish di `127.0.0.1:4173`. Contoh nginx:

```nginx
server {
    server_name notemae.pavernor.site;
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# lalu: certbot --nginx -d notemae.pavernor.site
```

## 5. Verifikasi

```bash
docker compose ps                        # semua service Up / healthy
curl -f http://127.0.0.1:4173/health     # -> ok
```

Buka domainnya di browser. Katalog kosong di awal itu wajar: `scraping`
mengisi data secara berkala (`AUTO_INGEST_INTERVAL_SECONDS`). Untuk isi cepat,
biarkan jalan atau turunkan interval sementara.

## 6. Update rilis berikutnya

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up --build -d
# (atau tanpa -f proxy kalau pakai jalur B)
```

Aset `fe` ber-hash isi + `Cache-Control: immutable`, sedangkan `index.html`,
`runtime-env.js`, dan `background.js` dikirim `no-cache`, jadi deploy baru tidak
mengendap di cache browser.

## Catatan

- `fe` mendengarkan `0.0.0.0:4173` di dalam container; Caddy/nginx menjangkaunya
  lewat nama service `fe` (overlay) atau port publish `127.0.0.1:4173` (host proxy).
- Hanya `fe` yang publik. Postgres (`127.0.0.1:5432`), `backend` (`:8000`),
  `agent` (`:8001`), `scraping` (`:8002`) tetap terikat ke localhost server.
