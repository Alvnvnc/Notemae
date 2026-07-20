/* Rute / (beranda) sebagai React asli - rute terbesar.

   Markup dirender JSX (siap di-SSR di Fase 5c); galeri 3D three.js + panel geser
   dupe dinaikkan imperatif di browser lewat showcase-island.js, persis pola
   lama: server kirim shelf tautan, klien menaikkannya jadi 3D kalau WebGL ada.
   Hero/duo/how/rail deklaratif; seksi konsultan memakai ulang <ConsultForm />. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import type { DupeResponse, Fragrance, RelatedFragrance } from "../../lib/api-types.ts";
import { STAGE_DEFAULT } from "../../lib/config.ts";
import { displayName, noteOverlap, relationClaim, rupiah, rupiahCompact, savings } from "../../lib/format.ts";
import { countUp, heroIntro, revealCards } from "../../legacy/motion.js";
import { loadHome } from "../../legacy/views/home.markup.js";
import { useT } from "../i18n.tsx";
import { gsap, gsapActive } from "../motion.ts";
import { useRouteMeta } from "../meta.ts";
import { useReveal } from "../reveal.ts";
import { ConsultForm } from "./consult.tsx";
import { bindDupeSheet, bindShowcase } from "./showcase-island.js";

type ShowcaseItem = { slug: string; glass: string; liquid: string; metal: string; fragrance: Fragrance;[k: string]: unknown };

function bestDupe(bundle: DupeResponse): RelatedFragrance | null {
  const list = (bundle.dupes || []).slice().sort((x, y) => y.confidence - x.confidence);
  return list[0] || null;
}

function Hero() {
  const t = useT();
  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <p className="hero__eyebrow">{t("home.eyebrow")}</p>
      <h1 className="h-display hero__title" id="hero-title">
        <span className="line"><span>{t("home.hero1")}</span></span>
        <span className="line"><span><em>{t("home.hero2")}</em></span></span>
      </h1>
      <div className="hero__foot">
        <p className="lede hero__lede">{t("home.lede")}</p>
        <a className="btn" href="/katalog">{t("home.browse")}</a>
        <a className="link-quiet" href="/#pasangan">{t("home.featured")}</a>
      </div>
    </section>
  );
}

function Showcase({ items }: { items: ShowcaseItem[] }) {
  const t = useT();
  if (!items.length) return null;
  const first = items[0]!.fragrance;
  return (
    <section className="showcase sect" id="koleksi" aria-labelledby="showcase-title" data-showcase="">
      <div className="showcase__head shell">
        <h2 className="h-sect" id="showcase-title" data-reveal="">{t("home.showcase")}</h2>
        <p className="lede showcase__lede" data-reveal="">{t("home.showcaseLede")}</p>
      </div>
      <div className="showcase__stage" id="showcase-stage">
        <canvas className="showcase__canvas" id="showcase-canvas" hidden></canvas>
        <ol className="showcase__shelf" id="showcase-shelf">
          {items.map((it, i) => (
            <li className="showcase__slot" data-slot={i} key={it.fragrance.slug}>
              <a className="bottle" href={`/parfum/${encodeURIComponent(it.fragrance.slug)}`}
                style={{ "--glass": it.glass, "--liquid": it.liquid, "--cap": it.metal } as React.CSSProperties}>
                <span className="bottle__art" aria-hidden="true"><i className="bottle__cap"></i><i className="bottle__neck"></i><i className="bottle__body"></i></span>
                <span className="bottle__brand">{it.fragrance.brand}</span>
                <span className="bottle__name">{displayName("", it.fragrance.name)}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="showcase__hud" id="showcase-hud" hidden>
          <button className="showcase__step" type="button" data-step="-1" aria-label={t("home.showcasePrev")}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <p className="showcase__now" aria-live="polite">
            <span className="showcase__now-brand" id="showcase-brand">{first.brand}</span>
            <span className="showcase__now-name" id="showcase-name">{displayName("", first.name)}</span>
          </p>
          <button className="showcase__step" type="button" data-step="1" aria-label={t("home.showcaseNext")}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="btn btn--ghost showcase__open" type="button" id="showcase-open">{t("home.showcaseOpen")}</button>
        </div>
      </div>
      <aside className="sheet" id="dupe-sheet" role="dialog" aria-modal="true" aria-labelledby="dupe-sheet-title" hidden>
        <div className="sheet__panel">
          <header className="sheet__head">
            <p className="sheet__role">{t("role.original")}</p>
            <h3 className="sheet__title" id="dupe-sheet-title"></h3>
            <p className="sheet__brand" id="dupe-sheet-brand"></p>
            <button className="sheet__close" type="button" id="dupe-sheet-close" aria-label={t("nav.close")}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" /></svg>
            </button>
          </header>
          <div className="sheet__body" id="dupe-sheet-body"></div>
        </div>
      </aside>
    </section>
  );
}

function Duo({ bundles }: { bundles: DupeResponse[] }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const saveRef = useRef<HTMLParagraphElement>(null);
  const has = bundles.length > 0;
  const bundle = bundles[index];
  const rel = bundle ? bestDupe(bundle) : null;

  const stage = useMemo(() => {
    if (!bundle || !rel) return null;
    const ori = bundle.fragrance;
    const dup = rel.fragrance;
    const ov = noteOverlap(ori.notes, dup.notes);
    const save = savings(ori.price_idr, dup.price_idr);
    return { ori, dup, ov, save, target: save ? save.pct : ov.pct };
  }, [bundle, rel]);

  useEffect(() => {
    if (!stage || !saveRef.current) return;
    countUp(saveRef.current, stage.target, { render: (v: number) => { if (saveRef.current) saveRef.current.textContent = `${v}%`; } });
    if (index > 0 && gsapActive()) {
      gsap.fromTo(".duo__side, .duo__mid", { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.08, clearProps: "opacity,visibility,transform" });
    }
  }, [index, stage]);

  return (
    <section className="duo sect shell" id="pasangan" aria-labelledby="duo-title">
      <h2 className="h-sect" id="duo-title" data-reveal="">{t("home.pairs")}</h2>
      <div className="duo__pick" id="duo-pick" role="group" aria-label={t("home.pick")} data-reveal="">
        {has && bundles.map((b, i) => (
          <button className="chip" type="button" key={b.fragrance.slug} aria-pressed={i === index} onClick={() => setIndex(i)}>
            {displayName(b.fragrance.brand, b.fragrance.name)}
          </button>
        ))}
      </div>
      <div id="duo-stage-wrap" aria-live="polite">
        {stage ? (
          <div className="duo__stage" id="duo-stage">
            <div className="duo__side duo__side--ori">
              <p className="duo__role">{t("role.original")}</p>
              <p className="duo__name">{displayName("", stage.ori.name)}</p>
              <p className="duo__brand">{stage.ori.brand}</p>
              <p className="duo__price">{rupiah(stage.ori.price_idr)}</p>
            </div>
            <div className="duo__mid">
              <p className="duo__save-label">{stage.save ? t("common.savings") : t("common.similarity")}</p>
              <p className="duo__save" id="duo-save" ref={saveRef}>{stage.target}%</p>
              <p className="duo__overlap">{stage.ov.shared.length} / {new Set([...stage.ov.shared, ...stage.ov.onlyA]).size} {t("common.notes").toLowerCase()}</p>
            </div>
            <div className="duo__side duo__side--dup">
              <p className="duo__role">{t("role.alternative")}</p>
              <p className="duo__name">{displayName("", stage.dup.name)}</p>
              <p className="duo__brand">{stage.dup.brand}</p>
              <p className="duo__price">{rupiah(stage.dup.price_idr)}</p>
            </div>
          </div>
        ) : (
          <div className="empty">
            <p className="h-sect">{t("detail.noDupes")}</p>
            <p>{t("catalog.error")}</p>
            <a className="btn btn--ghost" href="/katalog">{t("home.browse")}</a>
          </div>
        )}
      </div>
      <div className="duo__foot">
        <p className="duo__claim" id="duo-claim">{stage && rel ? relationClaim(rel.relation, rel.confidence, displayName(stage.ori.brand, stage.ori.name)) : ""}</p>
        <div id="duo-cta">
          {stage && <a className="btn btn--ghost" href={`/bandingkan/${encodeURIComponent(stage.ori.slug)}/vs/${encodeURIComponent(stage.dup.slug)}`}>{t("common.detail")}</a>}
        </div>
      </div>
    </section>
  );
}

function How() {
  const t = useT();
  return (
    <section className="how sect shell" aria-labelledby="how-title">
      <h2 className="h-sect" id="how-title" data-reveal="">{t("home.steps")}</h2>
      <ol className="how__list" style={{ marginTop: "clamp(36px, 5vw, 64px)" }}>
        <li className="how__item" data-reveal=""><h3>{t("home.step1")}</h3><p>{t("home.step1p")}</p></li>
        <li className="how__item" data-reveal=""><h3>{t("home.step2")}</h3><p>{t("home.step2p")}</p></li>
        <li className="how__item" data-reveal=""><h3>{t("home.step3")}</h3><p>{t("home.step3p")}</p></li>
      </ol>
    </section>
  );
}

function Rail({ bundles }: { bundles: DupeResponse[] }) {
  const t = useT();
  const pairs = useMemo(() => {
    const out: { ori: Fragrance; rel: RelatedFragrance; dup: Fragrance }[] = [];
    for (const b of bundles) for (const rel of b.dupes || []) out.push({ ori: b.fragrance, rel, dup: rel.fragrance });
    out.sort((x, y) => y.rel.confidence - x.rel.confidence);
    return out;
  }, [bundles]);
  if (!pairs.length) return <section className="rail sect shell" aria-labelledby="rail-title" hidden />;
  return (
    <section className="rail sect shell" aria-labelledby="rail-title">
      <div className="rail__head">
        <h2 className="h-sect" id="rail-title" data-reveal="">{t("home.consensus")}</h2>
        <a className="link-quiet" href="/katalog" data-reveal="">{t("home.all")}</a>
      </div>
      <div className="rail__track" id="rail-track" role="list">
        {pairs.map(({ ori, dup }) => {
          const save = savings(ori.price_idr, dup.price_idr);
          const ov = noteOverlap(ori.notes, dup.notes);
          return (
            <a className="pair-card" role="listitem" key={`${ori.slug}-${dup.slug}`}
              href={`/bandingkan/${encodeURIComponent(ori.slug)}/vs/${encodeURIComponent(dup.slug)}`}
              aria-label={`${t("common.compare")} ${displayName(dup.brand, dup.name)} / ${displayName(ori.brand, ori.name)}`}>
              <p className="pair-card__dupe">{displayName(dup.brand, dup.name)}</p>
              <p className="pair-card__ori">vs {displayName(ori.brand, ori.name)}</p>
              <div className="pair-card__meta">
                <span className="pair-card__save">{save ? `${t("common.savings")} ${save.pct}%` : `${ov.pct}% ${t("common.similarity")}`}</span>
                <span className="pair-card__price">{rupiahCompact(dup.price_idr)}</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

/* Loader react-router: dipakai server (SSR) maupun klien. Mengembalikan data
   yang sama dengan loadHome() lama. */
