/* Katalog (KF-01 grid + pagination, KF-02 pencarian + autocomplete,
   KF-03 filter brand/gender/keluarga aroma/harga, KF-09 pencarian notes).
   Filter tersinkron ke query string agar URL bisa dibagikan (KNF-12). */

import { FAMILIES, GENDERS, PRICE_RANGES, PAGE_SIZE } from "../config.js";
import { searchFragrances } from "../api.js";
import { escapeHtml, rupiah, displayName, genderLabel } from "../format.js";
import { revealCards, attachSheen, scrollToEl } from "../motion.js";
import { attachAutocomplete } from "../autocomplete.js";
import { navigate } from "../router.js";
import { t, priceRangeLabel } from "../i18n.js";

function readState() {
  const p = new URLSearchParams(location.search);
  return {
    q: p.get("q") || "",
    family: p.get("keluarga") || "",
    gender: p.get("gender") || "",
    price: Math.min(Number(p.get("harga")) || 0, PRICE_RANGES.length - 1),
    brand: p.get("brand") || "",
    page: Math.max(1, Number(p.get("hal")) || 1)
  };
}

function writeState(s) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.family) p.set("keluarga", s.family);
  if (s.gender) p.set("gender", s.gender);
  if (s.price) p.set("harga", String(s.price));
  if (s.brand) p.set("brand", s.brand);
  if (s.page > 1) p.set("hal", String(s.page));
  const qs = p.toString();
  history.replaceState({}, "", "/katalog" + (qs ? `?${qs}` : ""));
}

function cardHtml(f) {
  const notes = (f.notes || []).map(escapeHtml).join(", ");
  const meta = [genderLabel(f.gender), f.rating ? `★ ${Number(f.rating).toFixed(1)}` : ""]
    .filter(Boolean).join("  ");
  return `
  <a class="card" href="/parfum/${encodeURIComponent(f.slug)}" aria-label="${escapeHtml(displayName(f.brand, f.name))}">
    <p class="card__brand">${escapeHtml(f.brand)}</p>
    <h3 class="card__name">${escapeHtml(displayName("", f.name))}</h3>
    <p class="card__notes">${notes || t("common.noNotes")}</p>
    <div class="card__foot">
      <span class="card__price">${escapeHtml(rupiah(f.price_idr))}</span>
      <span class="card__meta">${escapeHtml(meta)}</span>
    </div>
  </a>`;
}

function skeletonHtml(n) {
  return Array.from({ length: n }, () =>
    `<div class="card skel" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`
  ).join("");
}

function pagerHtml(page, totalPages) {
  if (totalPages <= 1) return "";
  const btn = (p, label = p, current = false) =>
    `<button type="button" data-page="${p}" ${current ? 'aria-current="page"' : ""} aria-label="${t("catalog.page", { page: p })}">${label}</button>`;
  let out = "";
  if (page > 1) out += btn(page - 1, "‹");
  for (let p = 1; p <= totalPages; p += 1) {
    if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - page) > 1) {
      if (!out.endsWith("</span>")) out += `<span class="pager__gap">…</span>`;
      continue;
    }
    out += btn(p, p, p === page);
  }
  if (page < totalPages) out += btn(page + 1, "›");
  return out;
}

