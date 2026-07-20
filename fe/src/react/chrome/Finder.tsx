/* Overlay pencarian cepat (KF-02). Buka/tutup dikendalikan induk (masthead +
   pintasan papan tik). Autocomplete-nya pakai helper legacy apa adanya -
   diikat imperatif ke input/list lewat ref, dan navigasinya lewat react-router.

   CSS transisi bergantung pada body[data-finder="open"], jadi atribut itu tetap
   dipasang di sini. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { attachAutocomplete } from "../../legacy/autocomplete.js";
import { lockScroll, reduceMotion } from "../../legacy/motion.js";
import { useT } from "../i18n.tsx";

type Ac = { close: () => void; destroy: () => void };

export function Finder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(true);
  const finderRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const acRef = useRef<Ac | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Autocomplete dipasang sekali; handler membaca onClose terbaru lewat ref
  // supaya tidak perlu re-attach tiap render induk.
  useEffect(() => {
    if (!inputRef.current || !listRef.current) return;
    acRef.current = attachAutocomplete({
      input: inputRef.current,
      list: listRef.current,
      onPick: (f: { slug: string }) => { onCloseRef.current(); navigate(`/parfum/${encodeURIComponent(f.slug)}`); },
      onSubmit: (q: string) => { onCloseRef.current(); navigate(`/katalog?q=${encodeURIComponent(q)}`); },
    });
    return () => acRef.current?.destroy();
  }, [navigate]);

  useEffect(() => {
    const body = document.body;
    if (open) {
      lastFocus.current = document.activeElement as HTMLElement;
      setHidden(false);
      const raf = requestAnimationFrame(() => body.setAttribute("data-finder", "open"));
      lockScroll(true);
      if (inputRef.current) { inputRef.current.value = ""; inputRef.current.focus(); }
      return () => cancelAnimationFrame(raf);
    }
    body.removeAttribute("data-finder");
    acRef.current?.close();
    lockScroll(false);
    const tm = setTimeout(() => setHidden(true), reduceMotion ? 0 : 240);
    lastFocus.current?.focus?.();
    return () => clearTimeout(tm);
  }, [open]);

  // Esc menutup finder; autocomplete menutup daftarnya sendiri lebih dulu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className="finder" id="finder" role="dialog" aria-modal="true"
      aria-label={t("search.label")} hidden={hidden} ref={finderRef}
      onPointerDown={(e) => { if (e.target === finderRef.current) onClose(); }}
    >
      <div className="finder__panel">
        <form className="finder__form" id="finder-form" role="search" onSubmit={(e) => e.preventDefault()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id="finder-input" type="search" name="q" placeholder={t("search.placeholder")}
            autoComplete="off" aria-autocomplete="list" aria-controls="finder-list"
            aria-expanded="false" role="combobox" ref={inputRef}
          />
          <button className="finder__close" id="finder-close" type="button" aria-label={t("nav.close")} onClick={onClose}>Esc</button>
        </form>
        <ul className="finder__list" id="finder-list" role="listbox" aria-label={t("search.suggestions")} ref={listRef}></ul>
        <p className="finder__hint" id="finder-hint">{t("search.hint")}</p>
      </div>
    </div>
  );
}