export async function homeLoader(): Promise<{ bundles: DupeResponse[]; showcase: ShowcaseItem[] }> {
  const data = await loadHome();
  return { bundles: (data.bundles || []) as DupeResponse[], showcase: (data.showcase || []) as ShowcaseItem[] };
}

export function HomeRoute() {
  const t = useT();
  useRouteMeta({ desc: t("home.lede"), stage: true });
  const { bundles, showcase } = useLoaderData() as Awaited<ReturnType<typeof homeLoader>>;
  const rootRef = useRef<HTMLDivElement>(null);

  useReveal([]);

  // Latar aroma default + intro hero (client-only; efek tidak jalan saat SSR).
  useEffect(() => {
    if (window.ScentBG) window.ScentBG.setFamily(STAGE_DEFAULT.a, STAGE_DEFAULT.b);
    if (rootRef.current) heroIntro(rootRef.current);
  }, []);

  // Kartu rail masuk saat terlihat.
  useEffect(() => {
    if (!rootRef.current) return;
    const cards = Array.from(rootRef.current.querySelectorAll<HTMLElement>(".rail__track .pair-card"));
    if (cards.length) revealCards(cards);
  }, []);

  // Galeri 3D + panel sheet (imperatif, client-only).
  useEffect(() => {
    if (!rootRef.current || !showcase.length) return;
    const root = rootRef.current;
    const sheet = bindDupeSheet(root);
    const dropShowcase = bindShowcase(root, showcase, sheet);
    return () => { dropShowcase(); sheet?.destroy(); };
  }, [showcase]);

  // Latar WebGL meredup begitu konten kurasi masuk (scrub, mode gsap saja).
  useEffect(() => {
    if (!rootRef.current || !gsapActive()) return;
    const fadeAt = rootRef.current.querySelector(".showcase") || rootRef.current.querySelector(".duo");
    if (!fadeAt) return;
    const tween = gsap.fromTo(".stage", { opacity: 1 }, {
      opacity: 0.12, ease: "none",
      scrollTrigger: { trigger: fadeAt, start: "top 90%", end: "top 40%", scrub: true },
    });
    return () => { tween.scrollTrigger?.kill(); gsap.set(".stage", { clearProps: "opacity" }); };
  }, []);

  return (
    <div ref={rootRef}>
      <Hero />
      <Showcase items={showcase} />
      <Duo bundles={bundles} />
      <How />
      <Rail bundles={bundles} />
      <ConsultForm />
    </div>
  );
}
