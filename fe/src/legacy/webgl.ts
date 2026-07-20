/* Pemeriksaan kemampuan WebGL, sengaja berdiri sendiri.

   Pemanggilnya perlu tahu apakah 3D layak ditampilkan *sebelum* memutuskan
   mengunduh three.js. Kalau fungsi ini tinggal di showcase3d.ts, sekadar
   menanyakannya sudah menarik ratusan kilobyte yang mungkin tidak terpakai. */

import { reduceMotion } from "./motion.js";

/* Kanvas WebGL yang dirasterisasi CPU (SwiftShader, llvmpipe, Mesa softpipe)
   membuat seluruh halaman tersendat: tiap piksel shader dikerjakan main
   thread. Untuk galeri dekoratif itu tidak sepadan - lebih baik berhenti dan
   biarkan daftar HTML-nya yang tampil. Pemeriksaan yang sama dipakai
   background.js untuk latar hero. */
export function canRender3d(): boolean {
  if (reduceMotion) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;

    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) {
      const name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "");
      if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return false;
    }
    // Konteks uji dilepas eksplisit: browser membatasi jumlah konteks WebGL
    // yang hidup bersamaan, dan halaman ini sudah memakai satu untuk hero.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export type PerfTier = "low" | "high";

/* Tingkat kemampuan grafis, dipakai galeri 3D (dan latar hero) untuk memilih
   antara jalur render penuh dan jalur ringan.

   Sengaja TIDAK membuat konteks WebGL sendiri: menanyakan string GPU lewat
   WEBGL_debug_renderer_info menuntut satu konteks tambahan, dan browser
   membatasi jumlah yang hidup bersamaan (hero sudah memakai satu, galeri satu
   lagi). Sinyal murah - jumlah core, memori, dan jenis penunjuk - sudah cukup
   memisahkan perangkat yang sanggup transmission dari yang tersendat olehnya.

   Default sengaja optimistis: API yang tidak tersedia (deviceMemory absen di
   Firefox/Safari) tidak boleh menurunkan mesin kelas atas ke jalur ringan.
   Hanya sinyal lemah yang eksplisit yang menurunkan tingkat. */
export function perfTier(): PerfTier {
  if (reduceMotion) return "low";
  if (typeof navigator === "undefined" || typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (coarse || (window.innerWidth || 1024) < 768) return "low"; // ponsel/tablet
  if ((nav.hardwareConcurrency || 8) <= 4) return "low";         // CPU kelas bawah
  if ((nav.deviceMemory || 8) <= 4) return "low";                // RAM terbatas (Chrome saja)
  return "high";
}
