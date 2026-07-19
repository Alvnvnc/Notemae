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
import { t } from "../i18n.js";

function pyramidHtml(f) {
  const tiers = splitPyramid(f.notes);
  if (!tiers) {
    if (!(f.notes || []).length) return "";
    return `
    <div data-reveal>
      <h2 class="h-sect">${t("detail.title")}</h2>
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
    <h2 class="h-sect" data-reveal>${t("detail.pyramid")}</h2>
    <div class="pyramid">
      ${tier("top", "Top", tiers.top)}
      ${tier("heart", "Heart", tiers.heart)}
      ${tier("base", "Base", tiers.base)}
    </div>
    <p class="pyramid__hint">${t("detail.pyramidHint")}</p>
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
        <span class="dupe__fact">${t("relation.similar")} <strong>${escapeHtml(relationLabel(rel.relation))}</strong></span>
        <span class="dupe__fact">${t("common.notes")} <strong>${ov.shared.length} / ${oriTotal}</strong></span>
        <span class="dupe__fact">${t("detail.price")} <strong>${escapeHtml(rupiah(d.price_idr))}</strong></span>
        ${save ? `<span class="dupe__fact">${t("common.savings")} <strong class="save">${escapeHtml(rupiah(save.diff))} (${save.pct}%)</strong></span>` : ""}
      </div>
    </div>
    <div class="dupe__score">
      <strong data-count="${ov.pct}">0%</strong>
      <span>${t("common.similarity")}</span>
    </div>
    <div class="dupe__cta">
      <a class="btn" href="/bandingkan/${encodeURIComponent(original.slug)}/vs/${encodeURIComponent(d.slug)}">${t("common.compare")}</a>
    </div>
  </article>`;
}

function notFound(slug) {
  return {
    title: t("errors.notFound"),
    desc: t("errors.notFound"),
    curtainWord: t("nav.catalog"),
    stage: false,
    html: `
      <section class="detail sect shell">
        <div class="empty">
          <p class="h-sect">${t("errors.notFound")}</p>
          <p>${escapeHtml(t("errors.notFoundHint", { slug }))}</p>
          <a class="btn" href="/katalog">${t("common.backCatalog")}</a>
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
    f.release_year ? t("detail.release", { year: f.release_year }) : "",
    ...(f.occasions || []).map(occasionLabel),
    ...(f.climates || []).map(climateLabel)
  ].filter(Boolean);

  const name = displayName("", f.name);
  const hasAnyRelation = sortedDupes.length || originalOf.length || flankers.length || similar.length;

  const html = `
  <article class="detail sect shell">
    <a class="crumb" href="/katalog">‹ ${t("common.backCatalog")}</a>

    <header class="detail__head">
      <p class="detail__brand">${escapeHtml(f.brand)}</p>
      <h1 class="detail__name" id="detail-name">${escapeHtml(name)}</h1>
      ${f.description ? `<p class="lede detail__desc">${escapeHtml(f.description)}</p>` : ""}
      ${tags.length ? `<div class="detail__tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    </header>

    <div class="detail__grid">
      <aside class="detail__aside">
        <div class="pricecard" data-reveal>
          <p class="pricecard__label">${t("detail.price")}</p>
          <p class="pricecard__value">${escapeHtml(rupiah(f.price_idr))}</p>
          ${f.rating ? `<p class="pricecard__rating">${t("common.rating")} ★ ${Number(f.rating).toFixed(1)}</p>` : ""}
        </div>
        ${f.longevity_score || f.projection_score ? `
        <div class="perf" data-reveal>
          ${f.longevity_score ? `
          <div class="perf__row">
            <div class="perf__head"><span>${t("detail.longevity")}</span><strong>${Number(f.longevity_score).toFixed(1)} / 5</strong></div>
            <div class="perf__bar" data-scale="${(Number(f.longevity_score) / 5).toFixed(2)}"></div>
          </div>` : ""}
          ${f.projection_score ? `
          <div class="perf__row">
            <div class="perf__head"><span>${t("detail.projection")}</span><strong>${Number(f.projection_score).toFixed(1)} / 5</strong></div>
            <div class="perf__bar" data-scale="${(Number(f.projection_score) / 5).toFixed(2)}"></div>
          </div>` : ""}
        </div>` : ""}
        <p class="detail__source" data-reveal>
          ${t("common.source")}: ${escapeHtml(String(f.source_type || "catalog").replace(/_/g, " "))}.
          ${f.source_url ? `<a href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">${t("common.viewSource")}</a>` : ""}
        </p>
      </aside>

      <div>
        ${pyramidHtml(f)}

        <section class="dupes" aria-labelledby="dupes-title">
          <div class="dupes__head">
            <h2 class="h-sect" id="dupes-title" data-reveal>${t("detail.dupes")}</h2>
            <p class="status" data-reveal>${
              sortedDupes.length
                ? t("detail.sorted", { count: sortedDupes.length })
                : t("detail.noDupes")
            }</p>
          </div>
          <div id="dupe-list">
            ${sortedDupes.map((rel) => dupeRowHtml(f, rel)).join("")}
          </div>
          ${!sortedDupes.length && similar.length ? `
            <p class="status">${t("relation.similar")}: ${t("compare.disclaimer")}</p>` : ""}

          ${hasAnyRelation ? `
          <div class="explain" id="explain">
            <button class="btn btn--ghost" id="explain-btn" type="button">
              <span>${t("detail.ai")}</span><span class="spin" aria-hidden="true"></span>
            </button>
            <p class="status" id="explain-status" role="status"></p>
            <div class="explain__body" id="explain-body"></div>
          </div>` : ""}

          ${bundle && bundle.disclaimer ? `<p class="disclaimer">${escapeHtml(bundle.disclaimer)}</p>` : ""}
        </section>

        ${originalOf.length ? `
        <section class="similar" aria-labelledby="ori-title">
          <h2 class="h-sect" id="ori-title" data-reveal>${t("detail.dupes")}</h2>
          <p class="status" data-reveal>${t("role.alternative")}:</p>
          <div class="similar__list">
            ${originalOf.map((rel) => {
              const o = rel.fragrance;
              return `<div class="similar__row">
                <a href="/parfum/${encodeURIComponent(o.slug)}">${escapeHtml(displayName(o.brand, o.name))}</a>
                <span class="brand">${escapeHtml(relationLabel(rel.relation))}</span>
                <a class="sim" href="/bandingkan/${encodeURIComponent(o.slug)}/vs/${encodeURIComponent(f.slug)}">${t("common.compare")} ›</a>
              </div>`;
            }).join("")}
          </div>
        </section>` : ""}

        ${flankers.length ? `
        <section class="similar" aria-labelledby="flank-title">
          <h2 class="h-sect" id="flank-title" data-reveal>${t("relation.flanker_of")}</h2>
          <div class="similar__list">
            ${flankers.map((rel) => {
              const o = rel.fragrance;
              return `<div class="similar__row">
                <a href="/parfum/${encodeURIComponent(o.slug)}">${escapeHtml(displayName(o.brand, o.name))}</a>
                <span class="brand">${t("relation.flanker_of")}</span>
              </div>`;
            }).join("")}
          </div>
        </section>` : ""}

        ${similar.length ? `
        <section class="similar" aria-labelledby="similar-title">
          <h2 class="h-sect" id="similar-title" data-reveal>${t("relation.similar")} profile.</h2>
          <p class="status" data-reveal>${t("compare.disclaimer")}</p>
          <div class="similar__list">
            ${similar.map((s) => `
              <div class="similar__row">
                <a href="/parfum/${encodeURIComponent(s.slug)}">${escapeHtml(displayName(s.brand, s.name))}</a>
                <span class="brand">${escapeHtml(s.brand)}</span>
                ${typeof s.semantic_similarity === "number"
                  ? `<span class="sim">${Math.round(s.semantic_similarity * 100)}% ${t("common.similarity")}</span>` : ""}
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
          statusEl.textContent = t("detail.aiLoading");
          try {
            const data = await getDupes(slug, { explain: true });
            body.innerHTML = renderMarkdown(data.explanation || "");
            statusEl.textContent = data.generated_by
              ? t("home.ai")
              : "";
            if (!data.explanation) statusEl.textContent = t("detail.noDupes");
            btn.hidden = true;
            refreshTriggers();
          } catch {
            statusEl.setAttribute("data-tone", "error");
            statusEl.textContent = t("detail.aiUnavailable");
          } finally {
            btn.removeAttribute("data-busy");
          }
        });
      }
    }
  };
}
