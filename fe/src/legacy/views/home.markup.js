/* Markup beranda + pengambilan datanya, tanpa satu pun sentuhan DOM.
   Modul ini sengaja bebas `window`/`document` supaya bisa diimpor dua kali:
   - di server.js untuk render SSR (HTML sudah berisi konten saat first paint)
   - di browser oleh home.js untuk re-render bagian yang interaktif
   Semua orkestrasi gerak dan event ada di home.js. */

import { SHOWCASE } from "../../lib/config.ts";
import { getFeatured, searchFragrances } from "../../lib/api.ts";
import {
  escapeHtml, rupiah, rupiahCompact, displayName, noteOverlap, savings,
  relationClaim
} from "../../lib/format.ts";
import { t } from "../../lib/i18n.ts";
import { consultHtml } from "./consult.markup.js";

/* ---- data ---------------------------------------------------------------- */

/** Satu-satunya sumber data beranda. Dipakai server maupun klien. */
export async function loadHome({ signal } = {}) {
  // Dua permintaan yang tidak saling bergantung; salah satunya gagal tidak
  // boleh mengosongkan yang lain, jadi masing-masing punya penangkapnya.
  const [bundles, shelf] = await Promise.all([
    getFeatured({ signal }).catch(() => []),
    searchFragrances({ signal }).catch(() => [])
  ]);
  return {
    bundles: bundles.filter((b) => (b.dupes || []).length),
    showcase: pickShowcase(shelf)
  };
}

/* Slug kurasi di config hanya menentukan urutan yang diinginkan. Yang tidak
   ada di katalog dilewati, lalu daftarnya ditambal dari katalog sampai penuh -
   galeri tidak boleh berlubang hanya karena satu slug berganti nama. */
export function pickShowcase(shelf) {
  if (!shelf.length) return [];
  const bySlug = new Map(shelf.map((f) => [f.slug, f]));
  const taken = new Set();
  const out = [];

  for (const entry of SHOWCASE) {
    const f = bySlug.get(entry.slug);
    if (!f) continue;
    taken.add(f.slug);
    out.push({ ...entry, fragrance: f });
  }
  for (const f of shelf) {
    if (out.length >= SHOWCASE.length) break;
    if (taken.has(f.slug)) continue;
    // Sisa slot memakai arah seni dari entri kurasi pada posisi yang sama,
    // supaya botol tambalan tetap sewarna keluarga dengan yang lain.
    out.push({ ...SHOWCASE[out.length % SHOWCASE.length], slug: f.slug, fragrance: f });
    taken.add(f.slug);
  }
  return out;
}

export function bestDupe(bundle) {
  const list = (bundle.dupes || []).slice().sort((x, y) => y.confidence - x.confidence);
  return list[0] || null;
}

/* ---- potongan markup ----------------------------------------------------- */

export function heroHtml() {
  return `
  <section class="hero shell" aria-labelledby="hero-title">
    <p class="hero__eyebrow">${t("home.eyebrow")}</p>
    <h1 class="h-display hero__title" id="hero-title">
      <span class="line"><span>${t("home.hero1")}</span></span>
      <span class="line"><span><em>${t("home.hero2")}</em></span></span>
    </h1>
    <div class="hero__foot">
      <p class="lede hero__lede">
        ${t("home.lede")}
      </p>
      <a class="btn" href="/katalog">${t("home.browse")}</a>
      <a class="link-quiet" href="/#pasangan">${t("home.featured")}</a>
    </div>
  </section>`;
}

export function duoPickHtml(bundles) {
  return bundles
    .map((b, i) =>
      `<button class="chip" type="button" data-index="${i}" aria-pressed="${i === 0}">
         ${escapeHtml(displayName(b.fragrance.brand, b.fragrance.name))}
       </button>`)
    .join("");
}

