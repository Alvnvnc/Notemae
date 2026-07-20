/* Jembatan pustaka gerak.
 *
 * GSAP, plugin-pluginnya, dan Lenis dulu datang sebagai empat <script> global
 * dari /vendor - selalu keempatnya, di setiap rute, tanpa minify tambahan dan
 * tanpa tipe. Sekarang semuanya dependency npm sehingga ikut di-bundle,
 * di-minify, dan di-tree-shake Vite.
 *
 * Modul legacy (src/legacy/motion.js dan beberapa view) masih membacanya lewat
 * `window`, jadi globalnya dipasang di sini. Ini murni lapisan transisi: setiap
 * modul yang pindah ke React mengimpor `gsap` langsung. Begitu tidak ada lagi
 * yang menyentuh window.gsap, file ini ikut dihapus.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText);

declare global {
  interface Window {
    gsap: typeof gsap;
    ScrollTrigger: typeof ScrollTrigger;
    SplitText: typeof SplitText;
    Lenis: typeof Lenis;
    /** Latar WebGL hero (public/background.js). Absen kalau WebGL ditolak. */
    ScentBG?: {
      setFamily(a: readonly number[], b: readonly number[]): void;
      setPaused(paused: boolean): void;
      isActive(): boolean;
    };
    __SCENTSPHERE_CONFIG__?: { backendUrl?: string };
  }
}

window.gsap = gsap;
window.ScrollTrigger = ScrollTrigger;
window.SplitText = SplitText;
window.Lenis = Lenis;

export { gsap, ScrollTrigger, SplitText, Lenis };
