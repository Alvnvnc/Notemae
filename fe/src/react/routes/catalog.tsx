/* Rute /katalog sebagai React asli (KF-01 grid + pagination, KF-02 pencarian +
   autocomplete, KF-03 filter, KF-09 notes). Filter tersinkron ke query string
   agar URL bisa dibagikan (KNF-12).

   Pemisahan kueri server vs filter klien dipertahankan: {q, keluarga, harga}
   memicu fetch; {gender, brand, harga} menyaring hasil di klien. Nama param
   sengaja tetap Indonesia (keluarga/harga/hal) supaya tautan lama tetap sah. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Fragrance } from "../../lib/api-types.ts";
import { searchFragrances } from "../../lib/api.ts";
import { FAMILIES, GENDERS, PAGE_SIZE, PRICE_RANGES, priceRangeLabel } from "../../lib/config.ts";
import { displayName, genderLabel, rupiah } from "../../lib/format.ts";
import { attachSheen, revealCards } from "../../legacy/motion.js";
import { useT } from "../i18n.tsx";
import { useRouteMeta } from "../meta.ts";
import { useReveal } from "../reveal.ts";
import { Picker } from "../ui/Picker.tsx";
import { useAutocomplete } from "../ui/useAutocomplete.ts";

function Card({ f }: { f: Fragrance }) {
  const t = useT();
  const notes = (f.notes || []).join(", ");
  const meta = [genderLabel(f.gender), f.rating ? `★ ${Number(f.rating).toFixed(1)}` : ""].filter(Boolean).join("  ");
  return (
    <a className="card" href={`/parfum/${encodeURIComponent(f.slug)}`} aria-label={displayName(f.brand, f.name)}>
      <p className="card__brand">{f.brand}</p>
      <h3 className="card__name">{displayName("", f.name)}</h3>
      <p className="card__notes">{notes || t("common.noNotes")}</p>
      <div className="card__foot">
        <span className="card__price">{rupiah(f.price_idr)}</span>
        <span className="card__meta">{meta}</span>
      </div>
    </a>
  );
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  const t = useT();
  if (totalPages <= 1) return null;
  const btn = (p: number, label: string, current: boolean) => (
    <button type="button" key={`${label}-${p}`} aria-current={current ? "page" : undefined} aria-label={t("catalog.page", { page: p })} onClick={() => onPage(p)}>{label}</button>
  );
  const out: React.ReactNode[] = [];
  if (page > 1) out.push(btn(page - 1, "‹", false));
  let gapped = false;
  for (let p = 1; p <= totalPages; p += 1) {
    if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - page) > 1) {
      if (!gapped) { out.push(<span className="pager__gap" key={`gap-${p}`}>…</span>); gapped = true; }
      continue;
    }
    gapped = false;
    out.push(btn(p, String(p), p === page));
  }
  if (page < totalPages) out.push(btn(page + 1, "›", false));
  return <>{out}</>;
}

export function CatalogRoute() {
  const t = useT();
  useRouteMeta({ title: t("nav.catalog"), desc: t("catalog.title"), stage: false });
  useReveal();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") || "";
  const family = params.get("keluarga") || "";
  const gender = params.get("gender") || "";
  const price = Math.min(Number(params.get("harga")) || 0, PRICE_RANGES.length - 1);
  const brand = params.get("brand") || "";
  const page = Math.max(1, Number(params.get("hal")) || 1);

  const [all, setAll] = useState<Fragrance[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ text: string; tone: "error" | null }>({ text: "", tone: null });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const update = (mut: (p: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(params);
    mut(next);
    if (resetPage) next.delete("hal");
    setParams(next, { replace: true });
  };

  // Fetch hanya saat kueri server berubah (q/keluarga/harga). gender/brand/page
  // menyaring & memaginasi di klien tanpa memanggil API lagi.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setStatus({ text: t("catalog.loading"), tone: null });
    (async () => {
      const fam = FAMILIES.find((f) => f.q === family);
      const range = PRICE_RANGES[price]!;
      try {
        let items = await searchFragrances({ q: q || (fam ? fam.q : ""), note: fam ? fam.note : "", maxPriceIdr: range.max || 0, signal: controller.signal });
        if (fam && !items.length) items = await searchFragrances({ q: fam.q, maxPriceIdr: range.max || 0, signal: controller.signal });
        setAll(items);
        setStatus({ text: "", tone: null });
      } catch {
        if (controller.signal.aborted) return;
        setAll([]);
        setStatus({ text: t("catalog.error"), tone: "error" });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, family, price]);

  const brands = useMemo(() => [...new Set(all.map((f) => f.brand).filter(Boolean))].sort(), [all]);
  const brandEffective = brands.includes(brand) ? brand : "";

  const filtered = useMemo(() => {
    const range = PRICE_RANGES[price]!;
    return all.filter((f) => {
      if (gender && f.gender !== gender) return false;
      if (brandEffective && f.brand !== brandEffective) return false;
      if (range.min && (!f.price_idr || f.price_idr < range.min)) return false;
      if (range.max && f.price_idr && f.price_idr > range.max) return false;
      return true;
    });
  }, [all, gender, brandEffective, price]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageC = Math.min(page, totalPages);
  const pageItems = useMemo(() => filtered.slice((pageC - 1) * PAGE_SIZE, pageC * PAGE_SIZE), [filtered, pageC]);

  useAutocomplete({
    inputRef, listRef, itemClass: "finder__item",
    onPick: (f) => navigate(`/parfum/${encodeURIComponent(f.slug)}`),
    onSubmit: (query) => update((p) => { query ? p.set("q", query) : p.delete("q"); }),
  });

  // Entrance kartu tiap kali halaman/ filter berganti.
  useEffect(() => {
    if (loading || !gridRef.current) return;
    const cards = Array.from(gridRef.current.querySelectorAll<HTMLElement>(".card:not(.skel)"));
    if (cards.length) revealCards(cards);
  }, [pageItems, loading]);

  useEffect(() => { if (gridRef.current) attachSheen(gridRef.current); }, []);

  const resetFilters = () => {
    if (inputRef.current) inputRef.current.value = "";
    setParams(new URLSearchParams(), { replace: true });
  };

  const genderOptions = GENDERS.map((g) => ({ value: g, label: g ? t(`gender.${g}`) : t("gender.all") }));
  const priceOptions = PRICE_RANGES.map((_, i) => ({ value: String(i), label: priceRangeLabel(i) }));
  const brandOptions = [{ value: "", label: t("catalog.allBrands") }, ...brands.map((b) => ({ value: b, label: b }))];

  const showSkeleton = loading && all.length === 0;
  const showEmpty = !loading && filtered.length === 0;

  return (
    <section className="catalog sect shell" aria-labelledby="catalog-title">
      <div className="catalog__head">
        <div className="catalog__title">
          <h1 className="h-sect" id="catalog-title">{t("catalog.title")}</h1>
          <span className="catalog__count" id="catalog-count" aria-live="polite">{t("catalog.count", { count: filtered.length })}</span>
        </div>
        <div className="catalog__search">
          <form id="catalog-search-form" role="search" onSubmit={(e) => { e.preventDefault(); update((p) => { const v = inputRef.current?.value.trim() || ""; v ? p.set("q", v) : p.delete("q"); }); }}>
            <label className="sr-only" htmlFor="catalog-q">{t("catalog.searchLabel")}</label>
            <input id="catalog-q" type="search" name="q" placeholder={t("catalog.searchPlaceholder")}
              defaultValue={q} autoComplete="off" role="combobox" aria-autocomplete="list"
              aria-controls="catalog-suggest" aria-expanded="false" ref={inputRef} />
            <button className="btn" type="submit">{t("catalog.search")}</button>
          </form>
          <ul className="suggest" id="catalog-suggest" role="listbox" aria-label={t("search.suggestions")} ref={listRef}></ul>
        </div>
      </div>

      <div className="filters" aria-label={t("catalog.filter")}>
        <div className="filters__row" id="filter-family" role="group" aria-label={t("catalog.family")}>
          <span className="filters__label" aria-hidden="true">{t("catalog.family")}</span>
          {FAMILIES.map((f) => (
            <button className="chip" type="button" key={f.q} data-family={f.q} data-note={f.note}
              aria-pressed={family === f.q}
              onClick={() => update((p) => { family === f.q ? p.delete("keluarga") : p.set("keluarga", f.q); })}>
              {f.name}
            </button>
          ))}
        </div>
        <div className="filters__row">
          <span className="filters__label" aria-hidden="true">{t("catalog.filter")}</span>
          <Picker value={gender} options={genderOptions} variant="pill" ariaLabel="Gender"
            onChange={(v) => update((p) => { v ? p.set("gender", v) : p.delete("gender"); })} />
          <Picker value={String(price)} options={priceOptions} variant="pill" ariaLabel={t("detail.price")}
            onChange={(v) => update((p) => { Number(v) ? p.set("harga", v) : p.delete("harga"); })} />
          <Picker value={brandEffective} options={brandOptions} variant="pill" ariaLabel="Brand"
            onChange={(v) => update((p) => { v ? p.set("brand", v) : p.delete("brand"); })} />
          <button className="filters__reset" id="filter-reset" type="button" onClick={resetFilters}>{t("catalog.reset")}</button>
        </div>
      </div>

      <p className="status" id="catalog-status" role="status" data-tone={status.tone || undefined}>{status.text}</p>
      <div className="grid" id="catalog-grid" style={{ marginTop: 18 }} ref={gridRef}>
        {showSkeleton
          ? Array.from({ length: 8 }, (_, i) => <div className="card skel" aria-hidden="true" key={i}><i></i><i></i><i></i><i></i></div>)
          : showEmpty
            ? (
              <div className="empty" style={{ gridColumn: "1/-1" }}>
                <p className="h-sect">{t("catalog.empty")}</p>
                <p>{t("catalog.emptyHint")}</p>
                <button className="btn btn--ghost" type="button" onClick={resetFilters}>{t("catalog.reset")}</button>
              </div>
            )
            : pageItems.map((f) => <Card f={f} key={f.slug} />)}
      </div>
      <nav className="pager" id="catalog-pager" aria-label={t("catalog.pagination")}>
        {!showSkeleton && !showEmpty && <Pager page={pageC} totalPages={totalPages} onPage={(p) => update((pp) => { p > 1 ? pp.set("hal", String(p)) : pp.delete("hal"); }, false)} />}
      </nav>
    </section>
  );
}
