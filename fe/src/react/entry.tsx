/* Boot React di browser. initMotion() dulu supaya window.gsap + Lenis siap saat
   effect komponen (mis. Veil) berjalan.

   Hidrasi vs render segar: hydrateRoot hanya kalau server memang mengirim konten
   (#root berisi) DAN bahasanya cocok dengan pilihan pengunjung. Kalau tidak -
   rute yang tidak di-SSR, atau pengunjung memilih bahasa lain dari default
   server - data hidrasi dibuang dan aplikasi dirender klien dari nol. Itu
   mencegah hydration mismatch dan mencerminkan cara router lama mengabaikan
   payload SSR saat locale tidak cocok. */
import { createRoot, hydrateRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { getLocale } from "../lib/i18n.ts";
import { initMotion } from "../legacy/motion.js";
import { routes } from "./routes.tsx";

initMotion();

interface SsrWindow {
  __SSR_LOCALE__?: string;
  __staticRouterHydrationData?: unknown;
}
const w = window as unknown as SsrWindow;
const root = document.getElementById("root");

if (root) {
  // Data hidrasi tidak dibuang saat locale beda: isinya bebas-locale, jadi
  // createRoot bisa memakainya (tanpa fetch ulang) lalu merender dalam bahasa
  // klien - #root ditulis dari nol, jadi tak ada perbandingan DOM = tak ada
  // hydration mismatch.
  const canHydrate = root.hasChildNodes() && w.__SSR_LOCALE__ != null && w.__SSR_LOCALE__ === getLocale();

  const router = createBrowserRouter(routes);
  const app = <RouterProvider router={router} />;

  if (canHydrate) hydrateRoot(root, app);
  else createRoot(root).render(app);
}
