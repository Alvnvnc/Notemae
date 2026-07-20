/* Rute /bandingkan/:a/vs/:b - island React pertama yang dimigrasi.

   Dipilih pertama karena paling sederhana untuk membuktikan pipeline: satu
   fetch, sisanya perhitungan murni (overlap notes + penghematan), tanpa form,
   tanpa SSR, tanpa picker. Loader-nya tetap mengambil data sebelum render -
   jadi title/desc benar seketika dan tidak ada flash halaman kosong - lalu
   menyerahkan render + gerak ke React.

   Perbandingan berdampingan original vs alternatif (KF-07): notes yang sama di
   tengah, notes unik di sisi masing-masing, plus selisih harga dan persentase
   penghematan (KF-08). Semua angka dihitung dari data katalog. */
import { Fragment, useRef } from "react";
import type { Fragrance } from "../../lib/api-types.ts";
import { getFragrance } from "../../lib/api.ts";
import { displayName, genderLabel, noteOverlap, rupiah, savings } from "../../lib/format.ts";
import { t } from "../../lib/i18n.ts";
import { mountIsland } from "../island.ts";
import { gsap, gsapActive, useGSAP } from "../motion.ts";

type Side = "ori" | "dup";

function Column({ f, role, unique, side }: {
  f: Fragrance;
  role: string;
  unique: string[];
  side: Side;
}) {
  const rows: Array<[string, string]> = [
    ["Gender", genderLabel(f.gender)],
    [t("common.rating"), f.rating ? `★ ${Number(f.rating).toFixed(1)}` : t("common.noData")],
    [t("detail.longevity"), f.longevity_score ? `${Number(f.longevity_score).toFixed(1)} / 5` : t("common.noData")],
    [t("detail.projection"), f.projection_score ? `${Number(f.projection_score).toFixed(1)} / 5` : t("common.noData")],
  ];
  return (
    <div className={`compare__col compare__col--${side}`}>
      <p className="compare__role">{role}</p>
      <h2 className="compare__name">
        <a href={`/parfum/${encodeURIComponent(f.slug)}`}>{displayName("", f.name)}</a>
      </h2>
      <p className="compare__brand">{f.brand}</p>
      <p className="compare__price">{rupiah(f.price_idr)}</p>
      <dl>
        {rows.map(([dt, dd]) => (
          <Fragment key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </Fragment>
        ))}
        <dt>{t("common.notes")}</dt>
        <dd>
          <span className="compare__notes">
            {unique.length
              ? unique.map((n) => <span className="note" key={n}>{n}</span>)
              : <span className="note">{t("common.noData")}</span>}
          </span>
        </dd>
      </dl>
    </div>
  );
}

