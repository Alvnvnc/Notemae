/* Rute /parfum/:slug sebagai React - island kedua.

   Detail parfum (KF-04) + rekomendasi dupe terurut (KF-05), skor kemiripan
   notes (KF-06), dan penghematan harga (KF-08). Penjelasan AI opsional lewat
   GET /v1/fragrances/{slug}/dupes?explain=true.

   Dua keputusan penting saat porting:
   - Tombol "jelaskan" itu satu-satunya bagian yang benar-benar stateful, jadi
     ia komponen sendiri (ExplainPanel). Menaruh state di sana membuat sisa
     halaman tidak ikut re-render - penting karena skor dupe dimutasi imperatif
     oleh count-up dan tidak boleh ditimpa React.
   - Gerak dibiarkan pakai helper motion.js yang sudah ada (riseLines/growBars/
     pyramidReveal/countUp): itu helper generik yang juga dipakai rute legacy
     lain dan tetap tinggal di sana sampai Fase 5. Dibungkus useGSAP hanya untuk
     scope + auto-cleanup; instans gsap-nya sama, jadi trigger yang mereka buat
     ikut di-revert saat island unmount. */
import { useEffect, useRef, useState } from "react";
import type { DupeResponse, Fragrance, NoteTier, RelatedFragrance } from "../../lib/api-types.ts";
import { getDupes, getFragrance } from "../../lib/api.ts";
import {
  climateLabel, displayName, escapeHtml, genderLabel, noteOverlap, occasionLabel,
  pyramidOf, relationClaim, relationLabel, renderMarkdown, rupiah, savings,
} from "../../lib/format.ts";
import { t } from "../../lib/i18n.ts";
import { countUp, growBars, pyramidReveal, refreshTriggers, riseLines } from "../../legacy/motion.js";
import { mountIsland } from "../island.ts";
import { useGSAP } from "../motion.ts";

function Pyramid({ f }: { f: Fragrance }) {
  const tiers = pyramidOf(f);
  if (!tiers) {
    const notes = f.notes || [];
    if (!notes.length) return null;
    return (
      <div data-reveal="">
        <h2 className="h-sect">{t("detail.title")}</h2>
        <div className="detail__tags" style={{ marginTop: 18 }}>
          {notes.map((n) => (
            <span className="tag" style={{ textTransform: "capitalize" }} key={n}>{n}</span>
          ))}
        </div>
      </div>
    );
  }
  /* Tier kosong dilewati, bukan digambar kosong: piramida tersimpan boleh saja
     tidak menyebut heart, dan baris label tanpa isi terbaca seolah parfumnya
     memang tidak punya bagian itu. */
  const tier = (key: NoteTier, notes: string[]) => (notes.length ? (
    <div className="pyramid__tier" data-tier={key} key={key}>
      <p className="pyramid__label">{t(`detail.tier.${key}`)}</p>
      <p className="pyramid__notes">{notes.map((n) => <span key={n}>{n}</span>)}</p>
    </div>
  ) : null);
  return (
    <div>
      <h2 className="h-sect" data-reveal="">{t("detail.pyramid")}</h2>
      <div className="pyramid">
        {tier("top", tiers.top)}
        {tier("heart", tiers.heart)}
        {tier("base", tiers.base)}
      </div>
      {tiers.estimated && <p className="pyramid__hint">{t("detail.pyramidHint")}</p>}
    </div>
  );
}

function DupeRow({ original, rel }: { original: Fragrance; rel: RelatedFragrance }) {
  const d = rel.fragrance;
  const ov = noteOverlap(original.notes, d.notes);
  const save = savings(original.price_idr, d.price_idr);
  const oriTotal = new Set([...ov.shared, ...ov.onlyA]).size;
  return (
    <article className="dupe">
      <div>
        <h3 className="dupe__name">
          <a href={`/parfum/${encodeURIComponent(d.slug)}`}>{displayName(d.brand, d.name)}</a>
        </h3>
        <p className="dupe__claim">{relationClaim(rel.relation, rel.confidence, displayName(original.brand, original.name))}</p>
        <div className="dupe__facts">
          <span className="dupe__fact">{t("relation.similar")} <strong>{relationLabel(rel.relation)}</strong></span>
          <span className="dupe__fact">{t("common.notes")} <strong>{ov.shared.length} / {oriTotal}</strong></span>
          <span className="dupe__fact">{t("detail.price")} <strong>{rupiah(d.price_idr)}</strong></span>
          {save && (
            <span className="dupe__fact">{t("common.savings")} <strong className="save">{rupiah(save.diff)} ({save.pct}%)</strong></span>
          )}
        </div>
      </div>
      {/* data-count dibaca count-up; teks "0%" dimutasi imperatif dan tak
          pernah ditimpa React karena baris ini tidak pernah re-render. */}
      <div className="dupe__score">
        <strong data-count={ov.pct}>0%</strong>
        <span>{t("common.similarity")}</span>
      </div>
      <div className="dupe__cta">
        <a className="btn" href={`/bandingkan/${encodeURIComponent(original.slug)}/vs/${encodeURIComponent(d.slug)}`}>{t("common.compare")}</a>
      </div>
    </article>
  );
}

