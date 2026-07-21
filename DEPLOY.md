# Deploy Notemae

Domain produksi: **https://notemae.pavernor.site** (API: `notemae-api.pavernor.site`).

Seluruh aplikasi berjalan sebagai satu stack Docker Compose: Postgres/pgvector,
Redis, `backend` (Go), `agent`, `scraping`, dan `fe`. Backend sudah full Go —
lihat [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md).

---

## Deployment utama (mesin ini — WSL2 + Cloudflare Tunnel)

Ini adalah tempat deploy utama. Arsitekturnya:

```
Browser ──HTTPS──▶ Cloudflare (terminate TLS di edge)
                        │  Cloudflare Tunnel (cloudflared, outbound)
                        ▼
   mesin WSL2 ── Caddy host :80 ──┬─▶ fe   :4173   (notemae.pavernor.site)
   (systemd)                      └─▶ backend :8000 (notemae-api.pavernor.site)
                                         │
                                   Docker Compose stack (127.0.0.1)
```

Kunci: **Cloudflare Tunnel connect keluar** dari mesin ke Cloudflare, jadi tak
perlu IP publik, port-forward Windows, atau membuka firewall — inilah yang
membuatnya bisa publik meski berjalan di WSL2 yang ter-NAT. TLS diterminasi di
Cloudflare, sehingga Caddy host cukup HTTP polos di `:80`.

### Komponen di host (semua systemd, sudah `enabled`)

| Unit | Peran | Config |
|---|---|---|
| `docker` | Menjalankan stack compose (container `restart: unless-stopped`) | `docker-compose.yml` |
| `caddy` | Reverse proxy host `:80` → `fe`/`backend` | `/etc/caddy/Caddyfile` (snapshot: [deploy/primary/Caddyfile](deploy/primary/Caddyfile)) |
| `cloudflared-notemae` | Cloudflare Tunnel untuk domain notemae | `~/.cloudflared/notemae.yml` (snapshot: [deploy/primary/cloudflared-notemae.yml](deploy/primary/cloudflared-notemae.yml)) |

Snapshot config ada di [`deploy/primary/`](deploy/primary/) untuk dokumentasi/
reproduksi. Kredensial tunnel (`~/.cloudflared/*.json`) bersifat machine-local
dan tidak pernah di-commit.

### Secret (`.env`, tidak ikut git)

Yang penting untuk produksi:

| Variabel | Kenapa |
|---|---|
| `LLM_API_KEY` / `DASHSCOPE_API_KEY` | Parsing, embedding, rerank, penjelasan agen. Tanpa ini stack tetap jalan pakai fallback katalog deterministik. |
| `SERVICE_SHARED_SECRET` | Kredensial internal backend ↔ scraping. **Sudah di-rotate** dari default; bukan `change-me-before-production`. |
| `FRONTEND_ORIGINS` | Origin CORS yang diizinkan backend. Berisi `https://notemae.pavernor.site` (+ `http://localhost:4173` untuk uji lokal). |

### Menjalankan / update rilis

```bash
cd ~/Project/Notemae
git pull
docker compose up -d --build            # rebuild image yang berubah, swap container
```

`--build` mem-build ulang mis. `backend` dengan Dockerfile Go dan menukar
container-nya; volume `postgres_data` tak tersentuh, jadi data tetap. Service
host (caddy, cloudflared) tidak perlu disentuh untuk update aplikasi.

### Verifikasi

```bash
docker compose ps                                   # semua Up / healthy
curl -s -H 'Host: notemae.pavernor.site'     http://127.0.0.1/         # -> 200 (fe)
curl -s -H 'Host: notemae-api.pavernor.site' http://127.0.0.1/health   # -> ok (backend)
curl -sI https://notemae.pavernor.site/                                 # -> 200 (publik, via Cloudflare)
```

### Persistensi saat reboot

Semua service host sudah `systemctl enable`-d dan WSL memakai `systemd=true`,
jadi begitu distro WSL naik, docker + caddy + cloudflared ikut naik dan
container `restart: unless-stopped` menyusul. **Satu hal yang perlu dipastikan
di sisi Windows**: WSL2 tidak otomatis start saat Windows boot. Tambahkan Task
Scheduler (saat logon/startup) yang memicu distro, mis. menjalankan:

```
wsl.exe -d ubuntu -u root -e true
```

Setelah distro terpicu, systemd menyalakan seluruh service tanpa perlu membuka
terminal.

---

## Alternatif: server baru tanpa Cloudflare (Caddy + Let's Encrypt)

Untuk men-deploy ke server lain yang **tidak** pakai Cloudflare, tersedia overlay
reverse-proxy yang mengurus TLS sendiri via Let's Encrypt. Butuh DNS A-record ke
IP server + port 80/443 terbuka.

```bash
cp .env.example .env    # lalu isi secret
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up --build -d
```

Overlay menambah satu service Caddy ([deploy/Caddyfile](deploy/Caddyfile)) yang
memegang 80/443 dan meneruskan ke `fe`. Jangan pakai overlay ini di mesin yang
sudah punya Caddy/nginx host (seperti deployment utama di atas) — akan bentrok
di port 80.

## Catatan

- Hanya `fe` dan `backend` yang terjangkau publik (lewat Cloudflare Tunnel).
  Postgres, Redis, dan `agent` tetap terikat ke localhost mesin.
- Katalog kosong di awal itu wajar: `scraping` mengisi data berkala
  (`AUTO_INGEST_INTERVAL_SECONDS`).
