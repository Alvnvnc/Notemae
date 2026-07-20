/* Reveal-on-scroll untuk rute React asli. Menggantikan panggilan
   revealWithin()/refreshTriggers()/killViewTriggers() yang dulu dilakukan
   router.js/adapter di sekitar mount view. Juga memancarkan app-ready supaya
   tirai terangkat saat konten rute pertama benar-benar terpasang. */
import { useEffect, type DependencyList } from "react";
import { killViewTriggers, refreshTriggers, revealWithin } from "../legacy/motion.js";

export function useReveal(deps: DependencyList = []): void {
  useEffect(() => {
    const view = document.getElementById("view");
    if (view) { revealWithin(view); refreshTriggers(); }
    window.dispatchEvent(new Event("scentsphere:app-ready"));
    return () => killViewTriggers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