/* Baris relasi ringkas dipakai tiga section: original_of, flankers, similar. */
function RelationRow({ f, label, sim, compareHref }: {
  f: Fragrance;
  label: string;
  sim?: string;
  compareHref?: string;
}) {
  return (
    <div className="similar__row">
      <a href={`/parfum/${encodeURIComponent(f.slug)}`}>{displayName(f.brand, f.name)}</a>
      <span className="brand">{label}</span>
      {sim && <span className="sim">{sim}</span>}
      {compareHref && <a className="sim" href={compareHref}>{t("common.compare")} ›</a>}
    </div>
  );
}

/* Satu-satunya bagian stateful. Sengaja komponen terpisah supaya klik tidak
   memicu re-render skor dupe yang sudah dimutasi count-up. */
function ExplainPanel({ slug }: { slug: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    done: boolean;
    body: string;
    status: string;
    tone?: "error";
  }>({ loading: false, done: false, body: "", status: "" });

  // Konten baru menggeser posisi elemen di bawahnya; trigger perlu dihitung ulang.
  useEffect(() => {
    if (state.done) refreshTriggers();
  }, [state.done]);

  const onClick = async () => {
    setState((s) => ({ ...s, loading: true, status: t("detail.aiLoading") }));
    try {
      const data = await getDupes(slug, { explain: true });
      setState({
        loading: false,
        done: true,
        body: renderMarkdown(data.explanation || ""),
        status: !data.explanation ? t("detail.noDupes") : data.generated_by ? t("home.ai") : "",
      });
    } catch {
      setState((s) => ({ ...s, loading: false, status: t("detail.aiUnavailable"), tone: "error" }));
    }
  };

  return (
    <div className="explain" id="explain">
      {!state.done && (
        <button
          className="btn btn--ghost" id="explain-btn" type="button"
          disabled={state.loading} aria-busy={state.loading} onClick={onClick}
        >
          <span>{t("detail.ai")}</span>
          <span className="spin" aria-hidden="true" />
        </button>
      )}
      <p className="status" id="explain-status" role="status" data-tone={state.tone}>{state.status}</p>
      {/* renderMarkdown sudah meng-escape input; hanya tag milik kita yang masuk. */}
      <div className="explain__body" id="explain-body" dangerouslySetInnerHTML={{ __html: state.body }} />
    </div>
  );
}

