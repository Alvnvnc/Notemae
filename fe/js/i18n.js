/* Locale ringan untuk frontend. Default sengaja English agar pengalaman baru
   konsisten, sementara pilihan pengguna disimpan di browser. */

const STORAGE_KEY = "scentsphere-locale";
const SUPPORTED = new Set(["en", "id"]);
// Katalog menyimpan harga dalam IDR; display USD memakai kurs tampilan tetap
// agar nilai konsisten di seluruh halaman tanpa mengubah kontrak API.
export const IDR_PER_USD = 16000;

const DICT = {
  en: {
    "nav.catalog": "Catalog", "nav.consultant": "Consultant", "nav.search": "Search",
    "nav.language": "Language", "nav.home": "Home", "nav.close": "Close",
    "search.placeholder": "Type a perfume or brand", "search.hint": "Try \"aventus\", \"baccarat\", or notes like \"vanilla musk\".",
    "search.label": "Quick search", "search.suggestions": "Perfume suggestions",
    "currency.missing": "Price unavailable", "currency.all": "All prices", "currency.below": "Under {value}",
    "currency.range": "{from} to {to}", "currency.above": "Over {value}",
    "gender.all": "All", "gender.men": "Men", "gender.women": "Women", "gender.unisex": "Unisex",
    "occasion.office": "Office", "occasion.date": "Date", "occasion.casual": "Everyday", "occasion.formal": "Formal", "occasion.party": "Party", "occasion.sport": "Sport",
    "climate.tropical": "Tropical", "climate.warm": "Warm", "climate.mild": "Mild", "climate.hot": "Hot", "climate.cool": "Cool", "climate.cold": "Cold",
    "relation.clone_of": "Clone", "relation.inspired_by": "Inspired", "relation.flanker_of": "Flanker", "relation.similar": "Similar",
    "relation.flankerClaim": "A release from the same line as {name}.",
    "relation.highClaim": "Widely known as a {kind} of {name}.", "relation.midClaim": "Often compared with {name} by the community.",
    "relation.lowClaim": "Called similar to {name}, but community consensus is limited.",
    "relation.clone": "clone", "relation.alternative": "inspired alternative",
    "role.original": "Original", "role.alternative": "Alternative",
    "common.skip": "Skip to content", "common.loading": "Loading ScentSphere", "common.notes": "Notes", "common.noNotes": "Notes not recorded", "common.noData": "Not available", "common.rating": "Community rating", "common.source": "Data source", "common.viewSource": "View source", "common.backCatalog": "Back to catalog",
    "common.compare": "Compare side by side", "common.detail": "View details", "common.savings": "Save", "common.similarity": "notes similarity",
    "catalog.title": "Perfume catalog.", "catalog.searchLabel": "Search perfume, brand, or notes", "catalog.searchPlaceholder": "Search a name, brand, or notes like vanilla musk", "catalog.search": "Search",
    "catalog.family": "Family", "catalog.filter": "Filter", "catalog.allBrands": "All brands", "catalog.reset": "Clear all filters", "catalog.count": "{count} perfumes",
    "catalog.loading": "Loading catalog...", "catalog.error": "Catalog could not be loaded. Check your connection and try again.", "catalog.empty": "Nothing matches.", "catalog.emptyHint": "Try loosening a filter, or search notes like \"vanilla\" or \"citrus\".",
    "catalog.page": "Page {page}", "catalog.pagination": "Page navigation",
    "home.eyebrow": "Perfume dupe guide", "home.hero1": "High-end scent,", "home.hero2": "at a sensible price.",
    "home.lede": "Find alternatives to your favorite perfumes, with honest note-similarity scores and savings calculations.", "home.browse": "Explore catalog", "home.featured": "See featured pairs",
    "home.pairs": "Featured pairs.", "home.pick": "Choose an original perfume", "home.steps": "Three steps, no guesswork.",
    "home.step1": "Pick the original perfume", "home.step1p": "Search by name, brand, or notes you like in the catalog.",
    "home.step2": "Read the similarity score", "home.step2p": "Scores are calculated from shared catalog notes, not ad claims.",
    "home.step3": "Compare, then decide", "home.step3p": "Side-by-side comparison shows shared notes, differences, and the price gap.",
    "home.consensus": "Dupes with the strongest consensus.", "home.all": "All perfumes", "home.consultTitle": "Not sure where to start?",
    "home.consultLede": "Tell us what you like in everyday language, or fill in the parameters. Recommendations always come from catalog notes.",
    "home.profile": "Tell us your taste", "home.profilePlaceholder": "I want an office perfume in New York, budget around $100. I like citrus and iris, but not overly sweet scents.", "home.occasion": "Occasion", "home.climate": "Climate", "home.budget": "Budget (USD)", "home.notes": "Notes you like", "home.recommend": "Get recommendations",
    "home.matching": "Matching against the catalog...", "home.recommended": "Your recommendation", "home.matchScore": "Match score: {score} / 100", "home.consider": "Also consider:", "home.viewDupe": "View details and dupes", "home.catalogFallback": "Recommendation based on catalog data.", "home.ai": "Explanation written by AI and limited to catalog data.", "home.unavailable": "Consultant is unavailable. Try again shortly.",
    "detail.title": "Aroma composition.", "detail.pyramid": "Notes pyramid.", "detail.pyramidHint": "Tiers are estimated from the notes order in the catalog.", "detail.price": "Price range", "detail.release": "Released {year}", "detail.dupes": "Recommended alternatives.", "detail.noDupes": "No curated alternatives yet.", "detail.sorted": "{count} curated alternatives, sorted by community consensus.", "detail.ai": "Ask the aroma consultant", "detail.aiLoading": "Preparing explanation...", "detail.aiUnavailable": "AI review is unavailable.", "detail.longevity": "Longevity", "detail.projection": "Projection",
    "compare.title": "Side by side: {a} and {b}.", "compare.similarity": "note composition similarity", "compare.noShared": "No exact shared notes in the catalog.", "compare.saved": "more affordable ({pct}% of the original price)", "compare.gap": "price difference between them", "compare.disclaimer": "Comparison is calculated from catalog notes; the real scent profile may differ on skin.",
    "errors.notFound": "Perfume not found.", "errors.notFoundHint": "{slug} is not in the catalog. The link may have changed.", "errors.compare": "Comparison could not be loaded.", "errors.compareHint": "One of the perfumes was not found in the catalog.",
    "footer.description": "A guide to finding perfume alternatives. Similarity scores use catalog note composition, not official brand claims.", "footer.data": "Some product identity data includes Open Beauty Facts contributions under the ODbL license.", "footer.pairs": "Featured pairs", "footer.consultant": "Aroma consultant", "footer.legal": "Dupe relationships come from community consensus curation and do not assess physical product authenticity."
  },
  id: {
    "nav.catalog": "Katalog", "nav.consultant": "Konsultan", "nav.search": "Cari", "nav.language": "Bahasa", "nav.home": "Beranda", "nav.close": "Tutup",
    "search.placeholder": "Ketik nama parfum atau brand", "search.hint": "Coba \"aventus\", \"baccarat\", atau notes seperti \"vanilla musk\".", "search.label": "Pencarian cepat", "search.suggestions": "Saran parfum",
    "currency.missing": "Harga belum tersedia", "currency.all": "Semua harga", "currency.below": "Di bawah {value}", "currency.range": "{from} sampai {to}", "currency.above": "Di atas {value}",
    "gender.all": "Semua", "gender.men": "Pria", "gender.women": "Wanita", "gender.unisex": "Unisex",
    "occasion.office": "Kantor", "occasion.date": "Kencan", "occasion.casual": "Harian", "occasion.formal": "Formal", "occasion.party": "Pesta", "occasion.sport": "Olahraga",
    "climate.tropical": "Tropis", "climate.warm": "Hangat", "climate.mild": "Sejuk", "climate.hot": "Panas", "climate.cool": "Dingin", "climate.cold": "Dingin",
    "relation.clone_of": "Clone", "relation.inspired_by": "Terinspirasi", "relation.flanker_of": "Flanker", "relation.similar": "Serupa", "relation.flankerClaim": "Rilisan satu lini dengan {name}.", "relation.highClaim": "Dikenal luas sebagai {kind} dari {name}.", "relation.midClaim": "Sering dibandingkan dengan {name} oleh komunitas.", "relation.lowClaim": "Disebut mirip {name}, tetapi konsensus komunitasnya masih terbatas.", "relation.clone": "clone", "relation.alternative": "alternatif terinspirasi",
    "role.original": "Original", "role.alternative": "Alternatif", "common.skip": "Langsung ke konten", "common.loading": "Memuat ScentSphere", "common.notes": "Notes", "common.noNotes": "Notes belum tercatat", "common.noData": "Belum ada", "common.rating": "Rating komunitas", "common.source": "Sumber data", "common.viewSource": "Lihat sumber", "common.backCatalog": "Kembali ke katalog", "common.compare": "Bandingkan berdampingan", "common.detail": "Lihat detail", "common.savings": "Hemat", "common.similarity": "kemiripan notes",
    "catalog.title": "Katalog parfum.", "catalog.searchLabel": "Cari parfum, brand, atau notes", "catalog.searchPlaceholder": "Cari nama, brand, atau notes seperti vanilla musk", "catalog.search": "Cari", "catalog.family": "Keluarga", "catalog.filter": "Saring", "catalog.allBrands": "Semua brand", "catalog.reset": "Hapus semua filter", "catalog.count": "{count} parfum", "catalog.loading": "Memuat katalog...", "catalog.error": "Katalog tidak bisa dimuat. Periksa koneksi lalu coba lagi.", "catalog.empty": "Tidak ada yang cocok.", "catalog.emptyHint": "Coba longgarkan filter, atau cari lewat notes seperti \"vanilla\" atau \"citrus\".", "catalog.page": "Halaman {page}", "catalog.pagination": "Navigasi halaman",
    "home.eyebrow": "Panduan dupe parfum", "home.hero1": "Aroma kelas atas,", "home.hero2": "harga masuk akal.", "home.lede": "Temukan alternatif parfum favoritmu, lengkap dengan skor kemiripan notes dan hitungan penghematan yang jujur.", "home.browse": "Jelajahi katalog", "home.featured": "Lihat pasangan tersorot", "home.pairs": "Pasangan tersorot.", "home.pick": "Pilih parfum original", "home.steps": "Tiga langkah, tanpa tebak-tebakan.", "home.step1": "Pilih parfum originalnya", "home.step1p": "Cari lewat nama, brand, atau notes yang kamu sukai di katalog.", "home.step2": "Baca skor kemiripannya", "home.step2p": "Skor dihitung dari kesamaan komposisi notes di katalog, bukan klaim iklan.", "home.step3": "Bandingkan, lalu putuskan", "home.step3p": "Perbandingan berdampingan menunjukkan notes yang sama, yang beda, dan selisih harganya.", "home.consensus": "Dupe dengan konsensus tertinggi.", "home.all": "Semua parfum", "home.consultTitle": "Belum tahu mulai dari mana?", "home.consultLede": "Ceritakan seleramu dengan bahasa sehari-hari, atau isi parameternya. Rekomendasi selalu diambil dari catatan katalog, tidak pernah dikarang.", "home.profile": "Ceritakan seleramu", "home.profilePlaceholder": "Saya cari parfum kantor di Jakarta, budget sekitar Rp1,5 juta. Suka citrus dan iris, kurang suka yang terlalu manis.", "home.occasion": "Acara", "home.climate": "Iklim", "home.budget": "Budget (Rp)", "home.notes": "Notes yang disukai", "home.recommend": "Minta rekomendasi", "home.matching": "Mencocokkan dengan katalog...", "home.recommended": "Rekomendasi untukmu", "home.matchScore": "Skor kecocokan {score} dari 100", "home.consider": "Pertimbangkan juga:", "home.viewDupe": "Lihat detail dan dupenya", "home.catalogFallback": "Rekomendasi berbasis katalog.", "home.ai": "Penjelasan ditulis AI, dibatasi data katalog.", "home.unavailable": "Konsultan sedang tidak tersedia. Coba lagi sebentar lagi.",
    "detail.title": "Komposisi aroma.", "detail.pyramid": "Piramida notes.", "detail.pyramidHint": "Pembagian tier diperkirakan dari urutan data notes di katalog.", "detail.price": "Kisaran harga", "detail.release": "Rilis {year}", "detail.dupes": "Alternatif rekomendasi.", "detail.noDupes": "Belum ada alternatif kurasi.", "detail.sorted": "{count} alternatif terkurasi, diurutkan dari konsensus tertinggi.", "detail.ai": "Minta penjelasan konsultan aroma", "detail.aiLoading": "Menyiapkan penjelasan...", "detail.aiUnavailable": "Ulasan AI sedang tidak tersedia.", "detail.longevity": "Ketahanan", "detail.projection": "Proyeksi",
    "compare.title": "Berdampingan: {a} dan {b}.", "compare.similarity": "kemiripan komposisi notes", "compare.noShared": "Tidak ada notes yang persis sama di catatan katalog.", "compare.saved": "lebih hemat ({pct}% dari harga original)", "compare.gap": "selisih harga keduanya", "compare.disclaimer": "Perbandingan dihitung dari catatan katalog; profil aroma nyata bisa berbeda di kulit.", "errors.notFound": "Parfum tidak ditemukan.", "errors.notFoundHint": "{slug} tidak ada di katalog. Mungkin tautannya sudah berubah.", "errors.compare": "Perbandingan tidak bisa dimuat.", "errors.compareHint": "Salah satu parfum tidak ditemukan di katalog.", "footer.description": "Panduan menemukan alternatif parfum. Skor kemiripan dihitung dari komposisi notes di katalog, bukan klaim resmi brand.", "footer.data": "Sebagian data identitas produk memuat kontribusi Open Beauty Facts di bawah lisensi ODbL.", "footer.pairs": "Pasangan tersorot", "footer.consultant": "Konsultan aroma", "footer.legal": "Relasi dupe berasal dari kurasi konsensus komunitas dan tidak menilai keaslian produk fisik."
  }
};