export function duoStageHtml(bundle) {
  const ori = bundle.fragrance;
  const rel = bestDupe(bundle);
  const dup = rel.fragrance;
  const ov = noteOverlap(ori.notes, dup.notes);
  const save = savings(ori.price_idr, dup.price_idr);
  const target = save ? save.pct : ov.pct;

  return `
  <div class="duo__stage" id="duo-stage">
    <div class="duo__side duo__side--ori">
      <p class="duo__role">${t("role.original")}</p>
      <p class="duo__name">${escapeHtml(displayName("", ori.name))}</p>
      <p class="duo__brand">${escapeHtml(ori.brand)}</p>
      <p class="duo__price">${escapeHtml(rupiah(ori.price_idr))}</p>
    </div>
    <div class="duo__mid">
      <p class="duo__save-label">${save ? t("common.savings") : t("common.similarity")}</p>
      <p class="duo__save" id="duo-save" data-target="${target}">${target}%</p>
      <p class="duo__overlap">${ov.shared.length} / ${new Set([...ov.shared, ...ov.onlyA]).size} ${t("common.notes").toLowerCase()}</p>
    </div>
    <div class="duo__side duo__side--dup">
      <p class="duo__role">${t("role.alternative")}</p>
      <p class="duo__name">${escapeHtml(displayName("", dup.name))}</p>
      <p class="duo__brand">${escapeHtml(dup.brand)}</p>
      <p class="duo__price">${escapeHtml(rupiah(dup.price_idr))}</p>
    </div>
  </div>`;
}

export function duoClaim(bundle) {
  const ori = bundle.fragrance;
  const rel = bestDupe(bundle);
  return relationClaim(rel.relation, rel.confidence, displayName(ori.brand, ori.name));
}

export function duoCtaHtml(bundle) {
  const ori = bundle.fragrance;
  const dup = bestDupe(bundle).fragrance;
  return `<a class="btn btn--ghost" href="/bandingkan/${encodeURIComponent(ori.slug)}/vs/${encodeURIComponent(dup.slug)}">${t("common.detail")}</a>`;
}

export function duoEmptyHtml() {
  return `
  <div class="empty">
    <p class="h-sect">${t("detail.noDupes")}</p>
    <p>${t("catalog.error")}</p>
    <a class="btn btn--ghost" href="/katalog">${t("home.browse")}</a>
  </div>`;
}

export function duoHtml(bundles) {
  const has = bundles.length > 0;
  return `
  <section class="duo sect shell" id="pasangan" aria-labelledby="duo-title">
    <h2 class="h-sect" id="duo-title" data-reveal>${t("home.pairs")}</h2>
    <div class="duo__pick" id="duo-pick" role="group" aria-label="${t("home.pick")}" data-reveal>${has ? duoPickHtml(bundles) : ""}</div>
    <div id="duo-stage-wrap" aria-live="polite">${has ? duoStageHtml(bundles[0]) : duoEmptyHtml()}</div>
    <div class="duo__foot">
      <p class="duo__claim" id="duo-claim">${has ? escapeHtml(duoClaim(bundles[0])) : ""}</p>
      <div id="duo-cta">${has ? duoCtaHtml(bundles[0]) : ""}</div>
    </div>
  </section>`;
}

/* ---- showcase 3D ---------------------------------------------------------
   Markup ini harus berdiri sendiri lebih dulu: yang dikirim server adalah
   daftar tautan asli ke tiap parfum. js/showcase3d.js baru menimpanya dengan
   kanvas setelah WebGL terbukti ada dan three.js selesai diunduh. Urutan itu
   disengaja - tanpa GPU, tanpa JS, atau saat unduhan gagal, yang tersisa
   tetap galeri yang bisa diklik, bukan kotak kosong. */
