/* Primitif gerak untuk sisi React.

   Padanan motion.js legacy, dengan dua beda yang disengaja:

   - GSAP diimpor langsung dari npm, bukan dibaca dari window.gsap. Instansnya
     tetap sama persis: vendor.ts memasang instans modul ini ke window.gsap,
     jadi ScrollTrigger dan integrasi Lenis yang disiapkan initMotion() ikut
     berlaku untuk animasi React ini - tidak ada dua dunia gerak yang terpisah.
   - animasi dibungkus useGSAP, yang mencatat setiap tween dan ScrollTrigger
     yang dibuat di dalam scope sebuah komponen lalu me-revert semuanya saat
     komponen unmount. Rute React tidak perlu menitip pembersihan ke
     killViewTriggers() milik router - ia membersihkan miliknya sendiri. */
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { motionMode, reduceMotion } from "../legacy/motion.js";

gsap.registerPlugin(useGSAP);

/* True hanya saat orkestrasi GSAP benar-benar aktif - bukan fallback CSS
   maupun prefers-reduced-motion. Cermin dari cek `hasGsap` di motion.js, yang
   sudah dijalankan initMotion() saat boot sebelum rute mana pun dipasang. */
export function gsapActive(): boolean {
  return !reduceMotion && motionMode() === "gsap";
}

export { gsap, useGSAP, reduceMotion };
