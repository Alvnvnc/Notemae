/* Picker React: combobox + listbox ARIA yang menggantikan enhanceSelects
   legacy. Beda dari picker.js, ini bukan enhancement di atas <select> - tidak
   ada elemen native yang dipindah-pindah (yang di React akan berkelahi dengan
   reconciliation). Ia komponen terkontrol penuh: value + options masuk sebagai
   prop, onChange keluar. Opsi dinamis (brand katalog) cukup ganti prop.

   Perilaku dipertahankan: kolom saring muncul di atas ambang panjang, typeahead,
   marker yang menggeser antar baris, panel buka ke atas/bawah menurut ruang,
   satu panel terbuka sekali, gerak GSAP dengan fallback tanpa-animasi. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { gsap, gsapActive } from "../motion.ts";

export type PickerOption = { value: string; label: string; disabled?: boolean };

const FILTER_THRESHOLD = 12;

// Satu panel terbuka sekali: membuka yang baru menutup yang lama.
let openCloser: (() => void) | null = null;

export function Picker({ value, options, onChange, ariaLabel, ariaLabelledby, variant = "field" }: {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  ariaLabelledby?: string;
  variant?: "pill" | "field";
}) {
  const t = useT();
  const rawId = useId();
  const id = `picker-${rawId.replace(/[:]/g, "")}`;
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ str: "", timer: 0 });

  const close = useCallback(() => setOpen(false), []);
  const showFilter = options.length >= FILTER_THRESHOLD;
  const q = showFilter ? filterText.trim().toLowerCase() : "";
  const items = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const current = options.find((o) => o.value === value) || options[0];
  const currentLabel = current?.label ?? "";

  const placePanel = useCallback(() => {
    const trigger = triggerRef.current, wrap = wrapRef.current;
    if (!trigger || !wrap) return;
    const r = trigger.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    wrap.setAttribute("data-drop", below < 240 && r.top > below ? "up" : "down");
  }, []);

  // Sorot aktif digeser marker; baris digulir ke tampilan saat lewat keyboard.
  const moveActive = useCallback((next: number, scroll: boolean) => {
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    setActive(clamped);
    if (scroll) {
      const row = listRef.current?.children[clamped] as HTMLElement | undefined;
      row?.scrollIntoView({ block: "nearest" });
    }
  }, [items.length]);

  // Buka: set aktif ke item terpilih, urus koordinasi single-open + listener.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!open) {
      if (gsapActive()) {
        gsap.to(panel, { autoAlpha: 0, y: -6, duration: 0.16, ease: "power2.in", onComplete: () => { panel.hidden = true; } });
      } else {
        panel.hidden = true;
      }
      if (openCloser === close) openCloser = null;
      return;
    }

    if (openCloser && openCloser !== close) openCloser();
    openCloser = close;

    const selectedAt = items.findIndex((o) => o.value === value);
    setActive(selectedAt >= 0 ? selectedAt : 0);
    panel.hidden = false;
    placePanel();

    if (gsapActive()) {
      const rows = listRef.current ? Array.from(listRef.current.children) : [];
      gsap.killTweensOf([panel, ...rows]);
      gsap.fromTo(panel, { autoAlpha: 0, y: -6, scaleY: 0.97 },
        { autoAlpha: 1, y: 0, scaleY: 1, duration: 0.28, ease: "power3.out", transformOrigin: "top center" });
      gsap.fromTo(rows, { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: "power3.out", stagger: 0.022, clearProps: "opacity,visibility,transform" });
    }
    if (showFilter) filterRef.current?.focus();

    const onDocPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Marker mengikuti baris aktif.
  useEffect(() => {
    if (!open) return;
    const marker = markerRef.current;
    const row = listRef.current?.children[active] as HTMLElement | undefined;
    if (!marker) return;
    if (!row || row.classList.contains("picker__none")) { marker.style.opacity = "0"; return; }
    marker.style.opacity = "1";
    const top = row.offsetTop, h = row.offsetHeight;
    if (gsapActive()) gsap.to(marker, { y: top, height: h, duration: 0.26, ease: "power3.out", overwrite: true });
    else { marker.style.transform = `translateY(${top}px)`; marker.style.height = `${h}px`; }
  }, [active, open, items.length, filterText]);

  const commit = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;
    if (item.value !== value) onChange(item.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onWrapKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); moveActive(active + 1, true); break;
      case "ArrowUp": e.preventDefault(); moveActive(active - 1, true); break;
      case "Home": e.preventDefault(); moveActive(0, true); break;
      case "End": e.preventDefault(); moveActive(items.length - 1, true); break;
      case "Enter": e.preventDefault(); commit(active); break;
      case "Tab": setOpen(false); break;
      case "Escape": e.preventDefault(); setOpen(false); triggerRef.current?.focus(); break;
      default:
        if (!showFilter && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const ta = typeahead.current;
          ta.str += e.key.toLowerCase();
          clearTimeout(ta.timer);
          ta.timer = window.setTimeout(() => { ta.str = ""; }, 600);
          const at = items.findIndex((o) => o.label.toLowerCase().startsWith(ta.str));
          if (at >= 0) moveActive(at, true);
        }
    }
  };

  return (
    <div className={`picker picker--${variant}`} ref={wrapRef} data-open={open || undefined} onKeyDown={onWrapKey}>
      <button
        type="button" className="picker__trigger" id={`${id}-trigger`} ref={triggerRef}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
        aria-label={ariaLabelledby ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledby ? `${ariaLabelledby} ${id}-trigger` : undefined}
        aria-activedescendant={open && items[active] ? `${id}-opt-${active}` : undefined}
        onClick={() => setOpen((v) => !v)} onKeyDown={onTriggerKey}
      >
        <span className="picker__value">{currentLabel}</span>
        <svg className="picker__caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="picker__panel" hidden ref={panelRef}>
        <input
          type="text" className="picker__filter" autoComplete="off" ref={filterRef}
          hidden={!showFilter} aria-label={t("catalog.filterOptions")} placeholder={t("catalog.filterOptions")}
          value={filterText} onChange={(e) => { setFilterText(e.target.value); setActive(0); }}
        />
        <div className="picker__scroll">
          <span className="picker__marker" aria-hidden="true" ref={markerRef}></span>
          <ul className="picker__list" id={`${id}-list`} role="listbox" ref={listRef}
            onPointerMove={(e) => {
              const row = (e.target as HTMLElement).closest<HTMLElement>(".picker__option");
              if (row) setActive(Number(row.dataset.index));
            }}>
            {items.length === 0 ? (
              <li className="picker__none" role="presentation">{t("catalog.noMatch")}</li>
            ) : items.map((o, i) => (
              <li
                key={o.value} className={`picker__option${i === active ? " is-active" : ""}`}
                role="option" id={`${id}-opt-${i}`} aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined} data-value={o.value} data-index={i}
                onClick={() => commit(i)}
              >
                <span className="picker__dot" aria-hidden="true"></span>
                <span className="picker__label">{o.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
