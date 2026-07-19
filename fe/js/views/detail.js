/* Detail parfum (KF-04) + rekomendasi dupe terurut (KF-05), skor kemiripan
   notes (KF-06), dan penghematan harga (KF-08). Penjelasan AI opsional
   memakai GET /v1/fragrances/{slug}/dupes?explain=true. */

import { getFragrance, getDupes } from "../api.js";
import {
  escapeHtml, rupiah, displayName, noteOverlap, savings, relationClaim,
  relationLabel, genderLabel, occasionLabel, climateLabel, splitPyramid,
  renderMarkdown
} from "../format.js";
import { riseLines, countUp, growBars, pyramidReveal, refreshTriggers } from "../motion.js";

function pyramidHtml(f) {
  const tiers = splitPyramid(f.notes);
  if (!tiers) {
    if (!(f.notes || []).length) return "";
    return `
    <div data-reveal>
      <h2 class="h-sect">Komposisi aroma.</h2>
      <div class="detail__tags" style="margin-top:18px">
        ${f.notes.map((n) => `<span class="tag" style="text-transform:capitalize">${escapeHtml(n)}</span>`).join("")}
      </div>
    </div>`;
  }
  const tier = (key, label, notes) => `
    <div class="pyramid__tier" data-tier="${key}">
      <p class="pyramid__label">${label}</p>
      <p class="pyramid__notes">${notes.map((n) => `<span>${escapeHtml(n)}</span>`).join("")}</p>
    </div>`;
  return `
  <div>
    <h2 class="h-sect" data-reveal>Piramida notes.</h2>
    <div class="pyramid">
      ${tier("top", "Top", tiers.top)}
      ${tier("heart", "Heart", tiers.heart)}
      ${tier("base", "Base", tiers.base)}
    </div>
    <p class="pyramid__hint">Pembagian tier diperkirakan dari urutan data notes di katalog.</p>
  </div>`;
}

function dupeRowHtml(original, rel) {
  const d = rel.fragrance;
  const ov = noteOverlap(original.notes, d.notes);
  const save = savings(original.price_idr, d.price_idr);
  const oriTotal = new Set([...ov.shared, ...ov.onlyA]).size;
  return `
  <article class="dupe">
    <div>
      <h3 class="dupe__name"><a href="/parfum/${encodeURIComponent(d.slug)}">${escapeHtml(displayName(d.brand, d.name))}</a></h3>
      <p class="dupe__claim">${escapeHtml(relationClaim(rel.relation, rel.confidence, displayName(original.brand, original.name)))}</p>
      <div class="dupe__facts">
        <span class="dupe__fact">Relasi <strong>${escapeHtml(relationLabel(rel.relation))}</strong></span>
        <span class="dupe__fact">Notes sama <strong>${ov.shared.length} dari ${oriTotal}</strong></span>
        <span class="dupe__fact">Harga <strong>${escapeHtml(rupiah(d.price_idr))}</strong></span>
        ${save ? `<span class="dupe__fact">Hemat <strong class="save">${escapeHtml(rupiah(save.diff))} (${save.pct}%)</strong></span>` : ""}
      </div>
    </div>
    <div class="dupe__score">
      <strong data-count="${ov.pct}">0%</strong>
      <span>kemiripan notes</span>
    </div>
    <div class="dupe__cta">
      <a class="btn" href="/bandingkan/${encodeURIComponent(original.slug)}/vs/${encodeURIComponent(d.slug)}">Bandingkan berdampingan</a>
    </div>
  </article>`;
}

function notFound(slug) {
  return {
    title: "Tidak ditemukan",
    desc: "Parfum tidak ditemukan di katalog.",
    curtainWord: "Katalog",
    stage: false,
    html: `
      <section class="detail sect shell">
        <div class="empty">
          <p class="h-sect">Parfum tidak ditemukan.</p>
          <p>"${escapeHtml(slug)}" tidak ada di katalog. Mungkin tautannya sudah berubah.</p>
          <a class="btn" href="/katalog">Kembali ke katalog</a>
        </div>
      </section>`
  };
}

