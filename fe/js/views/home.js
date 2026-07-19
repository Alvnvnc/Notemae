/* Beranda: hero + pasangan tersorot (KF-10) + cara kerja + rail dupe (KF-10)
   + konsultan aroma (KF-09 pendukung, /v1/recommendations). */

import { FEATURED_ORIGINALS, FAMILIES, STAGE_DEFAULT } from "../config.js";
import { getDupes, recommend, recommendFromText } from "../api.js";
import {
  escapeHtml, rupiah, rupiahCompact, displayName, noteOverlap, savings,
  relationClaim, renderMarkdown
} from "../format.js";
import { heroIntro, countUp, revealCards, scrollToEl } from "../motion.js";

function heroHtml() {
  return `
  <section class="hero shell" aria-labelledby="hero-title">
    <p class="hero__eyebrow">Panduan dupe parfum</p>
    <h1 class="h-display hero__title" id="hero-title">
      <span class="line"><span>Aroma kelas atas,</span></span>
      <span class="line"><span><em>harga masuk akal.</em></span></span>
    </h1>
    <div class="hero__foot">
      <p class="lede hero__lede">
        Temukan alternatif parfum favoritmu, lengkap dengan skor kemiripan
        notes dan hitungan penghematan yang jujur.
      </p>
      <a class="btn" href="/katalog">Jelajahi katalog</a>
      <a class="link-quiet" href="/#pasangan">Lihat pasangan tersorot</a>
    </div>
  </section>`;
}

function duoSkeleton() {
  return `
  <div class="duo__stage" aria-hidden="true">
    <div class="duo__side skel"><i></i><i></i><i></i><i></i></div>
    <div class="duo__mid skel"><i></i><i></i></div>
    <div class="duo__side skel"><i></i><i></i><i></i><i></i></div>
  </div>`;
}

function duoHtml() {
  return `
  <section class="duo sect shell" id="pasangan" aria-labelledby="duo-title">
    <h2 class="h-sect" id="duo-title" data-reveal>Pasangan tersorot.</h2>
    <div class="duo__pick" id="duo-pick" role="group" aria-label="Pilih parfum original" data-reveal></div>
    <div id="duo-stage-wrap" aria-live="polite">${duoSkeleton()}</div>
    <div class="duo__foot">
      <p class="duo__claim" id="duo-claim"></p>
      <div id="duo-cta"></div>
    </div>
  </section>`;
}

function howHtml() {
  return `
  <section class="how sect shell" aria-labelledby="how-title">
    <h2 class="h-sect" id="how-title" data-reveal>Tiga langkah, tanpa tebak-tebakan.</h2>
    <ol class="how__list" style="margin-top: clamp(36px, 5vw, 64px)">
      <li class="how__item" data-reveal>
        <h3>Pilih parfum originalnya</h3>
        <p>Cari lewat nama, brand, atau notes yang kamu sukai di katalog.</p>
      </li>
      <li class="how__item" data-reveal>
        <h3>Baca skor kemiripannya</h3>
        <p>Skor dihitung dari kesamaan komposisi notes di katalog, bukan klaim iklan.</p>
      </li>
      <li class="how__item" data-reveal>
        <h3>Bandingkan, lalu putuskan</h3>
        <p>Perbandingan berdampingan menunjukkan notes yang sama, yang beda, dan selisih harganya.</p>
      </li>
    </ol>
  </section>`;
}

function railHtml() {
  return `
  <section class="rail sect shell" aria-labelledby="rail-title">
    <div class="rail__head">
      <h2 class="h-sect" id="rail-title" data-reveal>Dupe dengan konsensus tertinggi.</h2>
      <a class="link-quiet" href="/katalog" data-reveal>Semua parfum</a>
    </div>
    <div class="rail__track" id="rail-track" role="list"></div>
  </section>`;
}

