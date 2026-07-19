/* Lapisan gerak. GSAP + ScrollTrigger + SplitText + Lenis bila tersedia;
   jika tidak (atau prefers-reduced-motion), jatuh ke IntersectionObserver +
   transition CSS. Konten tidak pernah tersembunyi permanen.

   Aturan main (dari review kebutuhan animasi):
   - entrance kartu/section: sekali saja, 0.6-0.85s, ease-out, stagger <= 80ms
   - feedback tap: CSS :active (100-160ms), bukan JS
   - angka penting (hemat %, skor): number tick sekali saat terlihat
   - transisi rute: tirai 0.9s total, mencegah pergantian konten yang kasar */

export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lenis = null;
let hasGsap = false;
let io = null;

export function motionMode() { return hasGsap ? "gsap" : "css"; }

export function initMotion() {
  hasGsap =
    !reduceMotion &&
    typeof window.gsap !== "undefined" &&
    typeof window.ScrollTrigger !== "undefined";

  document.body.setAttribute("data-motion", hasGsap ? "gsap" : "css");

  if (hasGsap) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    if (window.SplitText) window.gsap.registerPlugin(window.SplitText);
    if (window.Flip) window.gsap.registerPlugin(window.Flip);

    if (typeof window.Lenis === "function") {
      lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 1 });
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add((time) => lenis.raf(time * 1000));
      window.gsap.ticker.lagSmoothing(0);
    }
  } else {
    io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("is-inview");
            io.unobserve(en.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
  }
}

export function lockScroll(locked) {
  if (lenis) locked ? lenis.stop() : lenis.start();
  document.documentElement.style.overflow = locked ? "hidden" : "";
}

export function scrollToTop(instant) {
  if (lenis) lenis.scrollTo(0, { immediate: !!instant });
  else window.scrollTo({ top: 0, behavior: instant ? "auto" : "smooth" });
}

export function scrollToEl(el) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -80 });
  else el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/* ---- reveal on scroll ---------------------------------------------------- */
export function revealWithin(root) {
  const els = Array.from(root.querySelectorAll("[data-reveal]"));
  if (!els.length) return;
  if (hasGsap) {
    els.forEach((el) => {
      window.gsap.fromTo(
        el,
        { y: 28, autoAlpha: 0 },
        {
          y: 0, autoAlpha: 1, duration: 0.8, ease: "power3.out",
          clearProps: "opacity,visibility,transform",
          scrollTrigger: { trigger: el, start: "top 88%", once: true }
        }
      );
    });
  } else {
    els.forEach((el, i) => {
      el.style.setProperty("--d", `${(i % 5) * 60}ms`);
      io.observe(el);
    });
  }
}

/* entrance grid kartu: batch stagger, sekali per render */
export function revealCards(cards) {
  if (!cards.length) return;
  if (hasGsap) {
    window.gsap.set(cards, { y: 24, autoAlpha: 0 });
    window.ScrollTrigger.batch(cards, {
      start: "top 94%",
      once: true,
      onEnter: (batch) =>
        window.gsap.to(batch, {
          y: 0, autoAlpha: 1, duration: 0.65, ease: "power3.out",
          stagger: 0.055, overwrite: true,
          clearProps: "opacity,visibility,transform"
        })
    });
    window.ScrollTrigger.refresh();
  } else {
    cards.forEach((el, i) => {
      el.setAttribute("data-reveal", "");
      el.style.setProperty("--d", `${(i % 6) * 55}ms`);
      io.observe(el);
    });
  }
}

/* ---- teks: masked line rise --------------------------------------------- */
export function riseLines(el, delay = 0) {
  if (!el) return;
  if (hasGsap && window.SplitText) {
    const split = new window.SplitText(el, { type: "lines", linesClass: "line" });
    window.gsap.fromTo(
      split.lines,
      { yPercent: 112 },
      { yPercent: 0, duration: 0.95, ease: "power4.out", stagger: 0.09, delay,
        onComplete: () => split.revert() }
    );
  }
}

/* hero memakai .line > span statis di markup agar tidak bergantung SplitText */
export function heroIntro(root) {
  if (!hasGsap) return;
  const clear = "opacity,visibility,transform";
  const tl = window.gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(".masthead", { y: -16, autoAlpha: 0, duration: 0.6, clearProps: clear }, 0)
    .fromTo(
      root.querySelectorAll(".hero__title .line > span"),
      { yPercent: 112 },
      { yPercent: 0, duration: 1.0, ease: "power4.out", stagger: 0.1, clearProps: "transform" },
      0.08
    )
    .from(root.querySelector(".hero__eyebrow"), { y: 18, autoAlpha: 0, duration: 0.6, clearProps: clear }, 0.35)
    .from(root.querySelectorAll(".hero__foot > *"), { y: 20, autoAlpha: 0, duration: 0.6, stagger: 0.08, clearProps: clear }, 0.5);
}