export function showcaseHtml(items) {
  if (!items.length) return "";
  const first = items[0].fragrance;
  return `
  <section class="showcase sect" id="koleksi" aria-labelledby="showcase-title" data-showcase>
    <div class="showcase__head shell">
      <h2 class="h-sect" id="showcase-title" data-reveal>${t("home.showcase")}</h2>
      <p class="lede showcase__lede" data-reveal>${t("home.showcaseLede")}</p>
    </div>

    <div class="showcase__stage" id="showcase-stage">
      <canvas class="showcase__canvas" id="showcase-canvas" hidden></canvas>

      <ol class="showcase__shelf" id="showcase-shelf">
        ${items.map((it, i) => `
          <li class="showcase__slot" data-slot="${i}">
            <a class="bottle" href="/parfum/${encodeURIComponent(it.fragrance.slug)}" data-link
               style="--glass:${it.glass};--liquid:${it.liquid};--cap:${it.metal}">
              <span class="bottle__art" aria-hidden="true">
                <i class="bottle__cap"></i><i class="bottle__neck"></i><i class="bottle__body"></i>
              </span>
              <span class="bottle__brand">${escapeHtml(it.fragrance.brand)}</span>
              <span class="bottle__name">${escapeHtml(displayName("", it.fragrance.name))}</span>
            </a>
          </li>`).join("")}
      </ol>

      <div class="showcase__hud" id="showcase-hud" hidden>
        <button class="showcase__step" type="button" data-step="-1" aria-label="${t("home.showcasePrev")}">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <p class="showcase__now" aria-live="polite">
          <span class="showcase__now-brand" id="showcase-brand">${escapeHtml(first.brand)}</span>
          <span class="showcase__now-name" id="showcase-name">${escapeHtml(displayName("", first.name))}</span>
        </p>
        <button class="showcase__step" type="button" data-step="1" aria-label="${t("home.showcaseNext")}">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="btn btn--ghost showcase__open" type="button" id="showcase-open">${t("home.showcaseOpen")}</button>
      </div>
    </div>

    <!-- Panel geser, bukan modal: isinya bacaan sekunder, dan halaman di
         belakangnya tetap jadi konteks yang berguna. -->
    <aside class="sheet" id="dupe-sheet" role="dialog" aria-modal="true"
           aria-labelledby="dupe-sheet-title" hidden>
      <div class="sheet__panel">
        <header class="sheet__head">
          <p class="sheet__role">${t("role.original")}</p>
          <h3 class="sheet__title" id="dupe-sheet-title"></h3>
          <p class="sheet__brand" id="dupe-sheet-brand"></p>
          <button class="sheet__close" type="button" id="dupe-sheet-close" aria-label="${t("nav.close")}">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke-linecap="round"/></svg>
          </button>
        </header>
        <div class="sheet__body" id="dupe-sheet-body"></div>
      </div>
    </aside>
  </section>`;
}

/* Isi panel dupe.

   Endpoint mengembalikan dua hal yang bentuknya berbeda dan tidak boleh
   dicampur diam-diam:
   - `dupes`   : {relation, confidence, fragrance} - kurasi konsensus komunitas
   - `similar` : objek parfum polos + semantic_similarity - hitungan mesin

   Sebagian besar katalog belum punya dupe terkurasi, jadi panel jatuh ke
   `similar` supaya tidak berakhir kosong - tapi labelnya harus mengatakan
   dengan jelas mana yang mana. Halaman detail sudah membedakan keduanya;
   panel ini mengikuti aturan yang sama. */
export function dupeSheetHtml(original, bundle) {
  const curated = (bundle.dupes || []).slice().sort((a, b) => b.confidence - a.confidence);
  const rows = curated.length
    ? curated.map((rel) => ({
        fragrance: rel.fragrance,
        claim: relationClaim(rel.relation, rel.confidence, displayName(original.brand, original.name))
      }))
    : (bundle.similar || []).map((f) => ({ fragrance: f, claim: "" }));

  if (!rows.length) {
    return `<p class="sheet__empty">${t("detail.noDupes")}</p>`;
  }
  const note = curated.length
    ? t("detail.sorted", { count: curated.length })
    : t("home.sheetSimilar", { count: rows.length });

  return `
    <p class="sheet__count"${curated.length ? "" : ' data-tone="soft"'}>${note}</p>
    <ol class="sheet__list">
      ${rows.map(({ fragrance: d, claim }) => {
        const ov = noteOverlap(original.notes, d.notes);
        const save = savings(original.price_idr, d.price_idr);
        return `
        <li class="sheet__item">
          <a class="sheet__link" href="/parfum/${encodeURIComponent(d.slug)}" data-link>
            <span class="sheet__item-head">
              <span class="sheet__item-name">${escapeHtml(displayName("", d.name))}</span>
              <span class="sheet__item-brand">${escapeHtml(d.brand)}</span>
            </span>
            <span class="sheet__stats">
              <span class="sheet__stat">
                <b>${ov.pct}%</b><i>${t("common.similarity")}</i>
              </span>
              ${save ? `<span class="sheet__stat sheet__stat--save">
                <b>${save.pct}%</b><i>${t("common.savings")}</i>
              </span>` : ""}
              <span class="sheet__stat">
                <b>${escapeHtml(rupiahCompact(d.price_idr))}</b><i>${t("detail.price")}</i>
              </span>
            </span>
            ${claim ? `<span class="sheet__claim">${escapeHtml(claim)}</span>` : ""}
          </a>
          <a class="sheet__vs" href="/bandingkan/${encodeURIComponent(original.slug)}/vs/${encodeURIComponent(d.slug)}" data-link>${t("common.compare")}</a>
        </li>`;
      }).join("")}
    </ol>`;
}