function consultHtml() {
  return `
  <section class="consult sect shell" id="konsultan" aria-labelledby="consult-title">
    <div class="consult__grid">
      <div class="consult__copy">
        <h2 class="h-sect" id="consult-title" data-reveal>Belum tahu mulai dari mana?</h2>
        <p class="lede" data-reveal>
          Ceritakan seleramu dengan bahasa sehari-hari, atau isi parameternya.
          Rekomendasi selalu diambil dari catatan katalog, tidak pernah dikarang.
        </p>
        <div class="consult__notes" data-reveal aria-hidden="true">
          ${FAMILIES.map((f) => `<span class="tag">${f.name}</span>`).join("")}
        </div>
      </div>
      <div>
        <form class="consult__form" id="consult-form" novalidate data-reveal>
          <label class="field field--wide">
            <span>Ceritakan seleramu</span>
            <textarea name="profile" rows="3"
              placeholder="Saya cari parfum kantor di Jakarta, budget sekitar Rp1,5 juta. Suka citrus dan iris, kurang suka yang terlalu manis."></textarea>
          </label>
          <label class="field">
            <span>Acara</span>
            <select name="occasion">
              <option value="office">Kantor</option>
              <option value="date">Kencan</option>
              <option value="casual">Harian</option>
              <option value="party">Malam</option>
            </select>
          </label>
          <label class="field">
            <span>Iklim</span>
            <select name="climate">
              <option value="tropical">Tropis</option>
              <option value="warm">Hangat</option>
              <option value="mild">Sejuk</option>
              <option value="hot">Panas</option>
            </select>
          </label>
          <label class="field">
            <span>Budget (Rp)</span>
            <input name="budget" type="number" inputmode="numeric" min="0" step="50000" value="1500000" />
          </label>
          <label class="field">
            <span>Notes yang disukai</span>
            <input name="notes" type="text" placeholder="iris, citrus, cedar" />
          </label>
          <button class="btn" id="consult-submit" type="submit">
            <span>Minta rekomendasi</span><span class="spin" aria-hidden="true"></span>
          </button>
        </form>
        <p class="status" id="consult-status" role="status" style="margin-top:14px"></p>
        <article class="rec" id="consult-result" hidden></article>
      </div>
    </div>
  </section>`;
}

/* ---- perakitan data pasangan tersorot ------------------------------------ */
function bestDupe(bundle) {
  const list = (bundle.dupes || []).slice().sort((x, y) => y.confidence - x.confidence);
  return list[0] || null;
}

function renderDuoStage(wrap, claimEl, ctaEl, bundle) {
  const ori = bundle.fragrance;
  const rel = bestDupe(bundle);
  const dup = rel.fragrance;
  const ov = noteOverlap(ori.notes, dup.notes);
  const save = savings(ori.price_idr, dup.price_idr);

  wrap.innerHTML = `
  <div class="duo__stage" id="duo-stage">
    <div class="duo__side duo__side--ori">
      <p class="duo__role">Original</p>
      <p class="duo__name">${escapeHtml(displayName("", ori.name))}</p>
      <p class="duo__brand">${escapeHtml(ori.brand)}</p>
      <p class="duo__price">${escapeHtml(rupiah(ori.price_idr))}</p>
    </div>
    <div class="duo__mid">
      <p class="duo__save-label">${save ? "Hemat" : "Kemiripan"}</p>
      <p class="duo__save" id="duo-save" data-target="${save ? save.pct : ov.pct}">0%</p>
      <p class="duo__overlap">${ov.shared.length} dari ${new Set([...ov.shared, ...ov.onlyA]).size} notes original ada di alternatifnya</p>
    </div>
    <div class="duo__side duo__side--dup">
      <p class="duo__role">Alternatif</p>
      <p class="duo__name">${escapeHtml(displayName("", dup.name))}</p>
      <p class="duo__brand">${escapeHtml(dup.brand)}</p>
      <p class="duo__price">${escapeHtml(rupiah(dup.price_idr))}</p>
    </div>
  </div>`;

  claimEl.textContent = relationClaim(rel.relation, rel.confidence, displayName(ori.brand, ori.name));
  ctaEl.innerHTML = `<a class="btn btn--ghost" href="/bandingkan/${encodeURIComponent(ori.slug)}/vs/${encodeURIComponent(dup.slug)}">Lihat perbandingan lengkap</a>`;

  const saveEl = wrap.querySelector("#duo-save");
  countUp(saveEl, Number(saveEl.dataset.target), {
    render: (v) => { saveEl.textContent = `${v}%`; }
  });

  if (window.gsap && document.body.getAttribute("data-motion") === "gsap") {
    window.gsap.fromTo(
      wrap.querySelectorAll(".duo__side, .duo__mid"),
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.08, clearProps: "opacity,visibility,transform" }
    );
  }
}