/* ---- angka: count up ----------------------------------------------------- */
export function countUp(el, target, { render } = {}) {
  const paint = render || ((v) => { el.textContent = String(v); });
  if (!hasGsap || reduceMotion) { paint(target); return; }
  const state = { v: 0 };
  window.gsap.to(state, {
    v: target, duration: 1.1, ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 92%", once: true },
    onUpdate: () => paint(Math.round(state.v))
  });
}

/* bar performa (longevity/projection) - garis tunggal tanpa track */
export function growBars(root) {
  const bars = root.querySelectorAll(".perf__bar[data-scale]");
  bars.forEach((bar) => {
    const to = Number(bar.dataset.scale) || 0;
    if (!hasGsap) { bar.style.transform = `scaleX(${to})`; return; }
    window.gsap.fromTo(bar, { scaleX: 0 }, {
      scaleX: to, duration: 0.9, ease: "power3.out",
      scrollTrigger: { trigger: bar, start: "top 94%", once: true }
    });
  });
}

/* ---- piramida & compare -------------------------------------------------- */
export function pyramidReveal(root) {
  const tiers = root.querySelectorAll(".pyramid__tier");
  if (!tiers.length) return;
  if (!hasGsap) {
    tiers.forEach((t, i) => { t.setAttribute("data-reveal", ""); t.style.setProperty("--d", `${i * 90}ms`); io.observe(t); });
    return;
  }
  window.gsap.fromTo(
    tiers,
    { y: 26, autoAlpha: 0, scaleX: 0.94 },
    {
      y: 0, autoAlpha: 1, scaleX: 1, duration: 0.7, ease: "power3.out", stagger: 0.12,
      clearProps: "opacity,visibility,transform",
      scrollTrigger: { trigger: root.querySelector(".pyramid"), start: "top 85%", once: true }
    }
  );
}

/* kolom compare masuk dari sisi masing-masing, notes bersama menyusul di
   tengah: menceritakan "dua parfum bertemu di komposisi yang sama" */
export function compareIntro(root) {
  if (!hasGsap) return;
  const clear = "opacity,visibility,transform";
  const tl = window.gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(root.querySelector(".compare__col--ori"), { x: -44, autoAlpha: 0, duration: 0.85, clearProps: clear }, 0.05)
    .from(root.querySelector(".compare__col--dup"), { x: 44, autoAlpha: 0, duration: 0.85, clearProps: clear }, 0.05)
    .from(root.querySelector(".compare__mid"), { autoAlpha: 0, duration: 0.6, clearProps: clear }, 0.4)
    .from(root.querySelectorAll(".compare__shared .note"), {
      scale: 0.6, autoAlpha: 0, duration: 0.5, ease: "back.out(1.6)", stagger: 0.05, clearProps: clear
    }, 0.65);
}

/* ---- transisi rute ------------------------------------------------------- */
const curtain = () => document.getElementById("curtain");
const curtainWord = () => document.getElementById("curtain-word");

export async function curtainSwap(word, swap) {
  if (!hasGsap) { await swap(); return; }
  const el = curtain();
  const wordEl = curtainWord();
  wordEl.textContent = word || "";
  await new Promise((resolve) => {
    window.gsap.timeline({ onComplete: resolve })
      .set(el, { visibility: "visible" })
      .fromTo(el, { yPercent: 101 }, { yPercent: 0, duration: 0.42, ease: "power4.inOut" })
      .fromTo(wordEl, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out" }, "-=0.12");
  });
  await swap();
  await new Promise((resolve) => {
    window.gsap.timeline({ onComplete: resolve, delay: 0.12 })
      .to(wordEl, { autoAlpha: 0, duration: 0.18 })
      .to(el, { yPercent: -101, duration: 0.5, ease: "power4.inOut" }, "-=0.05")
      .set(el, { visibility: "hidden", yPercent: 101 });
  });
}

/* matikan semua trigger milik view lama sebelum ganti rute */
export function killViewTriggers() {
  if (hasGsap) window.ScrollTrigger.getAll().forEach((st) => st.kill());
}

export function refreshTriggers() {
  if (hasGsap) window.ScrollTrigger.refresh();
}

/* sheen kartu mengikuti pointer (fine pointer saja; murah karena CSS var) */
export function attachSheen(grid) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  grid.addEventListener(
    "pointermove",
    (e) => {
      const card = e.target.closest(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true }
  );
}
