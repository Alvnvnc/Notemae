/* Markup konsultan aroma, tanpa satu pun sentuhan DOM.

   Dipakai di dua tempat sekaligus, dan itu disengaja:
   - sebagai seksi penutup beranda (home.markup.js)
   - sebagai halaman penuh di rute /konsultan (consult.js)
   Satu sumber markup, jadi form di landing dan di halamannya tidak pernah
   bisa melenceng satu sama lain. Event-nya dipasang bindConsult() di
   consult.js, sama untuk kedua tempat. */

import { FAMILIES } from "../../lib/config.ts";
import { escapeHtml, displayName } from "../../lib/format.ts";
import { t, getLocale } from "../../lib/i18n.ts";

/* Tahapan yang benar-benar dikirim backend lewat SSE. Ditampilkan sebagai
   stepper supaya tunggu belasan detik punya bentuk, bukan spinner buta. */
export const CONSULT_STAGES = ["reading", "matching", "refining", "writing"];

export function stepperHtml() {
  return `
  <ol class="steps" id="consult-steps" aria-hidden="true" hidden>
    ${CONSULT_STAGES.map((stage) => `
      <li class="steps__item" data-stage="${stage}">
        <span class="steps__dot"></span>
        <span class="steps__label">${t(`stage.${stage}`)}</span>
      </li>`).join("")}
  </ol>`;
}

/* `page: true` -> versi halaman penuh: judulnya jadi <h1> (di beranda judul
   itu <h2> di bawah hero) dan sectionnya diberi jarak atas untuk masthead
   yang fixed, persis seperti .catalog. */
export function consultHtml({ page = false } = {}) {
  const budgetStep = getLocale() === "en" ? 50 : 50000;
  const budgetValue = getLocale() === "en" ? 100 : 1500000;
  const h = page ? "h1" : "h2";
  return `
  <section class="consult sect shell${page ? " consult--page" : ""}" id="konsultan" aria-labelledby="consult-title">
    <div class="consult__grid">
      <div class="consult__copy">
        <${h} class="h-sect" id="consult-title" data-reveal>${t("home.consultTitle")}</${h}>
        <p class="lede" data-reveal>
          ${t("home.consultLede")}
        </p>
        <div class="consult__notes" data-reveal aria-hidden="true">
          ${FAMILIES.map((f) => `<span class="tag">${f.name}</span>`).join("")}
        </div>
      </div>
      <div>
        <form class="consult__form" id="consult-form" novalidate data-reveal>
          <label class="field field--wide">
            <span>${t("home.profile")}</span>
            <textarea name="profile" rows="3"
              placeholder="${t("home.profilePlaceholder")}"></textarea>
          </label>
          <label class="field">
            <span>${t("home.occasion")}</span>
            <select name="occasion">
              <option value="office">${t("occasion.office")}</option>
              <option value="date">${t("occasion.date")}</option>
              <option value="casual">${t("occasion.casual")}</option>
              <option value="party">${t("occasion.party")}</option>
            </select>
          </label>
          <label class="field">
            <span>${t("home.climate")}</span>
            <select name="climate">
              <option value="tropical">${t("climate.tropical")}</option>
              <option value="warm">${t("climate.warm")}</option>
              <option value="mild">${t("climate.mild")}</option>
              <option value="hot">${t("climate.hot")}</option>
            </select>
          </label>
          <label class="field">
            <span>${t("home.budget")}</span>
            <input name="budget" type="number" inputmode="numeric" min="0" step="${budgetStep}" value="${budgetValue}" />
          </label>
          <label class="field">
            <span>${t("home.notes")}</span>
            <input name="notes" type="text" placeholder="iris, citrus, cedar" />
          </label>
          <div class="consult__actions">
            <button class="btn" id="consult-submit" type="submit">
              <span class="spin" aria-hidden="true"></span>
              <span id="consult-submit-label">${t("home.recommend")}</span>
            </button>
            <button class="btn btn--quiet" id="consult-cancel" type="button" hidden>
              ${t("home.cancel")}
            </button>
          </div>
        </form>
        <p class="status" id="consult-status" role="status" aria-live="polite"></p>
        <article class="rec" id="consult-result" hidden aria-busy="false">
          ${stepperHtml()}
          <div id="consult-result-body"></div>
        </article>
      </div>
    </div>
  </section>`;
}

/* Kerangka hasil: tampil segera setelah tombol ditekan, jadi pengguna melihat
   bentuk jawaban sebelum jawabannya ada. */
export function recSkeletonHtml() {
  return `
  <div class="rec__head">
    <p class="rec__eyebrow">${t("home.recommended")}</p>
    <p class="rec__name skel-text skel-text--lg"><span></span></p>
    <p class="rec__score skel-text"><span></span></p>
  </div>
  <div class="rec__body skel-text skel-text--body">
    <span></span><span></span><span></span>
  </div>`;
}

/** Kepala hasil: nama + skor. Terisi begitu event `matches` datang (<1 detik). */
export function recHeadHtml(recommendation, top, { refined }) {
  return `
  <div class="rec__head">
    <p class="rec__eyebrow">${t("home.recommended")}</p>
    <h3 class="rec__name">${escapeHtml(displayName(recommendation.brand, recommendation.name))}</h3>
    ${top && typeof top.score === "number"
      ? `<p class="rec__score">${t("home.matchScore", { score: top.score })}${refined ? "" : ` <span class="rec__provisional">${t("home.provisional")}</span>`}</p>`
      : ""}
  </div>`;
}

export function recFootHtml(recommendation, alternatives) {
  const alts = (alternatives || [])
    .map((a) => escapeHtml(displayName(a.brand, a.name)))
    .join(", ");
  return `
    ${alts ? `<p class="rec__alt"><strong>${t("home.consider")}</strong> ${alts}</p>` : ""}
    ${recommendation.slug
      ? `<p class="rec__alt" style="margin-top:20px"><a class="btn btn--ghost" href="/parfum/${encodeURIComponent(recommendation.slug)}">${t("home.viewDupe")}</a></p>`
      : ""}`;
}

/** Judul + deskripsi rute /konsultan. */
export const consultMeta = () => ({
  title: t("nav.consultant"),
  desc: t("home.consultLede"),
  stage: false
});
