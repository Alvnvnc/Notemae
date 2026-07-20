# Frontend - ScentSphere Dupe Guide

SPA tanpa build-step (ES modules, disajikan server Node kecil) untuk panduan
dupe parfum, didesain dari `docs/Spesifikasi-Kebutuhan-Website-Parfum-Dupe.pdf`.

## Menjalankan

```bash
npm install
npm run dev    # node --watch, http://localhost:4173, /v1 -> BACKEND_URL
```

`BACKEND_URL` default `http://127.0.0.1:8000` (port backend yang dipublish
compose); di container di-set ke `http://backend:8000`. `npm start` menjalankan
server yang sama tanpa watch — itu juga perintah yang dipakai image Docker.

## Rute (History API, fallback ke `index.html` oleh `server.js`)

- `/` beranda: hero, pasangan tersorot (KF-10), konsultan aroma
- `/katalog` katalog + pencarian autocomplete + filter + pagination (KF-01..03, KF-09)
- `/parfum/:slug` detail + piramida notes + daftar dupe berskor (KF-04..06, KF-08)
- `/bandingkan/:a/vs/:b` perbandingan berdampingan (KF-07..08)

## Struktur

- `js/config.js` konstanta (keluarga aroma, original unggulan, rentang harga)
- `js/api.js` lapisan fetch + cache singkat
- `js/format.js` util murni: rupiah, overlap notes (Jaccard), wording confidence
- `js/motion.js` GSAP/ScrollTrigger/SplitText/Lenis + fallback IntersectionObserver
- `js/router.js` router URL bersih + transisi tirai + meta per rute
- `js/views/*.js` satu modul per halaman
- `vendor/` GSAP 3.13 (ScrollTrigger, SplitText, Flip) + Lenis, di-vendor lokal
- `fonts/` Space Grotesk + Cormorant Garamond (self-hosted woff2)

Motion punya dua mode: `body[data-motion="gsap"]` (orkestrasi penuh) dan
`body[data-motion="css"]` (fallback IntersectionObserver + transition; juga
dipakai saat `prefers-reduced-motion`). Konten tidak pernah disembunyikan
permanen.

`runtime-env.js` menentukan `backendUrl` ("" = same-origin; `server.js` mem-proxy
`/v1/*` ke container backend). Jangan taruh secret apa pun di folder ini.

`app.js.bak` adalah landing lama (satu halaman, harga USD) yang disimpan
sebagai arsip; tidak dimuat dan tidak ikut di-build ke image Docker.