let locale = "en";
try { const saved = localStorage.getItem(STORAGE_KEY); if (SUPPORTED.has(saved)) locale = saved; } catch { /* storage unavailable */ }

export function getLocale() { return locale; }
export function setLocale(next) {
  if (!SUPPORTED.has(next) || next === locale) return;
  locale = next;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("scentsphere:localechange", { detail: { locale } }));
}
export function t(key, vars = {}) {
  const value = DICT[locale]?.[key] || DICT.en[key] || key;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => vars[name] == null ? "" : vars[name]);
}
export function localeCurrency() { return locale === "id" ? "IDR" : "USD"; }
export function localeNumber(value, options = {}) {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", options).format(value);
}
export function localeMoney(value, { compact = false } = {}) {
  if (!value && value !== 0) return t("currency.missing");
  const currency = localeCurrency();
  const amount = currency === "USD" ? Number(value) / IDR_PER_USD : Number(value);
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency", currency, notation: compact ? "compact" : "standard",
    maximumFractionDigits: currency === "IDR" ? (compact ? 1 : 0) : (compact ? 1 : 2)
  }).format(amount);
}
export function priceRangeLabel(index) {
  const idr = [0, 500000, 1000000, 2500000];
  if (index === 0) return t("currency.all");
  if (index === 1) return t("currency.below", { value: localeMoney(idr[1]) });
  if (index === 2) return t("currency.range", { from: localeMoney(idr[1]), to: localeMoney(idr[2]) });
  if (index === 3) return t("currency.range", { from: localeMoney(idr[2]), to: localeMoney(idr[3]) });
  return t("currency.above", { value: localeMoney(idr[3]) });
}

if (typeof document !== "undefined") document.documentElement.lang = locale;
