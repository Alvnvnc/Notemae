/* Boot aplikasi: motion, router, chrome (masthead, finder), veil. */

import { initMotion, lockScroll, reduceMotion } from "./motion.js";
import { defineRoute, startRouter, navigate, refreshCurrentRoute } from "./router.js";
import { getLocale, setLocale, t } from "./i18n.js";
import { attachAutocomplete } from "./autocomplete.js";
import { homeView } from "./views/home.js";
import { catalogView } from "./views/catalog.js";
import { detailView } from "./views/detail.js";
import { compareView } from "./views/compare.js";

/* ---- veil (loading pertama) ---------------------------------------------- */
const veilFill = document.getElementById("veil-fill");
let veilDone = false;

function veilProgress(p) {
  if (veilFill) veilFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
}
function veilFinish() {
  if (veilDone) return;
  veilDone = true;
  veilProgress(1);
  const reveal = () => document.body.removeAttribute("data-loading");
  if (reduceMotion) reveal();
  else setTimeout(reveal, 220);
}

/* ---- masthead state tanpa scroll listener (sentinel + IO) ----------------- */
function initScrollChrome() {
  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:120px;pointer-events:none;";
  document.body.prepend(sentinel);
  const io = new IntersectionObserver(([en]) => {
    document.body.setAttribute("data-scrolled", en.isIntersecting ? "false" : "true");
  });
  io.observe(sentinel);
}

/* ---- finder (pencarian cepat, KF-02) ------------------------------------- */
function initFinder() {
  const finder = document.getElementById("finder");
  const openBtn = document.getElementById("nav-search");
  const closeBtn = document.getElementById("finder-close");
  const input = document.getElementById("finder-input");
  const list = document.getElementById("finder-list");
  let open = false;
  let lastFocus = null;

  const ac = attachAutocomplete({
    input,
    list,
    onPick: (f) => { close(); navigate(`/parfum/${encodeURIComponent(f.slug)}`); },
    onSubmit: (q) => { close(); navigate(`/katalog?q=${encodeURIComponent(q)}`); }
  });

  function show() {
    if (open) return;
    open = true;
    lastFocus = document.activeElement;
    finder.hidden = false;
    requestAnimationFrame(() => document.body.setAttribute("data-finder", "open"));
    lockScroll(true);
    input.value = "";
    input.focus();
  }
  function close() {
    if (!open) return;
    open = false;
    document.body.removeAttribute("data-finder");
    ac.close();
    lockScroll(false);
    setTimeout(() => { finder.hidden = true; }, reduceMotion ? 0 : 240);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  openBtn.addEventListener("click", show);
  closeBtn.addEventListener("click", close);
  finder.addEventListener("pointerdown", (e) => { if (e.target === finder) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { close(); return; }
    const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || "");
    if (!typing && !open && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
      e.preventDefault();
      show();
    }
  });
}

function initLocale() {
  const syncChrome = () => {
    const locale = getLocale();
    document.documentElement.lang = locale;
    document.querySelectorAll("[data-locale]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.locale === locale));
    });
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    const searchInput = document.getElementById("finder-input");
    if (searchInput) searchInput.placeholder = t("search.placeholder");
    const hint = document.getElementById("finder-hint");
    if (hint) hint.textContent = t("search.hint");
    const close = document.getElementById("finder-close");
    if (close) close.setAttribute("aria-label", t("nav.close"));
    const finder = document.getElementById("finder");
    if (finder) finder.setAttribute("aria-label", t("search.label"));
  };
  document.querySelectorAll("[data-locale]").forEach((button) => {
    button.addEventListener("click", () => setLocale(button.dataset.locale));
  });
  window.addEventListener("scentsphere:localechange", () => { syncChrome(); refreshCurrentRoute(); });
  syncChrome();
}

/* ---- boot ----------------------------------------------------------------- */
function boot() {
  initMotion();
  initScrollChrome();
  initLocale();
  initFinder();

  defineRoute("/", homeView);
  defineRoute("/katalog", catalogView);
  defineRoute("/parfum/:slug", detailView);
  defineRoute("/bandingkan/:a/vs/:b", compareView);

  veilProgress(0.25);
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => veilProgress(0.6));

  const firstRender = startRouter(document.getElementById("view"));
  Promise.all([fontsReady, firstRender]).then(veilFinish);
  // katup pengaman: veil tidak boleh menggantung
  setTimeout(veilFinish, reduceMotion ? 500 : 2800);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