export function howHtml() {
  return `
  <section class="how sect shell" aria-labelledby="how-title">
    <h2 class="h-sect" id="how-title" data-reveal>${t("home.steps")}</h2>
    <ol class="how__list" style="margin-top: clamp(36px, 5vw, 64px)">
      <li class="how__item" data-reveal>
        <h3>${t("home.step1")}</h3><p>${t("home.step1p")}</p>
      </li>
      <li class="how__item" data-reveal>
        <h3>${t("home.step2")}</h3><p>${t("home.step2p")}</p>
      </li>
      <li class="how__item" data-reveal>
        <h3>${t("home.step3")}</h3><p>${t("home.step3p")}</p>
      </li>
    </ol>
  </section>`;
}

export function pairCardsHtml(bundles) {
  const pairs = [];
  for (const b of bundles) {
    for (const rel of b.dupes || []) {
      pairs.push({ ori: b.fragrance, rel, dup: rel.fragrance });
    }
  }
  pairs.sort((x, y) => y.rel.confidence - x.rel.confidence);
  return pairs
    .map(({ ori, rel, dup }) => {
      const save = savings(ori.price_idr, dup.price_idr);
      const ov = noteOverlap(ori.notes, dup.notes);
      return `
      <a class="pair-card" role="listitem" href="/bandingkan/${encodeURIComponent(ori.slug)}/vs/${encodeURIComponent(dup.slug)}"
         aria-label="${t("common.compare")} ${escapeHtml(displayName(dup.brand, dup.name))} / ${escapeHtml(displayName(ori.brand, ori.name))}">
        <p class="pair-card__dupe">${escapeHtml(displayName(dup.brand, dup.name))}</p>
        <p class="pair-card__ori">${escapeHtml(`vs ${displayName(ori.brand, ori.name)}`)}</p>
        <div class="pair-card__meta">
          <span class="pair-card__save">${save ? `${t("common.savings")} ${save.pct}%` : `${ov.pct}% ${t("common.similarity")}`}</span>
          <span class="pair-card__price">${escapeHtml(rupiahCompact(dup.price_idr))}</span>
        </div>
      </a>`;
    })
    .join("");
}

export function railHtml(bundles) {
  const cards = pairCardsHtml(bundles);
  return `
  <section class="rail sect shell" aria-labelledby="rail-title"${cards ? "" : " hidden"}>
    <div class="rail__head">
      <h2 class="h-sect" id="rail-title" data-reveal>${t("home.consensus")}</h2>
      <a class="link-quiet" href="/katalog" data-reveal>${t("home.all")}</a>
    </div>
    <div class="rail__track" id="rail-track" role="list">${cards}</div>
  </section>`;
}

/* ---- halaman ------------------------------------------------------------- */

/** @param {{ bundles?: any[], showcase?: any[] }} [data] hasil loadHome() */
export function homeMarkup({ bundles = [], showcase = [] } = {}) {
  return heroHtml() + showcaseHtml(showcase) + duoHtml(bundles) + howHtml() + railHtml(bundles) + consultHtml();
}

export const homeMeta = () => ({
  title: "",
  desc: t("home.lede"),
  stage: true
});
