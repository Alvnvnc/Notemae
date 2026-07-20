/* Adapter: menjalankan view legacy (home/consult/catalog - dan sementara juga
   compare/detail lewat island mount) di dalam pohon react-router.

   Kontrak view lama tidak berubah: loader mengembalikan { title, desc, stage,
   html, mount }. Adapter menaruh html ke sebuah <div> yang dikuasai React
   (React merender div itu kosong, jadi tidak pernah bentrok dengan isi imperatif
   di dalamnya), memasang meta + atribut body yang dibaca CSS, lalu memanggil
   mount(). Cleanup + killViewTriggers() jalan saat rute ditinggalkan - persis
   seperti swapView di router.js dulu.

   Re-load saat param ATAU locale berganti: itu yang menggantikan
   refreshCurrentRoute() lama saat pengguna mengganti bahasa. */
import { useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router";
import {
  killViewTriggers, refreshTriggers, revealWithin,
} from "../legacy/motion.js";
import { useLocale } from "./i18n.tsx";

type LegacyView = {
  title?: string;
  desc?: string;
  stage?: boolean;
  html: string;
  mount?: (root: HTMLElement) => void | (() => void) | Promise<void | (() => void)>;
};

export type LegacyLoader = (params: Record<string, string | undefined>) => Promise<LegacyView>;

function applyMeta(view: LegacyView, pathname: string): void {
  document.title = view.title ? `${view.title} | ScentSphere` : "ScentSphere | Perfume Dupe Guide";
  const meta = document.querySelector('meta[name="description"]');
  if (meta && view.desc) meta.setAttribute("content", view.desc);
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link) {
    try { link.setAttribute("href", new URL(pathname, link.href).href); } catch { /* biarkan */ }
  }
}

export function LegacyRoute({ loader }: { loader: LegacyLoader }) {
  const params = useParams();
  const { pathname } = useLocation();
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  // Kunci efek: param + locale. Rute yang sama dengan param berbeda memakai
  // instance komponen yang sama, jadi efek harus dijalankan ulang di sini.
  const key = `${pathname}|${locale}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      let view: LegacyView;
      try {
        view = await loader({ ...params });
      } catch {
        return; // loader punya jalur gagalnya sendiri; kalau melempar, biarkan shell
      }
      if (cancelled) return;
      el.innerHTML = view.html;
      applyMeta(view, pathname);
      document.body.setAttribute("data-stage", view.stage ? "on" : "off");
      if (window.ScentBG) window.ScentBG.setPaused(!view.stage);
      if (view.mount) {
        try { cleanup = (await view.mount(el)) || null; } catch { /* view lama */ }
      }
      if (cancelled) { if (cleanup) { try { cleanup(); } catch { /* */ } } return; }
      revealWithin(el);
      refreshTriggers();
      // Isyarat "konten pertama siap" untuk tirai. Veil menyimaknya sekali;
      // dispatch dari mount berikutnya diabaikan.
      window.dispatchEvent(new Event("scentsphere:app-ready"));
    })();

    return () => {
      cancelled = true;
      if (cleanup) { try { cleanup(); } catch { /* view lama */ } }
      killViewTriggers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={ref} className="legacy-view" />;
}
