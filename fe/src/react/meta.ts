/* Meta per rute untuk komponen React asli: judul, deskripsi, canonical, dan
   atribut body[data-stage] + jeda latar WebGL. Menggantikan apa yang dulu
   dilakukan router.js/adapter untuk view legacy. */
import { useEffect } from "react";
import { useLocation } from "react-router";

export function useRouteMeta({ title, desc, stage }: { title?: string; desc?: string; stage?: boolean }): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = title ? `${title} | Notemae` : "Notemae | Perfume Dupe Guide";
    if (desc) document.querySelector('meta[name="description"]')?.setAttribute("content", desc);
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) { try { link.setAttribute("href", new URL(pathname, link.href).href); } catch { /* biarkan */ } }
    document.body.setAttribute("data-stage", stage ? "on" : "off");
    if (window.ScentBG) window.ScentBG.setPaused(!stage);
  }, [title, desc, stage, pathname]);
}
