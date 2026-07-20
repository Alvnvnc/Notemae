/* Autocomplete pencarian (KF-02): debounce, pembatalan request lama,
   navigasi keyboard penuh (pola WAI-ARIA combobox + listbox). */

import { searchFragrances } from "../lib/api.ts";
import { escapeHtml, displayName, rupiahCompact } from "../lib/format.ts";

export function attachAutocomplete({ input, list, onPick, onSubmit, itemClass = "finder__item" }) {
  let items = [];
  let active = -1;
  let timer = null;
  let controller = null;
  let seq = 0;

  function close() {
    items = [];
    active = -1;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
  }

  function highlight(text, q) {
    const safe = escapeHtml(text);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0 || !q) return safe;
    // escape memotong per bagian agar indeks tetap akurat
    return (
      escapeHtml(text.slice(0, idx)) +
      "<mark>" + escapeHtml(text.slice(idx, idx + q.length)) + "</mark>" +
      escapeHtml(text.slice(idx + q.length))
    );
  }

  function renderList(q) {
    list.innerHTML = items
      .map((f, i) => {
        const name = displayName("", f.name);
        return (
          `<li class="${itemClass}" role="option" id="${list.id}-opt-${i}"` +
          ` aria-selected="${i === active}" data-index="${i}">` +
          `<strong>${highlight(name, q)}</strong>` +
          `<span class="brand">${escapeHtml(f.brand)}</span>` +
          (f.price_idr ? `<span class="price">${escapeHtml(rupiahCompact(f.price_idr))}</span>` : "") +
          `</li>`
        );
      })
      .join("");
    input.setAttribute("aria-expanded", items.length ? "true" : "false");
  }

  function setActive(i, q) {
    active = i;
    renderList(q);
    if (i >= 0) input.setAttribute("aria-activedescendant", `${list.id}-opt-${i}`);
    else input.removeAttribute("aria-activedescendant");
  }

  async function query(q) {
    if (controller) controller.abort();
    controller = new AbortController();
    const mySeq = ++seq;
    try {
      const found = await searchFragrances({ q, limit: 6, signal: controller.signal });
      if (mySeq !== seq) return;
      items = found;
      active = -1;
      renderList(q);
    } catch (err) {
      if (err.name !== "AbortError" && mySeq === seq) close();
    }
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { close(); return; }
    timer = setTimeout(() => query(q), 220);
  });

  input.addEventListener("keydown", (e) => {
    const q = input.value.trim();
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((active + 1) % items.length, q);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((active - 1 + items.length) % items.length, q);
    } else if (e.key === "Enter") {
      if (active >= 0 && items[active]) {
        e.preventDefault();
        const picked = items[active];
        close();
        onPick(picked);
      } else if (onSubmit) {
        e.preventDefault();
        close();
        onSubmit(q);
      }
    } else if (e.key === "Escape") {
      close();
    }
  });

  list.addEventListener("pointerdown", (e) => {
    const li = e.target.closest("[data-index]");
    if (!li) return;
    e.preventDefault();
    const picked = items[Number(li.dataset.index)];
    close();
    if (picked) onPick(picked);
  });

  return { close, destroy: () => { clearTimeout(timer); if (controller) controller.abort(); } };
}
