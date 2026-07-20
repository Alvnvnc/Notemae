/* Titik masuk browser.
 *
 * Urutannya disengaja dan bukan sekadar gaya penulisan:
 *   1. app.css   - Vite mengubahnya jadi <link> ber-hash saat build
 *   2. vendor    - memasang window.gsap/ScrollTrigger/SplitText/Lenis
 *   3. react/entry - initMotion() (membaca global di atas) lalu render App
 *
 * Badan modul dieksekusi berurutan sesuai urutan impor, jadi langkah 3 tidak
 * pernah bisa mendahului langkah 2.
 */
import "./app.css";
import "./lib/vendor.ts";
import "./react/entry.tsx";
