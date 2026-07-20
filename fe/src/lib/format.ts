/* Utilitas format + kalkulasi murni. Tidak menyentuh DOM kecuali escapeHtml. */
import type { Fragrance, NoteTier, RelationType } from "./api-types.ts";
import { localeMoney, t, tryT } from "./i18n.ts";

/* Hanya dibutuhkan selama markup masih dirakit sebagai string. Komponen React
   meng-escape teksnya sendiri, jadi setiap rute yang pindah menghapus satu
   pemanggil - dan begitu tidak ada lagi, fungsi ini ikut hilang. */
export function escapeHtml(value: unknown): string {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function rupiah(value: number | null | undefined): string {
  return localeMoney(value);
}

export function rupiahCompact(value: number | null | undefined): string {
  if (!value && value !== 0) return "-";
  return localeMoney(value, { compact: true });
}

/* Brand sering terulang di dalam nama produk hasil scraping; jangan tampil dua kali. */
export function displayName(brand: string | null | undefined, name: string | null | undefined): string {
  const b = String(brand || "").trim();
  const n = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*/g, " - ");
  if (b && n.toLowerCase().startsWith(b.toLowerCase())) return n;
  return `${b} ${n}`.trim();
}

export function normalizeNotes(notes: readonly string[] | null | undefined): string[] {
  return (notes || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean);
}

export interface NoteOverlap {
  shared: string[];
  onlyA: string[];
  onlyB: string[];
  /** Jaccard: irisan dibagi gabungan. */
  pct: number;
  /** Berapa persen notes A yang tertutup B. */
  coverage: number;
}

/* KF-06: kemiripan berbasis konten dihitung dari kesamaan notes (Jaccard).
   Skor ini transparan dan bisa diverifikasi pengguna dari daftar notes. */
export function noteOverlap(
  aNotes: readonly string[] | null | undefined,
  bNotes: readonly string[] | null | undefined,
): NoteOverlap {
  const a = new Set(normalizeNotes(aNotes));
  const b = new Set(normalizeNotes(bNotes));
  const shared = [...a].filter((n) => b.has(n));
  const union = new Set([...a, ...b]);
  return {
    shared,
    onlyA: [...a].filter((n) => !b.has(n)),
    onlyB: [...b].filter((n) => !a.has(n)),
    pct: union.size ? Math.round((shared.length / union.size) * 100) : 0,
    coverage: a.size ? Math.round((shared.length / a.size) * 100) : 0,
  };
}

export interface Savings {
  diff: number;
  pct: number;
}

/* KF-08: selisih harga + persentase penghematan. Null kalau dupe-nya justru
   tidak lebih murah - tidak ada penghematan yang bisa diklaim. */
export function savings(
  originalPrice: number | null | undefined,
  dupePrice: number | null | undefined,
): Savings | null {
  if (!originalPrice || !dupePrice || dupePrice >= originalPrice) return null;
  const diff = originalPrice - dupePrice;
  return { diff, pct: Math.round((diff / originalPrice) * 100) };
}

/* Wording relasi dupe terikat confidence kurasi (jangan melebih-lebihkan klaim). */
export function relationClaim(
  relation: RelationType,
  confidence: number,
  originalName?: string,
): string {
  const name = originalName || "parfum ini";
  if (relation === "flanker_of") return t("relation.flankerClaim", { name });
  const kind = relation === "clone_of" ? t("relation.clone") : t("relation.alternative");
  if (confidence >= 0.8) return t("relation.highClaim", { kind, name });
  if (confidence >= 0.6) return t("relation.midClaim", { name });
  return t("relation.lowClaim", { name });
}

export function relationLabel(relation: RelationType): string {
  return t(`relation.${relation}`);
}

/* Tiga label di bawah menerima nilai bebas bentuk dari katalog, jadi kuncinya
   belum tentu ada di kamus. tryT() mengembalikan cadangan alih-alih menuliskan
   kunci mentah ("gender.foo") ke layar - yang selama ini bisa terjadi diam-diam. */
export function genderLabel(gender: string | null | undefined): string {
  return gender ? tryT(`gender.${gender}`, gender) : "";
}

export function occasionLabel(occasion: string): string {
  return tryT(`occasion.${occasion}`, occasion);
}

export function climateLabel(climate: string): string {
  return tryT(`climate.${climate}`, climate);
}

export type Pyramid = Record<NoteTier, string[]>;
export type PyramidResult = (Pyramid & { estimated: boolean }) | null;

/* KF-04: piramida notes.

   Katalog kini menyimpan tier sungguhan (top_notes/heart_notes/base_notes)
   untuk record yang sudah diperkaya. Untuk record lama kolom itu kosong dan
   yang tersedia hanya daftar notes datar, jadi tier ditebak dari urutannya.

   Hasilnya membawa flag `estimated` supaya antarmuka bisa berhenti memasang
   keterangan "perkiraan" pada data yang sebenarnya sudah pasti - itu satu-
   satunya alasan flag ini ada. Tier kosong berarti *tidak diketahui*, bukan
   *datar*; kontrak API menegaskan pembacaan itu. */
export function pyramidOf(f: Partial<Fragrance> | null | undefined): PyramidResult {
  const top = normalizeNotes(f?.top_notes);
  const heart = normalizeNotes(f?.heart_notes);
  const base = normalizeNotes(f?.base_notes);
  if (top.length || heart.length || base.length) {
    return { top, heart, base, estimated: false };
  }
  const guess = splitPyramid(f?.notes);
  return guess && { ...guess, estimated: true };
}

/* Pembagian cadangan untuk record tanpa tier tersimpan: tiga kelompok hampir
   sama besar, mengandalkan konvensi bahwa katalog menulis notes dari yang
   paling menguap ke yang paling bertahan. */
export function splitPyramid(notes: readonly string[] | null | undefined): Pyramid | null {
  const list = normalizeNotes(notes);
  if (list.length < 3) return null;
  // tiga kelompok hampir sama besar; base tidak pernah kosong
  const top = Math.ceil(list.length / 3);
  const heart = Math.ceil((list.length - top) / 2);
  return {
    top: list.slice(0, top),
    heart: list.slice(top, top + heart),
    base: list.slice(top + heart),
  };
}

/* Renderer markdown-lite untuk narasi agen (##, **, *, "- ", ---).
   Input di-escape dulu; satu-satunya tag yang masuk adalah milik kita. */
export function renderMarkdown(md: string | null | undefined): string {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  let html = "";
  let inList = false;
  let skippedLead = false;

  const inline = (s: string): string =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const closeList = (): void => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const line of lines) {
    const text = line.trim();
    if (/^- /.test(text)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(text.slice(2))}</li>`;
      continue;
    }
    closeList();
    if (!text) continue;
    if (/^#\s/.test(text)) {
      if (!skippedLead) {
        skippedLead = true;
        continue;
      }
      html += `<h4>${inline(text.replace(/^#\s*/, ""))}</h4>`;
    } else if (/^##\s/.test(text)) html += `<h4>${inline(text.replace(/^##\s*/, ""))}</h4>`;
    else if (/^###\s/.test(text)) html += `<h5>${inline(text.replace(/^###\s*/, ""))}</h5>`;
    else if (/^---+$/.test(text)) html += "<hr />";
    else html += `<p>${inline(text)}</p>`;
  }
  closeList();
  return html;
}
