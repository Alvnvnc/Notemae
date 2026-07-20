# Frontend - ScentSphere Dupe Guide

SPA untuk panduan dupe parfum, didesain dari
`docs/Spesifikasi-Kebutuhan-Website-Parfum-Dupe.pdf`. Klien dibangun Vite
(TypeScript + React), disajikan Express yang sekaligus mem-proxy API dan
merender sebagian rute di server.

## Menjalankan

```bash
pnpm install
pnpm dev        # Vite middleware + HMR + SSR dev, http://localhost:4173
pnpm build      # -> dist/client (klien) + dist/server (bundel SSR)
pnpm start      # jalankan hasil build (NODE_ENV=production)
pnpm typecheck  # tsc --noEmit
```

`BACKEND_URL` default `http://127.0.0.1:8000` (port backend yang dipublish
compose); di container di-set ke `http://backend:8000`.

`server.ts` **tidak punya langkah build**: Node >= 22.18 membuang anotasi tipenya
sendiri saat memuat file, jadi `node server.ts` cukup. Tapi Node type-stripping
**tidak** mentransform JSX, jadi render SSR (yang mengimpor pohon React) dibangun
terpisah oleh Vite ke `dist/server`; `server.ts` mengimpornya di prod, dan
memakai `vite.ssrLoadModule` di dev. Itu sebabnya `engines.node` minimal 22.18.

Skrip `dev` sengaja `node --watch-path=./server.ts` (bukan `--watch` polos):
Vite jalan di dalam proses dan menulis cache ke `node_modules/.vite`, dan
`--watch` polos akan menganggap tulisan itu perubahan lalu me-restart tanpa
henti. HMR sisi klien tetap ditangani Vite; Node cukup restart saat `server.ts`
berubah.

## Migrasi ke React (sedang berjalan)

Kode ini sedang dipindahkan dari SPA vanilla ke React + TypeScript. Sekarang
**react-router yang memegang seluruh aplikasi**: chrome (masthead/finder/footer),
veil, dan routing semuanya komponen React di `src/react/`. Titik masuknya
`src/react/entry.tsx` (createRoot ke `#root`); `index.html` tinggal shell minimal
+ stage WebGL statis.

Rute yang belum diport ke React asli dirender lewat **adapter** `LegacyRoute`:
ia menjalankan view legacy apa adanya - loader mengembalikan `{ title, desc,
stage, html, mount }`, adapter menaruh `html` ke sebuah `<div>` yang dikuasai
React lalu memanggil `mount()`, dan `killViewTriggers()` jalan saat rute
ditinggalkan. Jadi picker, autocomplete, galeri 3D - semua DOM imperatif itu -
tetap bekerja persis seperti sebelumnya, karena React hanya menguasai `<div>`
kosong pembungkusnya.

- React asli: `/` beranda, `/katalog`, `/konsultan` (pakai `Picker` React + hook autocomplete)
- React asli lewat island-adapter (belum di-loader): `/parfum/:slug`, `/bandingkan/:a/vs/:b`

Beranda dirender JSX (hero/duo/how/rail/konsultan), galeri 3D three.js + panel
geser dupe dinaikkan imperatif di browser (`routes/showcase-island.js`) - sama
seperti dulu: shell kirim shelf tautan, klien menaikkannya jadi 3D kalau WebGL
ada. `Picker` (`src/react/ui/Picker.tsx`) menggantikan `enhanceSelects` legacy:
combobox+listbox ARIA terkontrol penuh (value/options prop), bukan enhancement
di atas `<select>` yang akan berkelahi dengan reconciliation React.

Glue navigasi selama transisi: interseptor `<a>` global di `RootLayout`
meneruskan setiap link internal - termasuk yang dirender markup legacy - ke
react-router, dan `navigate()` legacy (dipakai autocomplete katalog) diarahkan
ke sana lewat `setNavigateHandler`.

Yang tersisa: port beranda/katalog/konsultan ke React asli (termasuk Picker +
autocomplete versi React), pasang **React SSR** (renderToString + hydrateRoot)
menggantikan SSR string-template - dimatikan sementara, seluruh app client-side
dulu - lalu pecah bundle per rute lagi dan hapus `src/legacy/`.

