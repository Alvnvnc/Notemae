/* Perbandingan berdampingan original vs alternatif (KF-07): notes yang sama
   di tengah, notes unik di sisi masing-masing, plus selisih harga dan
   persentase penghematan (KF-08). Semua angka dihitung dari data katalog. */

import { getFragrance } from "../api.js";
import {
  escapeHtml, rupiah, displayName, noteOverlap, savings, genderLabel
} from "../format.js";
import { compareIntro, countUp } from "../motion.js";
import { t } from "../i18n.js";

function colHtml(f, role, uniqueNotes, side) {
  const rows = [
    ["Gender", genderLabel(f.gender)],
    [t("common.rating"), f.rating ? `★ ${Number(f.rating).toFixed(1)}` : t("common.noData")],
    [t("detail.longevity"), f.longevity_score ? `${Number(f.longevity_score).toFixed(1)} / 5` : t("common.noData")],
    [t("detail.projection"), f.projection_score ? `${Number(f.projection_score).toFixed(1)} / 5` : t("common.noData")]
  ];
  return `
  <div class="compare__col compare__col--${side}">
    <p class="compare__role">${role}</p>
    <h2 class="compare__name"><a href="/parfum/${encodeURIComponent(f.slug)}">${escapeHtml(displayName("", f.name))}</a></h2>
    <p class="compare__brand">${escapeHtml(f.brand)}</p>
    <p class="compare__price">${escapeHtml(rupiah(f.price_idr))}</p>
    <dl>
      ${rows.map(([dt, dd]) => `<dt>${dt}</dt><dd>${escapeHtml(dd)}</dd>`).join("")}
      <dt>${t("common.notes")}</dt>
      <dd>
        <span class="compare__notes">
          ${uniqueNotes.length ? uniqueNotes.map((n) => `<span class="note">${escapeHtml(n)}</span>`).join("") : `<span class='note'>${t("common.noData")}</span>`}
        </span>
      </dd>
    </dl>
  </div>`;
}

function failView() {
  return {
    title: t("errors.compare"),
    desc: t("errors.compare"),
    curtainWord: t("nav.catalog"),
    stage: false,
    html: `
      <section class="compare sect shell">
        <div class="empty">
          <p class="h-sect">${t("errors.compare")}</p>
          <p>${t("errors.compareHint")}</p>
          <a class="btn" href="/katalog">${t("common.backCatalog")}</a>
        </div>
      </section>`
  };
}

export async function compareView({ a, b }) {
  let ori, dup;
  try {
    [ori, dup] = await Promise.all([getFragrance(a), getFragrance(b)]);
  } catch {
    return failView();
  }

  const ov = noteOverlap(ori.notes, dup.notes);
  const save = savings(ori.price_idr, dup.price_idr);
  const priceGap = ori.price_idr && dup.price_idr ? Math.abs(ori.price_idr - dup.price_idr) : null;

  const html = `
  <section class="compare sect shell" aria-labelledby="compare-title">
    <a class="crumb" href="/parfum/${encodeURIComponent(ori.slug)}">‹ ${t("common.backCatalog")}: ${escapeHtml(displayName(ori.brand, ori.name))}</a>
    <h1 class="h-sect compare__title" id="compare-title" data-reveal>
      ${t("compare.title", { a: escapeHtml(displayName("", ori.name)), b: escapeHtml(displayName("", dup.name)) })}
    </h1>

    <div class="compare__stage">
      ${colHtml(ori, t("role.original"), ov.onlyA, "ori")}
      <div class="compare__mid">
        <p class="compare__pct" id="compare-pct" data-count="${ov.pct}">0%</p>
        <p class="compare__pct-label">${t("compare.similarity")}</p>
        ${ov.shared.length ? `
          <div class="compare__shared" role="list" aria-label="${t("common.notes")} ${t("common.noData")} ">
            ${ov.shared.map((n) => `<span class="note note--shared" role="listitem">${escapeHtml(n)}</span>`).join("")}
        </div>` : `<p class="status">${t("compare.noShared")}</p>`}
        ${save ? `
          <div class="compare__save">
            <strong>${escapeHtml(rupiah(save.diff))}</strong>
            <span>${t("compare.saved", { pct: save.pct })}</span>
          </div>` : priceGap ? `
          <div class="compare__save">
            <strong>${escapeHtml(rupiah(priceGap))}</strong>
            <span>${t("compare.gap")}</span>
          </div>` : ""}
      </div>
      ${colHtml(dup, t("role.alternative"), ov.onlyB, "dup")}
    </div>

    <div class="compare__foot">
      <p class="status">${t("compare.disclaimer")}</p>
      <a class="link-quiet" href="/parfum/${encodeURIComponent(dup.slug)}">${t("common.detail")} ${escapeHtml(displayName("", dup.name))} ›</a>
    </div>
  </section>`;

  return {
    title: `${displayName("", ori.name)} vs ${displayName("", dup.name)}`,
    desc: `${t("common.compare")} ${displayName(ori.brand, ori.name)} / ${displayName(dup.brand, dup.name)}: ${ov.pct}% ${t("common.similarity")}${save ? `, ${t("common.savings").toLowerCase()} ${save.pct}%` : ""}.`,
    curtainWord: t("common.compare"),
    stage: false,
    html,
    async mount(root) {
      compareIntro(root);
      const pctEl = root.querySelector("#compare-pct");
      countUp(pctEl, Number(pctEl.dataset.count), { render: (v) => { pctEl.textContent = `${v}%`; } });
    }
  };
}