export async function catalogView() {
  const state = readState();

  const html = `
  <section class="catalog sect shell" aria-labelledby="catalog-title">
    <div class="catalog__head">
      <div class="catalog__title">
        <h1 class="h-sect" id="catalog-title">${t("catalog.title")}</h1>
        <span class="catalog__count" id="catalog-count" aria-live="polite"></span>
      </div>
      <div class="catalog__search">
        <form id="catalog-search-form" role="search">
          <label class="sr-only" for="catalog-q">${t("catalog.searchLabel")}</label>
          <input id="catalog-q" type="search" name="q" placeholder="${t("catalog.searchPlaceholder")}"
            value="${escapeHtml(state.q)}" autocomplete="off" role="combobox"
            aria-autocomplete="list" aria-controls="catalog-suggest" aria-expanded="false" />
          <button class="btn" type="submit">${t("catalog.search")}</button>
        </form>
        <ul class="suggest" id="catalog-suggest" role="listbox" aria-label="${t("search.suggestions")}"></ul>
      </div>
    </div>

    <div class="filters" aria-label="${t("catalog.filter")}">
      <div class="filters__row" id="filter-family" role="group" aria-label="${t("catalog.family")}" >
        <span class="filters__label" aria-hidden="true">${t("catalog.family")}</span>
        ${FAMILIES.map((f) =>
          `<button class="chip" type="button" data-family="${f.q}" data-note="${f.note}"
             aria-pressed="${state.family === f.q}">${f.name}</button>`).join("")}
      </div>
      <div class="filters__row">
        <span class="filters__label" aria-hidden="true">${t("catalog.filter")}</span>
        <label class="sr-only" for="filter-gender">Gender</label>
        <select id="filter-gender">
          ${GENDERS.map((g) => `<option value="${g.value}" ${state.gender === g.value ? "selected" : ""}>${g.value ? t(`gender.${g.value}`) : t("gender.all")}</option>`).join("")}
        </select>
        <label class="sr-only" for="filter-price">${t("detail.price")}</label>
        <select id="filter-price">
          ${PRICE_RANGES.map((r, i) => `<option value="${i}" ${state.price === i ? "selected" : ""}>${priceRangeLabel(i)}</option>`).join("")}
        </select>
        <label class="sr-only" for="filter-brand">Brand</label>
        <select id="filter-brand"><option value="">${t("catalog.allBrands")}</option></select>
        <button class="filters__reset" id="filter-reset" type="button">${t("catalog.reset")}</button>
      </div>
    </div>

    <p class="status" id="catalog-status" role="status"></p>
    <div class="grid" id="catalog-grid" style="margin-top:18px">${skeletonHtml(8)}</div>
    <nav class="pager" id="catalog-pager" aria-label="${t("catalog.pagination")}"></nav>
  </section>`;

  return {
    title: t("nav.catalog"),
    desc: t("catalog.title"),
    curtainWord: t("nav.catalog"),
    stage: false,
    html,
    async mount(root) {
      const grid = root.querySelector("#catalog-grid");
      const statusEl = root.querySelector("#catalog-status");
      const countEl = root.querySelector("#catalog-count");
      const pager = root.querySelector("#catalog-pager");
      const brandSel = root.querySelector("#filter-brand");
      const genderSel = root.querySelector("#filter-gender");
      const priceSel = root.querySelector("#filter-price");
      const familyRow = root.querySelector("#filter-family");
      const form = root.querySelector("#catalog-search-form");
      const input = root.querySelector("#catalog-q");

      let all = [];
      let seq = 0;
      attachSheen(grid);

      const setStatus = (text, tone) => {
        statusEl.textContent = text;
        if (tone) statusEl.setAttribute("data-tone", tone);
        else statusEl.removeAttribute("data-tone");
      };

      function applyClientFilters(items) {
        const range = PRICE_RANGES[state.price];
        return items.filter((f) => {
          if (state.gender && f.gender !== state.gender) return false;
          if (state.brand && f.brand !== state.brand) return false;
          if (range.min && (!f.price_idr || f.price_idr < range.min)) return false;
          if (range.max && f.price_idr && f.price_idr > range.max) return false;
          return true;
        });
      }

      function fillBrands(items) {
        const brands = [...new Set(items.map((f) => f.brand).filter(Boolean))].sort();
        brandSel.innerHTML =
          `<option value="">${t("catalog.allBrands")}</option>` +
          brands.map((b) => `<option value="${escapeHtml(b)}" ${state.brand === b ? "selected" : ""}>${escapeHtml(b)}</option>`).join("");
        if (state.brand && !brands.includes(state.brand)) { state.brand = ""; }
      }

      function renderPage() {
        const filtered = applyClientFilters(all);
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (state.page > totalPages) state.page = totalPages;
        const pageItems = filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

        countEl.textContent = t("catalog.count", { count: filtered.length });
        if (!filtered.length) {
          grid.innerHTML = `
            <div class="empty" style="grid-column:1/-1">
              <p class="h-sect">${t("catalog.empty")}</p>
              <p>${t("catalog.emptyHint")}</p>
              <button class="btn btn--ghost" type="button" id="empty-reset">${t("catalog.reset")}</button>
            </div>`;
          const er = grid.querySelector("#empty-reset");
          if (er) er.addEventListener("click", resetFilters);
          pager.innerHTML = "";
          return;
        }
        grid.innerHTML = pageItems.map(cardHtml).join("");
        pager.innerHTML = pagerHtml(state.page, totalPages);
        revealCards(Array.from(grid.children));
      }

      async function load({ refill = true } = {}) {
        const mySeq = ++seq;
        const fam = FAMILIES.find((f) => f.q === state.family);
        const range = PRICE_RANGES[state.price];
        setStatus(t("catalog.loading"));
        grid.innerHTML = skeletonHtml(8);
        pager.innerHTML = "";
        try {
          let items = await searchFragrances({
            q: state.q || (fam ? fam.q : ""),
            note: fam ? fam.note : "",
            maxPriceIdr: range.max || 0
          });
          // filter note terlalu ketat -> fallback ke kueri teks keluarga
          if (fam && !items.length) {
            items = await searchFragrances({ q: fam.q, maxPriceIdr: range.max || 0 });
          }
          if (mySeq !== seq) return;
          all = items;
          if (refill) fillBrands(items);
          setStatus(items.length ? "" : "");
          renderPage();
        } catch {
          if (mySeq !== seq) return;
          setStatus(t("catalog.error"), "error");
          grid.innerHTML = "";
        }
      }

      function syncAndLoad(opts) {
        state.page = 1;
        writeState(state);
        load(opts);
      }

      function resetFilters() {
        state.q = ""; state.family = ""; state.gender = ""; state.price = 0; state.brand = ""; state.page = 1;
        input.value = "";
        genderSel.value = ""; priceSel.value = "0";
        familyRow.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        syncAndLoad({ refill: true });
      }

      // pencarian + autocomplete (KF-02)
      const ac = attachAutocomplete({
        input,
        list: root.querySelector("#catalog-suggest"),
        itemClass: "finder__item",
        onPick: (f) => navigate(`/parfum/${encodeURIComponent(f.slug)}`),
        onSubmit: (q) => { state.q = q; syncAndLoad({ refill: true }); }
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        ac.close();
        state.q = input.value.trim();
        syncAndLoad({ refill: true });
      });

      // filter keluarga aroma (KF-03)
      familyRow.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip[data-family]");
        if (!chip) return;
        const isOn = chip.getAttribute("aria-pressed") === "true";
        familyRow.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        state.family = isOn ? "" : chip.dataset.family;
        if (!isOn) chip.setAttribute("aria-pressed", "true");
        syncAndLoad({ refill: true });
      });

      genderSel.addEventListener("change", () => { state.gender = genderSel.value; state.page = 1; writeState(state); renderPage(); });
      brandSel.addEventListener("change", () => { state.brand = brandSel.value; state.page = 1; writeState(state); renderPage(); });
      priceSel.addEventListener("change", () => { state.price = Number(priceSel.value); syncAndLoad({ refill: false }); });
      root.querySelector("#filter-reset").addEventListener("click", resetFilters);

      // pagination (KF-01)
      pager.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-page]");
        if (!btn) return;
        state.page = Number(btn.dataset.page);
        writeState(state);
        renderPage();
        scrollToEl(root.querySelector(".filters"));
      });

      await load({ refill: true });
      return () => { seq += 1; ac.destroy(); };
    }
  };
}