Lapisan inti (`src/lib/`) sudah TypeScript dan dipakai bersama React maupun
legacy, jadi modul legacy yang tersisa mengimpornya lewat jalur `../lib/*.ts`.

### Dua jaring pengaman dari tipe

`t()` hanya menerima kunci yang benar-benar ada, dan `ID` dinyatakan
`satisfies Record<MessageKey, string>` - jadi terjemahan yang tertinggal
gagal saat kompilasi, bukan muncul diam-diam sebagai teks Inggris di
antarmuka berbahasa Indonesia. Kunci yang dirakit runtime tetap aman selama
bagian yang berubah bertipe union tertutup (`relation.${RelationType}`
dihitung TypeScript jadi union kunci yang nyata). Untuk nilai bebas bentuk
dari katalog - `gender` misalnya - pakai `tryT()`, yang mengembalikan
cadangan alih-alih menuliskan kunci mentah ke layar.

`api-types.ts` mengikuti backend apa adanya, termasuk hal-hal yang mudah
salah dibaca: tier notes yang kosong berarti *tidak diketahui* dan bukan
*datar*; `semantic_similarity` hanya terisi di daftar `similar`; dan
`score_breakdown.notes` adalah rollup dari keempat `notes_*` sehingga
menjumlahkan seluruh nilainya akan menghitung ganda.

## Rute (History API, fallback ke shell oleh `server.ts`)

- `/` beranda: hero, galeri botol 3D, pasangan tersorot (KF-10), konsultan aroma
- `/katalog` katalog + pencarian autocomplete + filter + pagination (KF-01..03, KF-09)
- `/parfum/:slug` detail + piramida notes + daftar dupe berskor (KF-04..06, KF-08)
- `/bandingkan/:a/vs/:b` perbandingan berdampingan (KF-07..08)

## Struktur

- `server.ts` Express: kompresi, proxy `/v1`, aset, SSR (/ , /konsultan), fallback shell
- `index.html` shell (`#root` + stage WebGL statis); Vite menyisipkan aset ber-hash
- `src/entry-client.ts` titik masuk browser (css -> vendor -> `react/entry`)
- `src/react/entry-server.tsx` render SSR (createStaticHandler + renderToString), dibundel ke `dist/server`
- `src/react/routes.tsx` definisi rute dipakai bareng klien + server SSR
- `src/app.css` seluruh gaya, di-minify dan diberi hash oleh Vite
- `src/lib/vendor.ts` memasang `window.gsap`/`Lenis` untuk modul legacy
- `src/lib/api-types.ts` bentuk kontrak API v1, diturunkan dari model Pydantic backend
- `src/lib/messages.ts` kamus teks EN/ID; kunci EN mendefinisikan `MessageKey`
- `src/lib/i18n.ts` locale + `t()` bertipe kunci
- `src/lib/config.ts` konstanta (keluarga aroma, rentang harga, kurasi showcase)
- `src/lib/api.ts` lapisan fetch + cache singkat + klien SSE rekomendasi
- `src/lib/format.ts` util murni: rupiah, overlap notes (Jaccard), wording confidence
- `src/react/entry.tsx` boot browser: `initMotion()` lalu hydrateRoot / createRoot (lihat SSR)
- `src/react/App.tsx` RootLayout: chrome + `<Outlet>` + glue navigasi/scroll/finder
- `src/react/chrome/*.tsx` Masthead, Finder, Footer, Veil
- `src/react/i18n.tsx` `useLocale()`/`useT()` - jembatan lib/i18n ke React (useSyncExternalStore)
- `src/react/LegacyRoute.tsx` adapter yang menjalankan view legacy di pohon react-router
- `src/react/meta.ts` / `reveal.ts` hook meta rute + reveal-on-scroll untuk rute React asli
- `src/react/ui/Picker.tsx` combobox+listbox ARIA terkontrol (pengganti enhanceSelects)
- `src/react/ui/useAutocomplete.ts` hook pembungkus autocomplete legacy ke input React
- `src/react/island.ts` `mountIsland()` - jembatan `createRoot` ke kontrak `view.mount()`
- `src/react/motion.ts` GSAP dari npm + `useGSAP` (scoped auto-cleanup); instans
  gsap yang sama dengan `motion.js`, jadi ScrollTrigger/Lenis-nya ikut berlaku
