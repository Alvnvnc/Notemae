/* Tirai pembuka (first paint saja). Port dari main.js: wordmark bertopeng per
   huruf, penghitung 00-100 yang mengejar progres sebenarnya, dua panel yang
   terbelah saat keluar.

   Jalan hanya kalau shell memintanya (body[data-loading]). Rute yang di-SSR
   (Fase 5c) datang tanpa atribut itu - kontennya sudah utuh - jadi tirainya
   dilewati. Isyarat "siap" datang dari RootLayout lewat event app-ready; katup
   pengaman menjaga tirai tidak menggantung kalau isyaratnya tak tiba. */
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { gsap, gsapActive, reduceMotion } from "../motion.ts";

const MIN_VISIBLE = 900;

export function Veil() {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  const fillRef = useRef<HTMLElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const body = document.body;
    const announce = () => {
      body.removeAttribute("data-loading");
      window.dispatchEvent(new Event("scentsphere:reveal"));
    };
    if (!body.hasAttribute("data-loading")) { announce(); setHidden(true); return; }

    body.setAttribute("data-veil", "run");
    const bootAt = performance.now();
    let progress = 0;
    let shown = 0;
    let raf = 0;

    const paintCount = (v: number) => {
      if (countRef.current) countRef.current.textContent = String(Math.round(v * 100)).padStart(2, "0");
    };
    const setProgress = (p: number) => {
      progress = Math.min(1, Math.max(progress, p));
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
    };
    const step = () => {
      shown += (progress - shown) * 0.14;
      if (progress - shown < 0.004) shown = progress;
      paintCount(shown);
      if (shown < 1) raf = requestAnimationFrame(step);
    };

    // Pecah wordmark jadi <span><i>H</i></span> supaya tiap huruf bertopeng
    // sendiri dan bisa naik dari bawah garisnya.
    const letters: HTMLElement[] = [];
    const mark = markRef.current;
    if (mark) {
      const text = mark.textContent?.trim() || "";
      mark.textContent = "";
      for (const ch of text) {
        const cell = document.createElement("span");
        if (ch === " ") { cell.className = "veil__ch veil__ch--space"; mark.appendChild(cell); continue; }
        cell.className = "veil__ch";
        const inner = document.createElement("i");
        inner.textContent = ch;
        cell.appendChild(inner);
        mark.appendChild(cell);
        letters.push(inner);
      }
    }

    raf = requestAnimationFrame(step);
    const on = gsapActive();
    if (on && letters.length) {
      gsap.fromTo(letters, { yPercent: 115 }, { yPercent: 0, duration: 0.85, ease: "power4.out", stagger: 0.035 });
      gsap.from(".veil__tag", { autoAlpha: 0, duration: 0.6, delay: 0.35 });
      gsap.from(".veil__meter", { autoAlpha: 0, y: 12, duration: 0.6, delay: 0.2 });
    }
    setProgress(0.25);
    if (document.fonts?.ready) document.fonts.ready.then(() => setProgress(0.6));

    let done = false;
    let hideTimer = 0;
    let exitTimer = 0;
    const settle = () => setHidden(true);
    const playExit = () => {
      paintCount(1);
      shown = 1;
      if (reduceMotion || !on) {
        announce();
        hideTimer = window.setTimeout(settle, reduceMotion ? 0 : 660);
        return;
      }
      gsap.timeline({ onComplete: settle })
        .to([countRef.current, ".veil__rule"], { autoAlpha: 0, duration: 0.28, ease: "power2.in" }, 0)
        .to(".veil__tag", { autoAlpha: 0, y: -10, duration: 0.28, ease: "power2.in" }, 0)
        .to(letters.length ? letters : ".veil__mark",
          { yPercent: -115, duration: 0.5, ease: "power3.in", stagger: 0.016 }, 0.06)
        .add(announce, 0.34)
        .to(".veil__panel--top", { yPercent: -100, duration: 0.9, ease: "power4.inOut" }, 0.34)
        .to(".veil__panel--bot", { yPercent: 100, duration: 0.9, ease: "power4.inOut" }, 0.34);
    };
    const finish = () => {
      if (done) return;
      done = true;
      setProgress(1);
      const wait = Math.max(0, MIN_VISIBLE - (performance.now() - bootAt));
      exitTimer = window.setTimeout(playExit, reduceMotion ? 0 : wait);
    };

    window.addEventListener("scentsphere:app-ready", finish, { once: true });
    const safety = window.setTimeout(finish, reduceMotion ? 400 : 1600);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      clearTimeout(exitTimer);
      clearTimeout(safety);
      window.removeEventListener("scentsphere:app-ready", finish);
    };
  }, []);

  return (
    <div className="veil" id="veil" role="status" aria-label={t("common.loading")} hidden={hidden}>
      <i className="veil__panel veil__panel--top" aria-hidden="true"></i>
      <i className="veil__panel veil__panel--bot" aria-hidden="true"></i>
      <div className="veil__inner">
        <p className="veil__mark" id="veil-mark" aria-hidden="true" ref={markRef}>ScentSphere</p>
        <p className="veil__tag">{t("common.loadingTag")}</p>
      </div>
      <div className="veil__meter" aria-hidden="true">
        <span className="veil__rule"><i id="veil-fill" ref={fillRef}></i></span>
        <span className="veil__count" id="veil-count" ref={countRef}>00</span>
      </div>
    </div>
  );
}