export async function detailView({ slug }) {
  let f, bundle;
  try {
    [f, bundle] = await Promise.all([
      getFragrance(slug),
      getDupes(slug).catch(() => null)
    ]);
  } catch {
    return notFound(slug);
  }

  const dupes = (bundle && bundle.dupes) || [];
  const originalOf = (bundle && bundle.original_of) || [];
  const flankers = (bundle && bundle.flankers) || [];
  const similar = (bundle && bundle.similar) || [];
  const sortedDupes = dupes.slice().sort((a, b) => b.confidence - a.confidence);

  const tags = [
    genderLabel(f.gender),
    f.release_year ? `Rilis ${f.release_year}` : "",
    ...(f.occasions || []).map(occasionLabel),
    ...(f.climates || []).map(climateLabel)
  ].filter(Boolean);

  const name = displayName("", f.name);
  const hasAnyRelation = sortedDupes.length || originalOf.length || flankers.length || similar.length;

  const html = `
  <article class="detail sect shell">
    <a class="crumb" href="/katalog">‹ Kembali ke katalog</a>

    <header class="detail__head">
      <p class="detail__brand">${escapeHtml(f.brand)}</p>
      <h1 class="detail__name" id="detail-name">${escapeHtml(name)}</h1>
      ${f.description ? `<p class="lede detail__desc">${escapeHtml(f.description)}</p>` : ""}
      ${tags.length ? `<div class="detail__tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    </header>

    <div class="detail__grid">
      <aside class="detail__aside">
        <div class="pricecard" data-reveal>
          <p class="pricecard__label">Kisaran harga</p>
          <p class="pricecard__value">${escapeHtml(rupiah(f.price_idr))}</p>
          ${f.rating ? `<p class="pricecard__rating">Rating komunitas ★ ${Number(f.rating).toFixed(1)}</p>` : ""}
        </div>
        ${f.longevity_score || f.projection_score ? `
        <div class="perf" data-reveal>
          ${f.longevity_score ? `
          <div class="perf__row">
            <div class="perf__head"><span>Ketahanan</span><strong>${Number(f.longevity_score).toFixed(1)} / 5</strong></div>
            <div class="perf__bar" data-scale="${(Number(f.longevity_score) / 5).toFixed(2)}"></div>
          </div>` : ""}
          ${f.projection_score ? `
          <div class="perf__row">
            <div class="perf__head"><span>Proyeksi</span><strong>${Number(f.projection_score).toFixed(1)} / 5</strong></div>
            <div class="perf__bar" data-scale="${(Number(f.projection_score) / 5).toFixed(2)}"></div>
          </div>` : ""}
        </div>` : ""}
        <p class="detail__source" data-reveal>
          Data dari sumber ${escapeHtml(String(f.source_type || "katalog").replace(/_/g, " "))}.
          ${f.source_url ? `<a href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">Lihat sumber</a>` : ""}
        </p>
      </aside>

      <div>
        ${pyramidHtml(f)}

        <section class="dupes" aria-labelledby="dupes-title">
          <div class="dupes__head">
            <h2 class="h-sect" id="dupes-title" data-reveal>Dupe dan alternatifnya.</h2>
            <p class="status" data-reveal>${
              sortedDupes.length
                ? `${sortedDupes.length} alternatif terkurasi, diurutkan dari konsensus tertinggi.`
                : "Belum ada dupe terkurasi untuk parfum ini."
            }</p>
          </div>
          <div id="dupe-list">
            ${sortedDupes.map((rel) => dupeRowHtml(f, rel)).join("")}
          </div>
          ${!sortedDupes.length && similar.length ? `
            <p class="status">Sebagai gantinya, lihat parfum dengan profil aroma serupa di bawah.</p>` : ""}

          ${hasAnyRelation ? `
          <div class="explain" id="explain">
            <button class="btn btn--ghost" id="explain-btn" type="button">
              <span>Minta ulasan AI</span><span class="spin" aria-hidden="true"></span>
            </button>
            <p class="status" id="explain-status" role="status"></p>
            <div class="explain__body" id="explain-body"></div>
          </div>` : ""}

          ${bundle && bundle.disclaimer ? `<p class="disclaimer">${escapeHtml(bundle.disclaimer)}</p>` : ""}
        </section>

        ${originalOf.length ? `
        <section class="similar" aria-labelledby="ori-title">
          <h2 class="h-sect" id="ori-title" data-reveal>Parfum acuannya.</h2>
          <p class="status" data-reveal>Parfum ini dikurasi sebagai alternatif dari:</p>
          <div class="similar__list">
            ${originalOf.map((rel) => {
              const o = rel.fragrance;
              return `<div class="similar__row">
                <a href="/parfum/${encodeURIComponent(o.slug)}">${escapeHtml(displayName(o.brand, o.name))}</a>
                <span class="brand">${escapeHtml(relationLabel(rel.relation))}</span>
                <a class="sim" href="/bandingkan/${encodeURIComponent(o.slug)}/vs/${encodeURIComponent(f.slug)}">Bandingkan ›</a>
              </div>`;
            }).join("")}
          </div>
        </section>` : ""}

        ${flankers.length ? `
        <section class="similar" aria-labelledby="flank-title">
          <h2 class="h-sect" id="flank-title" data-reveal>Satu lini rilisan.</h2>
          <div class="similar__list">
            ${flankers.map((rel) => {
              const o = rel.fragrance;
              return `<div class="similar__row">
                <a href="/parfum/${encodeURIComponent(o.slug)}">${escapeHtml(displayName(o.brand, o.name))}</a>
                <span class="brand">Flanker</span>
              </div>`;
            }).join("")}
          </div>
        </section>` : ""}

        ${similar.length ? `
        <section class="similar" aria-labelledby="similar-title">
          <h2 class="h-sect" id="similar-title" data-reveal>Profil aroma serupa.</h2>
          <p class="status" data-reveal>Kemiripan profil dihitung dari data katalog. Ini bukan klaim dupe.</p>
          <div class="similar__list">
            ${similar.map((s) => `
              <div class="similar__row">
                <a href="/parfum/${encodeURIComponent(s.slug)}">${escapeHtml(displayName(s.brand, s.name))}</a>
                <span class="brand">${escapeHtml(s.brand)}</span>
                ${typeof s.semantic_similarity === "number"
                  ? `<span class="sim">profil ${Math.round(s.semantic_similarity * 100)}% mirip</span>` : ""}
              </div>`).join("")}
          </div>
        </section>` : ""}
      </div>
    </div>
  </article>`;

  return {
    title: displayName(f.brand, f.name),
    desc: `${displayName(f.brand, f.name)}: detail notes, harga, dan ${sortedDupes.length || "daftar"} alternatif dupe dengan skor kemiripan.`,
    curtainWord: name,
    stage: false,
    html,
    async mount(root) {
      riseLines(root.querySelector("#detail-name"), 0.1);
      growBars(root);
      pyramidReveal(root);
      root.querySelectorAll(".dupe__score strong[data-count]").forEach((el) => {
        countUp(el, Number(el.dataset.count), { render: (v) => { el.textContent = `${v}%`; } });
      });

      const btn = root.querySelector("#explain-btn");
      if (btn) {
        const statusEl = root.querySelector("#explain-status");
        const body = root.querySelector("#explain-body");
        btn.addEventListener("click", async () => {
          btn.setAttribute("data-busy", "true");
          statusEl.textContent = "AI sedang membaca data relasinya...";
          try {
            const data = await getDupes(slug, { explain: true });
            body.innerHTML = renderMarkdown(data.explanation || "");
            statusEl.textContent = data.generated_by
              ? "Ulasan ditulis AI, dibatasi data katalog dan tingkat konsensus kurasi."
              : "";
            if (!data.explanation) statusEl.textContent = "Penjelasan belum tersedia untuk parfum ini.";
            btn.hidden = true;
            refreshTriggers();
          } catch {
            statusEl.setAttribute("data-tone", "error");
            statusEl.textContent = "Ulasan AI sedang tidak tersedia.";
          } finally {
            btn.removeAttribute("data-busy");
          }
        });
      }
    }
  };
}
