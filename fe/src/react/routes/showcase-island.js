/* Peningkatan imperatif untuk beranda: panel geser dupe + galeri 3D.

   Dipisah dari home.tsx dengan sengaja. Keduanya sifatnya imperatif dan
   client-only - three.js dan slide panel bukan sesuatu yang masuk akal ditulis
   sebagai komponen React. Home merender kerangkanya (shelf HTML asli, wadah
   sheet kosong) sebagai JSX supaya bisa di-SSR; modul ini yang menyalakannya di
   browser setelah mount. Persis pola lama: server kirim daftar tautan, klien
   menaikkannya jadi 3D kalau WebGL ada. Disalin apa adanya dari home.js legacy. */
import { getDupes } from "../../lib/api.ts";
import { displayName } from "../../lib/format.ts";
import { t } from "../../lib/i18n.ts";
import { lockScroll, reduceMotion } from "../../legacy/motion.js";
import { dupeSheetHtml } from "../../legacy/views/home.markup.js";
import { canRender3d } from "../../legacy/webgl.js";

/* Panel dupe. Dipakai galeri 3D maupun daftar HTML cadangan, jadi perilakunya
   sama entah WebGL ada atau tidak. */
export function bindDupeSheet(root) {
  const sheet = root.querySelector("#dupe-sheet");
  if (!sheet) return null;
  const titleEl = sheet.querySelector("#dupe-sheet-title");
  const brandEl = sheet.querySelector("#dupe-sheet-brand");
  const body = sheet.querySelector("#dupe-sheet-body");
  const closeBtn = sheet.querySelector("#dupe-sheet-close");

  let open = false;
  let lastFocus = null;
  let controller = null;
  let hideTimer = 0;

  function close() {
    if (!open) return;
    open = false;
    if (controller) { controller.abort(); controller = null; }
    document.body.removeAttribute("data-sheet");
    lockScroll(false);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { sheet.hidden = true; }, reduceMotion ? 0 : 340);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function show(fragrance) {
    lastFocus = document.activeElement;
    titleEl.textContent = displayName("", fragrance.name);
    brandEl.textContent = fragrance.brand;
    body.innerHTML = `<p class="sheet__loading">${t("home.showcaseLoading")}</p>`;

    clearTimeout(hideTimer);
    sheet.hidden = false;
    open = true;
    requestAnimationFrame(() => document.body.setAttribute("data-sheet", "open"));
    lockScroll(true);
    closeBtn.focus();

    if (controller) controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    try {
      const bundle = await getDupes(fragrance.slug, { signal });
      if (signal.aborted) return;
      body.innerHTML = dupeSheetHtml(fragrance, bundle || {});
    } catch {
      if (signal.aborted) return;
      body.innerHTML = `<p class="sheet__loading" data-tone="error">${t("home.showcaseError")}</p>`;
    }
  }

  closeBtn.addEventListener("click", close);
  sheet.addEventListener("pointerdown", (e) => { if (e.target === sheet) close(); });
  const onKey = (e) => { if (e.key === "Escape" && open) { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey);
  sheet.addEventListener("click", (e) => { if (e.target.closest("a[href]")) close(); });

  return {
    show,
    close,
    destroy() {
      document.removeEventListener("keydown", onKey);
      clearTimeout(hideTimer);
      if (open) { document.body.removeAttribute("data-sheet"); lockScroll(false); }
    },
  };
}

/* Galeri 3D dipasang belakangan dan hanya kalau layak: three.js baru diunduh
   saat sectionnya mendekat dan GPU-nya nyata. Sampai itu (dan selamanya di
   perangkat yang tidak sanggup) daftar HTML dari server yang tampil. */
export function bindShowcase(root, items, sheet) {
  const section = root.querySelector("[data-showcase]");
  if (!section || !items.length) return () => {};

  const stage = section.querySelector("#showcase-stage");
  const canvas = section.querySelector("#showcase-canvas");
  const shelf = section.querySelector("#showcase-shelf");
  const hud = section.querySelector("#showcase-hud");
  const brandEl = section.querySelector("#showcase-brand");
  const nameEl = section.querySelector("#showcase-name");
  const openBtn = section.querySelector("#showcase-open");

  let gallery = null;
  let index = 0;
  let dead = false;

  const current = () => items[index].fragrance;

  const paintNow = () => {
    const f = current();
    brandEl.textContent = f.brand;
    nameEl.textContent = displayName("", f.name);
  };

  shelf.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || !gallery) return;
    e.preventDefault();
    const slot = link.closest("[data-slot]");
    if (slot) { index = Number(slot.dataset.slot); gallery.select(index); sheet?.show(current()); }
  });

  hud.addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (step && gallery) {
      index = (index + Number(step.dataset.step) + items.length) % items.length;
      gallery.select(index);
      paintNow();
    }
  });
  openBtn.addEventListener("click", () => sheet?.show(current()));

  stage.addEventListener("showcase:select", (e) => {
    index = e.detail.index;
    paintNow();
  });

  if (!canRender3d()) return () => {};

  const io = new IntersectionObserver(async ([en]) => {
    if (!en.isIntersecting || dead) return;
    io.disconnect();
    try {
      const mod = await import("../../legacy/showcase3d.js");
      if (dead) return;
      canvas.hidden = false;
      gallery = mod.mountShowcase(stage, items, (at) => { index = at; sheet?.show(current()); });
      if (!gallery) { canvas.hidden = true; return; }
      section.setAttribute("data-3d", "on");
      hud.hidden = false;
      paintNow();
    } catch {
      canvas.hidden = true;
    }
  }, { rootMargin: "100% 0px" });
  io.observe(section);

  return () => {
    dead = true;
    io.disconnect();
    if (gallery) gallery.destroy();
  };
}