- `src/react/routes/*.tsx` satu modul per rute React (loader + komponen)
- `src/legacy/motion.js` GSAP/ScrollTrigger/SplitText/Lenis + fallback IntersectionObserver
- `src/legacy/router.js` sisa router lama; kini hanya `navigate()` + `setNavigateHandler`
  yang dipakai (diarahkan ke react-router)
- `src/legacy/picker.js` pengganti tampilan `<select>` (lihat di bawah)
- `src/legacy/webgl.ts` deteksi kelayakan WebGL + `perfTier()`, dipisah supaya bisa
  ditanya tanpa mengunduh three.js
- `src/legacy/showcase3d.ts` galeri botol 3D, di-`import()` dinamis; kualitas adaptif
  (tingkat awal per-perangkat + governor FPS yang menurunkan pixelRatio lalu bahan)
- `src/legacy/views/*.js` satu modul per halaman
- `src/legacy/views/*.markup.js` markup + pemuatan data yang murni, dipakai bareng SSR
- `public/` disajikan apa adanya di root: font, `background.js`, `runtime-env.js`,
  `robots.txt`, `sitemap.xml`, `THIRD-PARTY-LICENSES.txt`
- `scripts/licenses.mjs` menyusun berkas lisensi itu dari `node_modules`

`three` ada di `devDependencies`, bukan `dependencies`, dan itu tetap benar
setelah pindah ke npm: three hanya dibutuhkan **saat build**, karena Vite
membundelnya ke dalam chunk `showcase3d` yang di-`import()` dinamis. Image
produksi jalan dengan `npm ci --omit=dev` dan tidak pernah memuatnya dari
`node_modules`.

Minify membuang komentar legal, jadi lisensi pustaka yang ikut terbundel
(three, Lenis, React - MIT - serta GSAP) dikumpulkan ulang oleh
`scripts/licenses.mjs` saat `npm run build` dan disajikan di
`/THIRD-PARTY-LICENSES.txt`.

## Picker

`src/legacy/picker.js` menggantikan tampilan `<select>` bawaan browser, sebagai
progressive enhancement dan bukan pengganti: elemen `<select>` aslinya tetap
di DOM dan tetap jadi sumber kebenaran, jadi `sel.value`, `FormData`, listener
`change`, render SSR, dan skenario tanpa JS semuanya tidak berubah.

Dua arah sinkronisasi yang perlu diketahui pemanggil:

- daftar `<option>` yang diganti dari luar (katalog mengisi ulang brand)
  tertangkap sendiri lewat `MutationObserver`;
- `.value` yang diubah dari kode **tidak** memicu event apa pun, jadi kabari
  picker-nya dengan `sel.dispatchEvent(new Event("picker:sync"))`. Sengaja
  bukan `"change"` - itu akan ikut menjalankan handler pemuatan data.

## Showcase 3D

Semua botol dibentuk prosedural dari `ExtrudeGeometry` di atas `Shape` 2D, jadi
tidak ada satu pun berkas model yang perlu diunduh atau dilisensikan. Lathe
sengaja tidak dipakai: flakon parfum hampir tidak pernah berpenampang
lingkaran, dan justru penampang pipih atau bersegi itulah yang membuatnya
terbaca sebagai botol parfum.

- `flask` / `slim` - siluet depan (persegi bersudut membulat) diekstrusi ke
  arah Z setebal botol; bevel membulatkan rusuk tegak dan rusuk depan-belakang
- `faceted` - penampang segi delapan diekstrusi ke atas setinggi botol; bevel
  jadi talang di bibir atas dan alas
- tutup beralur dibentuk dari lingkaran yang jari-jarinya dimodulasi sinus

Peta lingkungan untuk pantulan kacanya dibuat dari kanvas 2D, bukan HDRI.