function Detail({ f, bundle, slug }: { f: Fragrance; bundle: DupeResponse | null; slug: string }) {
  const dupes = bundle?.dupes || [];
  const originalOf = bundle?.original_of || [];
  const flankers = bundle?.flankers || [];
  const similar = bundle?.similar || [];
  const sortedDupes = dupes.slice().sort((a, b) => b.confidence - a.confidence);
  const hasAnyRelation = sortedDupes.length || originalOf.length || flankers.length || similar.length;

  const tags = [
    genderLabel(f.gender),
    f.release_year ? t("detail.release", { year: f.release_year }) : "",
    ...(f.occasions || []).map(occasionLabel),
    ...(f.climates || []).map(climateLabel),
  ].filter(Boolean);

  const name = displayName("", f.name);
  const scope = useRef<HTMLElement>(null);

  /* Gerak identik dengan versi legacy - helper yang sama, dibungkus useGSAP
     agar trigger yang dibuatnya di-revert saat island unmount. Helper-nya
     menjaga jalur non-GSAP sendiri, jadi tidak digerbang di sini. */
  useGSAP(() => {
    const root = scope.current;
    if (!root) return;
    riseLines(root.querySelector("#detail-name"), 0.1);
    growBars(root);
    pyramidReveal(root);
    root.querySelectorAll<HTMLElement>(".dupe__score strong[data-count]").forEach((el) => {
      countUp(el, Number(el.dataset.count), { render: (v: number) => { el.textContent = `${v}%`; } });
    });
  }, { scope });

  return (
    <article className="detail sect shell" ref={scope}>
      <a className="crumb" href="/katalog">‹ {t("common.backCatalog")}</a>

      <header className="detail__head">
        <p className="detail__brand">{f.brand}</p>
        <h1 className="detail__name" id="detail-name">{name}</h1>
        {f.description && <p className="lede detail__desc">{f.description}</p>}
        {tags.length > 0 && (
          <div className="detail__tags">
            {tags.map((tag, i) => <span className="tag" key={i}>{tag}</span>)}
          </div>
        )}
      </header>

      <div className="detail__grid">
        <aside className="detail__aside">
          <div className="pricecard" data-reveal="">
            <p className="pricecard__label">{t("detail.price")}</p>
            <p className="pricecard__value">{rupiah(f.price_idr)}</p>
            {f.rating && <p className="pricecard__rating">{t("common.rating")} ★ {Number(f.rating).toFixed(1)}</p>}
          </div>
          {(f.longevity_score || f.projection_score) && (
            <div className="perf" data-reveal="">
              {f.longevity_score && (
                <div className="perf__row">
                  <div className="perf__head"><span>{t("detail.longevity")}</span><strong>{Number(f.longevity_score).toFixed(1)} / 5</strong></div>
                  <div className="perf__bar" data-scale={(Number(f.longevity_score) / 5).toFixed(2)}></div>
                </div>
              )}
              {f.projection_score && (
                <div className="perf__row">
                  <div className="perf__head"><span>{t("detail.projection")}</span><strong>{Number(f.projection_score).toFixed(1)} / 5</strong></div>
                  <div className="perf__bar" data-scale={(Number(f.projection_score) / 5).toFixed(2)}></div>
                </div>
              )}
            </div>
          )}
          <p className="detail__source" data-reveal="">
            {t("common.source")}: {String(f.source_type || "catalog").replace(/_/g, " ")}.{" "}
            {f.source_url && <a href={f.source_url} target="_blank" rel="noopener">{t("common.viewSource")}</a>}
          </p>
        </aside>

        <div>
          <Pyramid f={f} />

          <section className="dupes" aria-labelledby="dupes-title">
            <div className="dupes__head">
              <h2 className="h-sect" id="dupes-title" data-reveal="">{t("detail.dupes")}</h2>
              <p className="status" data-reveal="">
                {sortedDupes.length ? t("detail.sorted", { count: sortedDupes.length }) : t("detail.noDupes")}
              </p>
            </div>
            <div id="dupe-list">
              {sortedDupes.map((rel) => <DupeRow original={f} rel={rel} key={rel.fragrance.slug} />)}
            </div>
            {!sortedDupes.length && similar.length > 0 && (
              <p className="status">{t("relation.similar")}: {t("compare.disclaimer")}</p>
            )}

            {hasAnyRelation ? <ExplainPanel slug={slug} /> : null}

            {bundle?.disclaimer && <p className="disclaimer">{bundle.disclaimer}</p>}
          </section>

          {originalOf.length > 0 && (
            <section className="similar" aria-labelledby="ori-title">
              <h2 className="h-sect" id="ori-title" data-reveal="">{t("detail.dupes")}</h2>
              <p className="status" data-reveal="">{t("role.alternative")}:</p>
              <div className="similar__list">
                {originalOf.map((rel) => (
                  <RelationRow
                    f={rel.fragrance}
                    label={relationLabel(rel.relation)}
                    compareHref={`/bandingkan/${encodeURIComponent(rel.fragrance.slug)}/vs/${encodeURIComponent(f.slug)}`}
                    key={rel.fragrance.slug}
                  />
                ))}
              </div>
            </section>
          )}

          {flankers.length > 0 && (
            <section className="similar" aria-labelledby="flank-title">
              <h2 className="h-sect" id="flank-title" data-reveal="">{t("relation.flanker_of")}</h2>
              <div className="similar__list">
                {flankers.map((rel) => (
                  <RelationRow f={rel.fragrance} label={t("relation.flanker_of")} key={rel.fragrance.slug} />
                ))}
              </div>
            </section>
          )}

          {similar.length > 0 && (
            <section className="similar" aria-labelledby="similar-title">
              <h2 className="h-sect" id="similar-title" data-reveal="">{t("relation.similar")} profile.</h2>
              <p className="status" data-reveal="">{t("compare.disclaimer")}</p>
              <div className="similar__list">
                {similar.map((s) => (
                  <RelationRow
                    f={s}
                    label={s.brand}
                    sim={typeof s.semantic_similarity === "number"
                      ? `${Math.round(s.semantic_similarity * 100)}% ${t("common.similarity")}`
                      : undefined}
                    key={s.slug}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

function notFound(slug: string) {
  return {
    title: t("errors.notFound"),
    desc: t("errors.notFound"),
    stage: false,
    html: `
      <section class="detail sect shell">
        <div class="empty">
          <p class="h-sect">${t("errors.notFound")}</p>
          <p>${escapeHtml(t("errors.notFoundHint", { slug }))}</p>
          <a class="btn" href="/katalog">${t("common.backCatalog")}</a>
        </div>
      </section>`,
  };
}

export async function detailView({ slug }: { slug: string }) {
  let f: Fragrance;
  let bundle: DupeResponse | null;
  try {
    [f, bundle] = await Promise.all([getFragrance(slug), getDupes(slug).catch(() => null)]);
  } catch {
    return notFound(slug);
  }

  const sortedCount = (bundle?.dupes || []).length;

  return {
    title: displayName(f.brand, f.name),
    desc: `${displayName(f.brand, f.name)}: detail notes, harga, dan ${sortedCount || "daftar"} alternatif dupe dengan skor kemiripan.`,
    stage: false,
    html: "",
    mount(root: HTMLElement) {
      return mountIsland(root, <Detail f={f} bundle={bundle} slug={slug} />);
    },
  };
}
