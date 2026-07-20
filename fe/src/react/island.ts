/* Jembatan island.

   Selama migrasi, sebuah rute React tetap terlihat sebagai view biasa oleh
   router legacy: loader-nya mengembalikan { title, desc, stage, html, mount }
   seperti view lain, hanya saja mount()-nya createRoot di #view alih-alih
   memasang event ke innerHTML yang sudah ditulis.

   mountIsland mengembalikan cleanup ber-unmount - bentuk yang sama persis
   dengan yang diharapkan router.js dari nilai balik view.mount(). Saat pindah
   rute, router memanggil cleanup itu (React melepas listener dan mengosongkan
   #view), lalu menulis innerHTML view berikutnya ke wadah yang sudah bersih. */
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

export function mountIsland(root: HTMLElement, node: ReactNode): () => void {
  const reactRoot = createRoot(root);
  reactRoot.render(node);
  return () => reactRoot.unmount();
}