Permukaan cairan dimiringkan di vertex shader: simpul di atas ambang `uFill`
digeser ke bidang miring `uTilt`, normalnya ikut dihitung ulang supaya
kemiringannya benar-benar terbaca oleh cahaya. Kemiringan itu digerakkan pegas
teredam yang mengejar kecepatan sudut carousel, jadi cairannya tertinggal saat
rak mulai berputar lalu berayun sampai diam. Pendekatan clipping plane butuh
penutup stensil supaya isi botol tidak terlihat berlubang dari atas; cara ini
lebih murah dan tidak pernah bocor.

Satu jebakan yang sudah memakan korban: `dt` di loop render **wajib** dijepit
ke nilai positif. Stempel waktu `requestAnimationFrame` bisa mendahului
`performance.now()` yang dicatat saat loop dinyalakan, dan `dt` negatif membuat
`pow(0.0016, dt)` melompat di atas 1 - setiap lerp lalu menjauh dari targetnya
dan skala botol meledak dalam beberapa frame.

Tiga lapis penjagaan sebelum three.js (±360 KB) benar-benar diunduh: markup
dari server berisi daftar tautan asli, `canRender3d()` menolak perangkat tanpa
GPU dan `prefers-reduced-motion`, dan `import()`-nya baru jalan saat section-nya
mendekati viewport. Kalau salah satu gagal, rak HTML itu yang tetap jadi
antarmukanya - bukan kotak kosong.

## SSR + hidrasi (React)

`/` dan `/konsultan` dirender di Node sebelum dikirim lewat `renderToString`:
HTML-nya sudah berisi konten, jadi first paint tidak menunggu JS. Server
memakai `createStaticHandler` atas `routes` yang sama persis dengan klien,
menjalankan loader-nya (beranda mengambil data featured + showcase), lalu
`renderToString(<StaticRouterProvider>)`. Rendernya lewat bundel SSR terpisah -
`dist/server` di prod, `vite.ssrLoadModule` di dev - karena Node type-stripping
tidak mentransform JSX. Cakupannya sama seperti dulu; rute lain dirender klien.

Data hidrasi + locale server ditanam sebagai skrip **saudara** `#root` (bukan di
dalamnya, pakai `hydrate={false}`), jadi isi `#root` persis cocok dengan render
klien = hidrasi bersih. Klien `hydrateRoot` **hanya** kalau konten SSR ada DAN
bahasanya cocok dengan pilihan pengunjung. Kalau tidak - rute non-SSR, atau
pengunjung memilih bahasa lain dari default server - data hidrasi tetap dipakai
(isinya bebas-locale, jadi tak ada fetch ulang) tapi aplikasi dirender dari nol
lewat `createRoot`: `#root` ditulis ulang, jadi tak ada perbandingan DOM = tak
ada hydration mismatch. Itu mencerminkan cara router lama membuang payload SSR
saat locale beda. Kalau backend mati, render server dilewati dan halaman jatuh
ke shell kosong - tetap tayang, hanya sepenuhnya client-side.

Motion punya dua mode: `body[data-motion="gsap"]` (orkestrasi penuh) dan
`body[data-motion="css"]` (fallback IntersectionObserver + transition; juga
dipakai saat `prefers-reduced-motion`). Konten tidak pernah disembunyikan
permanen.

`public/runtime-env.js` menentukan `backendUrl` ("" = same-origin; `server.ts`
mem-proxy `/v1/*` ke container backend). Sengaja **di luar** bundle: nilainya
milik deployment, bukan milik build, sehingga satu image Docker bisa dipakai di
host mana pun tanpa build ulang. Jangan taruh secret apa pun di folder ini.

## Cache

Vite memberi nama ber-hash konten pada semua aset di `/assets`, jadi tidak ada
lagi `?v=` yang harus dinaikkan manual: nama filenya berubah sendiri kalau
isinya berubah. `server.ts` menyajikan `/assets` dan `/fonts` sebagai
`immutable` selama setahun, dan sisanya (`index.html`, `background.js`,
`runtime-env.js`) sebagai `no-cache` supaya deploy baru tidak mengendap di
cache edge.