function renderRail(track, bundles) {
  const pairs = [];
  for (const b of bundles) {
    for (const rel of b.dupes || []) {
      pairs.push({ ori: b.fragrance, rel, dup: rel.fragrance });
    }
  }
  pairs.sort((x, y) => y.rel.confidence - x.rel.confidence);
  if (!pairs.length) { track.closest(".rail").hidden = true; return; }

  track.innerHTML = pairs
    .map(({ ori, rel, dup }) => {
      const save = savings(ori.price_idr, dup.price_idr);
      const ov = noteOverlap(ori.notes, dup.notes);
      return `
      <a class="pair-card" role="listitem" href="/bandingkan/${encodeURIComponent(ori.slug)}/vs/${encodeURIComponent(dup.slug)}"
         aria-label="Bandingkan ${escapeHtml(displayName(dup.brand, dup.name))} dengan ${escapeHtml(displayName(ori.brand, ori.name))}">
        <p class="pair-card__dupe">${escapeHtml(displayName(dup.brand, dup.name))}</p>
        <p class="pair-card__ori">${escapeHtml(`vs ${displayName(ori.brand, ori.name)}`)}</p>
        <div class="pair-card__meta">
          <span class="pair-card__save">${save ? `Hemat ${save.pct}%` : `${ov.pct}% notes mirip`}</span>
          <span class="pair-card__price">${escapeHtml(rupiahCompact(dup.price_idr))}</span>
        </div>
      </a>`;
    })
    .join("");
  revealCards(Array.from(track.children));
}

/* ---- konsultan ----------------------------------------------------------- */
function bindConsult(root) {
  const form = root.querySelector("#consult-form");
  const statusEl = root.querySelector("#consult-status");
  const result = root.querySelector("#consult-result");
  const submit = root.querySelector("#consult-submit");
  let busy = false;

  const setStatus = (text, tone) => {
    statusEl.textContent = text;
    if (tone) statusEl.setAttribute("data-tone", tone);
    else statusEl.removeAttribute("data-tone");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    submit.setAttribute("data-busy", "true");
    setStatus("Mencocokkan dengan katalog...");
    result.hidden = true;

    const fd = new FormData(form);
    const profileText = String(fd.get("profile") || "").trim();
    const budget = Number(fd.get("budget")) || 0;

    try {
      const data = profileText
        ? await recommendFromText(profileText)
        : await recommend({
            occasion: fd.get("occasion"),
            climate: fd.get("climate"),
            budget_idr: budget || null,
            preferred_notes: String(fd.get("notes") || "")
              .split(",").map((s) => s.trim()).filter(Boolean),
            limit: 3
          });

      const rec = data.recommendation || {};
      const top = (data.matches && data.matches[0]) || null;
      const alts = (data.alternatives || [])
        .map((a) => escapeHtml(displayName(a.brand, a.name)))
        .join(", ");

      result.innerHTML = `
        <p class="rec__eyebrow">Rekomendasi untukmu</p>
        <h3 class="rec__name">${escapeHtml(displayName(rec.brand, rec.name))}</h3>
        ${top && typeof top.score === "number" ? `<p class="rec__score">Skor kecocokan ${top.score} dari 100</p>` : ""}
        <div class="rec__body">${renderMarkdown(data.explanation || "")}</div>
        ${alts ? `<p class="rec__alt"><strong>Pertimbangkan juga:</strong> ${alts}</p>` : ""}
        ${rec.slug ? `<p class="rec__alt" style="margin-top:20px"><a class="btn btn--ghost" href="/parfum/${encodeURIComponent(rec.slug)}">Lihat detail dan dupenya</a></p>` : ""}
      `;
      result.hidden = false;
      setStatus(data.generated_by === "catalog_fallback"
        ? "Rekomendasi berbasis katalog."
        : "Penjelasan ditulis AI, dibatasi data katalog.");
      if (window.gsap && document.body.getAttribute("data-motion") === "gsap") {
        window.gsap.fromTo(result, { y: 18, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.6, ease: "power3.out", clearProps: "opacity,visibility,transform" });
      }
      scrollToEl(result);
    } catch {
      setStatus("Konsultan sedang tidak tersedia. Coba lagi sebentar lagi.", "error");
    } finally {
      busy = false;
      submit.removeAttribute("data-busy");
    }
  });
}

