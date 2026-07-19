/* Utilitas format + kalkulasi murni. Tidak menyentuh DOM kecuali escapeHtml. */

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const idrFull = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
});
const idrCompact = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1
});

export function rupiah(value) {
  if (!value && value !== 0) return "Harga belum tersedia";
  return idrFull.format(value);
}

export function rupiahCompact(value) {
  if (!value && value !== 0) return "-";
  return idrCompact.format(value);
}

/* Brand sering terulang di dalam nama produk hasil scraping; jangan tampil dua kali. */
export function displayName(brand, name) {
  brand = String(brand || "").trim();
  name = String(name || "").trim().replace(/\s+/g, " ").replace(/\s*\|\s*/g, " - ");
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`.trim();
}

export function normalizeNotes(notes) {
  return (notes || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean);
}

/* KF-06: kemiripan berbasis konten dihitung dari kesamaan notes (Jaccard).
   Skor ini transparan dan bisa diverifikasi pengguna dari daftar notes. */
export function noteOverlap(aNotes, bNotes) {
  const a = new Set(normalizeNotes(aNotes));
  const b = new Set(normalizeNotes(bNotes));
  const shared = [...a].filter((n) => b.has(n));
  const union = new Set([...a, ...b]);
  return {
    shared,
    onlyA: [...a].filter((n) => !b.has(n)),
    onlyB: [...b].filter((n) => !a.has(n)),
    pct: union.size ? Math.round((shared.length / union.size) * 100) : 0,
    coverage: a.size ? Math.round((shared.length / a.size) * 100) : 0
  };
}

/* KF-08: selisih harga + persentase penghematan. */
export function savings(originalPrice, dupePrice) {
  if (!originalPrice || !dupePrice || dupePrice >= originalPrice) return null;
  const diff = originalPrice - dupePrice;
  return { diff, pct: Math.round((diff / originalPrice) * 100) };
}

/* Wording relasi dupe terikat confidence kurasi (jangan melebih-lebihkan klaim). */
export function relationClaim(relation, confidence, originalName) {
  const name = originalName || "parfum ini";
  if (relation === "flanker_of") return `Rilisan satu lini dengan ${name}.`;
  const kind = relation === "clone_of" ? "clone" : "alternatif terinspirasi";
  if (confidence >= 0.8) return `Dikenal luas sebagai ${kind} dari ${name}.`;
  if (confidence >= 0.6) return `Sering dibandingkan dengan ${name} oleh komunitas.`;
  return `Disebut mirip ${name}, tetapi konsensus komunitasnya masih terbatas.`;
}

export function relationLabel(relation) {
  if (relation === "clone_of") return "Clone";
  if (relation === "inspired_by") return "Terinspirasi";
  if (relation === "flanker_of") return "Flanker";
  return "Serupa";
}

const GENDER_LABEL = { men: "Pria", women: "Wanita", unisex: "Unisex" };
export function genderLabel(g) { return GENDER_LABEL[g] || g || ""; }

const OCC_LABEL = { office: "Kantor", date: "Kencan", casual: "Harian", formal: "Formal", party: "Pesta", sport: "Olahraga" };
export function occasionLabel(o) { return OCC_LABEL[o] || o; }

const CLIMATE_LABEL = { tropical: "Tropis", warm: "Hangat", mild: "Sejuk", hot: "Panas", cool: "Dingin", cold: "Dingin" };
export function climateLabel(c) { return CLIMATE_LABEL[c] || c; }

/* KF-04: piramida notes. Data katalog berupa daftar notes berurutan
   (top -> base); tier dibentuk dari urutan itu dan diberi keterangan jujur
   bahwa pembagiannya perkiraan. */
export function splitPyramid(notes) {
  const list = normalizeNotes(notes);
  if (list.length < 3) return null;
  // tiga kelompok hampir sama besar; base tidak pernah kosong
  const top = Math.ceil(list.length / 3);
  const heart = Math.ceil((list.length - top) / 2);
  return {
    top: list.slice(0, top),
    heart: list.slice(top, top + heart),
    base: list.slice(top + heart)
  };
}

/* Renderer markdown-lite untuk narasi agen (##, **, *, "- ", ---).
   Input di-escape dulu; satu-satunya tag yang masuk adalah milik kita. */
export function renderMarkdown(md) {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  let html = "";
  let inList = false;
  let skippedLead = false;

  const inline = (s) => escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };

  for (const line of lines) {
    const t = line.trim();
    if (/^- /.test(t)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(t.slice(2))}</li>`;
      continue;
    }
    closeList();
    if (!t) continue;
    if (/^#\s/.test(t)) {
      if (!skippedLead) { skippedLead = true; continue; }
      html += `<h4>${inline(t.replace(/^#\s*/, ""))}</h4>`;
    } else if (/^##\s/.test(t)) html += `<h4>${inline(t.replace(/^##\s*/, ""))}</h4>`;
    else if (/^###\s/.test(t)) html += `<h5>${inline(t.replace(/^###\s*/, ""))}</h5>`;
    else if (/^---+$/.test(t)) html += "<hr />";
    else html += `<p>${inline(t)}</p>`;
  }
  closeList();
  return html;
}