function Compare({ ori, dup }: { ori: Fragrance; dup: Fragrance }) {
  const ov = noteOverlap(ori.notes, dup.notes);
  const save = savings(ori.price_idr, dup.price_idr);
  const priceGap = ori.price_idr && dup.price_idr ? Math.abs(ori.price_idr - dup.price_idr) : null;
  const animate = gsapActive();

  const scope = useRef<HTMLElement>(null);
  const pctRef = useRef<HTMLParagraphElement>(null);

  /* Kolom masuk dari sisi masing-masing, notes bersama menyusul di tengah -
     "dua parfum bertemu di komposisi yang sama". Persentase kemiripan menghitung
     naik saat terlihat. Semua tween di sini dicatat useGSAP dan di-revert saat
     island unmount; tidak ada ScrollTrigger yang menetap antar navigasi. */
  useGSAP(() => {
    if (!animate) return;
    const clear = "opacity,visibility,transform";
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .from(".compare__col--ori", { x: -44, autoAlpha: 0, duration: 0.85, clearProps: clear }, 0.05)
      .from(".compare__col--dup", { x: 44, autoAlpha: 0, duration: 0.85, clearProps: clear }, 0.05)
      .from(".compare__mid", { autoAlpha: 0, duration: 0.6, clearProps: clear }, 0.4)
      .from(".compare__shared .note", {
        scale: 0.6, autoAlpha: 0, duration: 0.5, ease: "back.out(1.6)", stagger: 0.05, clearProps: clear,
      }, 0.65);

    const el = pctRef.current;
    if (el) {
      const state = { v: 0 };
      gsap.to(state, {
        v: ov.pct, duration: 1.1, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: () => { el.textContent = `${Math.round(state.v)}%`; },
      });
    }
  }, { scope });

  return (
    <section className="compare sect shell" aria-labelledby="compare-title" ref={scope}>
      <a className="crumb" href={`/parfum/${encodeURIComponent(ori.slug)}`}>
        ‹ {t("common.backCatalog")}: {displayName(ori.brand, ori.name)}
      </a>
      <h1 className="h-sect compare__title" id="compare-title" data-reveal>
        {t("compare.title", { a: displayName("", ori.name), b: displayName("", dup.name) })}
      </h1>

      <div className="compare__stage">
        <Column f={ori} role={t("role.original")} unique={ov.onlyA} side="ori" />
        <div className="compare__mid">
          {/* Teks awal dimutasi imperatif oleh count-up di atas; komponen tidak
              pernah re-render, jadi React tidak menimpanya kembali. */}
          <p className="compare__pct" id="compare-pct" ref={pctRef}>{animate ? "0%" : `${ov.pct}%`}</p>
          <p className="compare__pct-label">{t("compare.similarity")}</p>
          {ov.shared.length ? (
            <div className="compare__shared" role="list" aria-label={t("common.notes")}>
              {ov.shared.map((n) => (
                <span className="note note--shared" role="listitem" key={n}>{n}</span>
              ))}
            </div>
          ) : (
            <p className="status">{t("compare.noShared")}</p>
          )}
          {save ? (
            <div className="compare__save">
              <strong>{rupiah(save.diff)}</strong>
              <span>{t("compare.saved", { pct: save.pct })}</span>
            </div>
          ) : priceGap ? (
            <div className="compare__save">
              <strong>{rupiah(priceGap)}</strong>
              <span>{t("compare.gap")}</span>
            </div>
          ) : null}
        </div>
        <Column f={dup} role={t("role.alternative")} unique={ov.onlyB} side="dup" />
      </div>

      <div className="compare__foot">
        <p className="status">{t("compare.disclaimer")}</p>
        <a className="link-quiet" href={`/parfum/${encodeURIComponent(dup.slug)}`}>
          {t("common.detail")} {displayName("", dup.name)} ›
        </a>
      </div>
    </section>
  );
}

/* Jalur gagal tetap HTML string biasa: statis, tanpa gerak, tanpa data - tidak
   ada gunanya menyalakan React hanya untuk pesan galat. */
function failView() {
  return {
    title: t("errors.compare"),
    desc: t("errors.compare"),
    stage: false,
    html: `
      <section class="compare sect shell">
        <div class="empty">
          <p class="h-sect">${t("errors.compare")}</p>
          <p>${t("errors.compareHint")}</p>
          <a class="btn" href="/katalog">${t("common.backCatalog")}</a>
        </div>
      </section>`,
  };
}

/* Rute /bandingkan. Tetap mengambil data di loader (sebelum render), jadi
   title/desc langsung benar dan router tidak sempat menampilkan kerangka. */
export async function compareView({ a, b }: { a: string; b: string }) {
  let ori: Fragrance;
  let dup: Fragrance;
  try {
    [ori, dup] = await Promise.all([getFragrance(a), getFragrance(b)]);
  } catch {
    return failView();
  }

  const ov = noteOverlap(ori.notes, dup.notes);
  const save = savings(ori.price_idr, dup.price_idr);

  return {
    title: `${displayName("", ori.name)} vs ${displayName("", dup.name)}`,
    desc: `${t("common.compare")} ${displayName(ori.brand, ori.name)} / ${displayName(dup.brand, dup.name)}: ${ov.pct}% ${t("common.similarity")}${save ? `, ${t("common.savings").toLowerCase()} ${save.pct}%` : ""}.`,
    stage: false,
    // Kosong: createRoot yang mengisi #view. Rute ini client-only (tidak
    // terdaftar di ssr.ts), jadi pengunjung tanpa JS jatuh ke shell.
    html: "",
    mount(root: HTMLElement) {
      return mountIsland(root, <Compare ori={ori} dup={dup} />);
    },
  };
}
