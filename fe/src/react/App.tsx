/* RootLayout: chrome tetap (masthead/finder/footer) + veil + <Outlet> rute.
   Semua glue tingkat aplikasi yang dulu ada di main.js hidup di sini. */
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { scrollToEl, scrollToTop } from "../legacy/motion.js";
import { Finder } from "./chrome/Finder.tsx";
import { Footer } from "./chrome/Footer.tsx";
import { Masthead } from "./chrome/Masthead.tsx";
import { Veil } from "./chrome/Veil.tsx";
import { useT } from "./i18n.tsx";

export function RootLayout() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [finderOpen, setFinderOpen] = useState(false);

  /* Interseptor link global: setiap <a href> internal - termasuk yang dirender
     markup legacy - lewat react-router alih-alih reload penuh. Klik yang sudah
     ditangani <Link>/<NavLink> memanggil preventDefault, jadi dilewati di sini.
     Anchor murni ("#view" skip-link) dibiarkan ke browser supaya fokusnya utuh. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  // data-scrolled tanpa scroll listener: sentinel + IntersectionObserver.
  useEffect(() => {
    const sentinel = document.createElement("div");
    sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:120px;pointer-events:none;";
    document.body.prepend(sentinel);
    const io = new IntersectionObserver(([en]) => {
      if (en) document.body.setAttribute("data-scrolled", en.isIntersecting ? "false" : "true");
    });
    io.observe(sentinel);
    return () => { io.disconnect(); sentinel.remove(); };
  }, []);

  // Pintasan papan tik untuk finder ("/" atau cmd/ctrl-K).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName || "");
      if (!typing && !finderOpen && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        setFinderOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finderOpen]);

  // Scroll ke atas tiap ganti rute; kalau ada hash, scroll ke elemennya.
  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) { const id = setTimeout(() => scrollToEl(el), 60); return () => clearTimeout(id); }
    }
    scrollToTop(true);
  }, [location.pathname, location.hash]);

  return (
    <>
      <a className="skip-link" href="#view">{t("common.skip")}</a>
      <Veil />
      <Masthead onSearch={() => setFinderOpen(true)} />
      <main id="view" tabIndex={-1}>
        <Outlet />
      </main>
      <Finder open={finderOpen} onClose={() => setFinderOpen(false)} />
      <Footer />
    </>
  );
}