/* ---- view ---------------------------------------------------------------- */
export async function homeView() {
  return {
    title: "",
    desc: "Panduan dupe parfum dengan skor kemiripan notes, perbandingan berdampingan, dan hitungan penghematan.",
    curtainWord: "Beranda",
    stage: true,
    html: heroHtml() + duoHtml() + howHtml() + railHtml() + consultHtml(),
    async mount(root) {
      if (window.ScentBG) window.ScentBG.setFamily(STAGE_DEFAULT.a, STAGE_DEFAULT.b);
      heroIntro(root);
      bindConsult(root);

      // latar WebGL meredup begitu konten kurasi masuk, supaya angka dan
      // teks perbandingan tetap jadi fokus (scrub, hanya mode gsap)
      if (window.gsap && document.body.getAttribute("data-motion") === "gsap") {
        window.gsap.fromTo(".stage", { opacity: 1 }, {
          opacity: 0.18, ease: "none",
          scrollTrigger: {
            trigger: root.querySelector(".duo"),
            start: "top 85%", end: "top 25%", scrub: true
          }
        });
      }

      const pick = root.querySelector("#duo-pick");
      const wrap = root.querySelector("#duo-stage-wrap");
      const claimEl = root.querySelector("#duo-claim");
      const ctaEl = root.querySelector("#duo-cta");
      const track = root.querySelector("#rail-track");
      let disposed = false;

      // Ambil bundel dupe tiap original unggulan; yang gagal dilewati.
      const clearStage = () => {
        if (window.gsap) window.gsap.set(".stage", { clearProps: "opacity" });
      };

      const settled = await Promise.allSettled(FEATURED_ORIGINALS.map((slug) => getDupes(slug)));
      if (disposed) return () => {};
      const bundles = settled
        .filter((s) => s.status === "fulfilled" && s.value && (s.value.dupes || []).length)
        .map((s) => s.value);

      if (!bundles.length) {
        wrap.innerHTML = `
          <div class="empty">
            <p class="h-sect">Kurasi belum tersedia.</p>
            <p>Data pasangan tersorot tidak bisa dimuat. Katalog tetap bisa dijelajahi.</p>
            <a class="btn btn--ghost" href="/katalog">Buka katalog</a>
          </div>`;
        track.closest(".rail").hidden = true;
        return () => { disposed = true; clearStage(); };
      }

      pick.innerHTML = bundles
        .map((b, i) =>
          `<button class="chip" type="button" data-index="${i}" aria-pressed="${i === 0}">
             ${escapeHtml(displayName(b.fragrance.brand, b.fragrance.name))}
           </button>`)
        .join("");

      renderDuoStage(wrap, claimEl, ctaEl, bundles[0]);
      renderRail(track, bundles);

      pick.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-index]");
        if (!btn) return;
        pick.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
        renderDuoStage(wrap, claimEl, ctaEl, bundles[Number(btn.dataset.index)]);
      });

      return () => { disposed = true; clearStage(); };
    }
  };
}
