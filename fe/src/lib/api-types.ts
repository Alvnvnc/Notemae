/* Bentuk data kontrak API v1 (lihat docs/api-contract.md).
 *
 * Diturunkan dari model Pydantic di backend/app/models.py. Backend memakai
 * `response_model`, jadi setiap field selalu hadir di JSON - termasuk yang
 * bernilai null. Tidak ada satu pun alias, sehingga nama kunci JSON persis
 * sama dengan nama field Python.
 *
 * Berkas ini sengaja hanya berisi tipe: tidak ada nilai yang di-emit, sehingga
 * mengimpornya tidak menambah satu byte pun ke bundle.
 */

export type SourceType = "public_dataset" | "official_api" | "licensed_feed";
export type GeneratedBy = "qwen" | "catalog_fallback";
export type PreferenceLevel = "low" | "moderate" | "high";
export type RelationType = "clone_of" | "inspired_by" | "flanker_of";
export type NoteTier = "top" | "heart" | "base";

/** Hanya request yang membatasi gender; di respons field-nya bebas bentuk. */
export type RequestGender = "men" | "women" | "unisex";

/* Union tertutup yang boleh dilewati nilai lain.
   `(string & {})` menahan TypeScript melebur union ini jadi `string` polos,
   jadi autocomplete tetap menawarkan nilai yang dikenal - tetapi nilai tak
   terduga dari kawat tidak membuat tipenya berbohong. Dibutuhkan karena
   event SSE `matches` meneruskan objek milik agent apa adanya, dan di sana
   `source_type` tidak dibatasi. */
type Known<T extends string> = T | (string & {});

export interface Fragrance {
  id: string;
  slug: string;
  brand: string;
  name: string;
  description: string;
  /** Bebas bentuk di respons (bukan Literal), mis. "men" | "women" | "unisex". */
  gender: string;
  release_year: number | null;
  /** Gabungan berurut dari ketiga tier, pembuka lebih dulu. */
  notes: string[];
  /* Tiga tier di bawah kosong = *tidak diketahui*, bukan *datar*. Itu keadaan
     wajar untuk record yang masuk sebelum piramida ada. Lihat pyramidOf(). */
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  occasions: string[];
  climates: string[];
  price_idr: number | null;
  rating: number | null;
  longevity_score: number | null;
  projection_score: number | null;
  source_url: string;
  source_type: Known<SourceType>;
  /* Hanya terisi di daftar `similar` (tetangga terdekat pgvector) dan di pool
     kandidat rekomendasi. Di endpoint lain selalu null - jangan mengurutkan
     katalog dengan field ini. */
  semantic_similarity: number | null;
}

export interface FragranceList {
  items: Fragrance[];
}

/** Satu relasi dupe terkurasi. `flankers[]` selalu berelasi "flanker_of". */
export interface RelatedFragrance {
  fragrance: Fragrance;
  relation: RelationType;
  /** 0..1. Menentukan seberapa berhati-hati klaimnya ditulis, lihat relationClaim(). */
  confidence: number;
  source: string;
}

export interface DupeResponse {
  fragrance: Fragrance;
  /** Parfum yang dikurasi sebagai clone/terinspirasi dari `fragrance`. */
  dupes: RelatedFragrance[];
  /** Kebalikannya: yang justru di-dupe oleh `fragrance` sendiri. */
  original_of: RelatedFragrance[];
  flankers: RelatedFragrance[];
  /* Tetangga terdekat embedding, BUKAN klaim dupe. Antarmuka wajib
     membedakan keduanya - lihat dupeSheetHtml/detail. */
  similar: Fragrance[];
  /** Hanya terisi saat `?explain=true` dan agent berhasil menjawab. */
  explanation: string | null;
  generated_by: GeneratedBy | null;
  disclaimer: string;
}

/** GET /v1/featured. Item adalah DupeResponse utuh, dan `dupes` dijamin tidak kosong. */
export interface FeaturedList {
  items: DupeResponse[];
}

/* Kunci rincian skor yang bisa muncul. Semuanya opsional: sebuah kunci hanya
   hadir kalau kriterianya memang ikut menyumbang.

   `notes` adalah ROLLUP dari keempat `notes_*` di bawahnya - menjumlahkan
   seluruh nilai di objek ini akan menghitungnya dua kali. */
export type ScoreBreakdownKey =
  | "rating"
  | "notes"
  | "notes_exact"
  | "notes_similar"
  | "notes_family"
  | "notes_character"
  | "families"
  | "semantic"
  | "anchors"
  | "occasion"
  | "climate"
  | "longevity"
  | "projection"
  | "budget"
  /* Bernilai negatif. */
  | "dislike_penalty"
  | "avoided_neighbour_penalty"
  | "missing_notes_penalty"
  | "hard_filter_penalty"
  /* Delta bertanda, hanya setelah pass rerank LLM. */
  | "llm_rerank";

export type ScoreBreakdown = Partial<Record<ScoreBreakdownKey, number>> & {
  [key: string]: number | undefined;
};

export interface MatchResult {
  fragrance: Fragrance;
  /** Bilangan bulat 0..100. */
  score: number;
  reasons: string[];
  cautions: string[];
  score_breakdown: ScoreBreakdown;
}

export interface RecommendationRequest {
  budget_idr?: number | null;
  occasion?: string | null;
  climate?: string | null;
  gender?: RequestGender | null;
  /* Backend TIDAK menormalkan null jadi [] untuk field-field ini: mengirim
     null akan ditolak 422. Kirim [] atau hilangkan kuncinya. */
  preferred_notes?: string[];
  avoid_notes?: string[];
  preferred_families?: string[];
  reference_likes?: string[];
  reference_dislikes?: string[];
  longevity_preference?: PreferenceLevel | null;
  projection_preference?: PreferenceLevel | null;
  free_text?: string | null;
  /** 1..5, default 3. */
  limit?: number;
}

export interface TextRecommendationRequest {
  /** 5..2000 karakter. */
  text: string;
  limit?: number;
}

export interface RecommendationResponse {
  recommendation: Fragrance;
  alternatives: Fragrance[];
  matches: MatchResult[];
  explanation: string;
  generated_by: GeneratedBy;
}

export interface TextRecommendationResponse extends RecommendationResponse {
  /** Profil hasil pembacaan teks bebas, dikembalikan supaya bisa ditampilkan. */
  profile: RecommendationRequest;
  profile_generated_by: GeneratedBy;
}

/* ---- rekomendasi streaming (SSE) ------------------------------------------
   Tidak punya skema OpenAPI: backend mengembalikan StreamingResponse, jadi
   union di bawah ditulis tangan mengikuti recommendation_events(). */

export type ConsultStage = "reading" | "matching" | "refining" | "writing";

export interface SseStageEvent {
  stage: ConsultStage;
}

export interface SseMatchesEvent {
  recommendation: Fragrance;
  alternatives: Fragrance[];
  matches: MatchResult[];
  /* Dikirim dua kali: kecocokan katalog mentah (false), lalu hasil rerank
     (true). Pada jalur agent-tidak-tersedia hanya sekali, dengan `true`. */
  refined: boolean;
  /* Hanya hadir di jalur agent-tidak-tersedia, saat event ini sekaligus
     membawa seluruh isi RecommendationResponse. */
  explanation?: string;
  generated_by?: GeneratedBy;
}

/** Hanya dikirim rute /from-text/stream. */
export interface SseProfileEvent {
  profile: RecommendationRequest;
  generated_by: GeneratedBy;
}

export interface SseDeltaEvent {
  text: string;
}

export interface SseDoneEvent {
  generated_by: GeneratedBy;
  /** Absen (bukan null) pada jalur agent-tidak-tersedia. */
  profile_generated_by?: GeneratedBy | null;
}

export interface SseErrorEvent {
  detail: string;
}

/** Peta nama event SSE ke bentuk payload-nya. */
export interface SseEventMap {
  stage: SseStageEvent;
  matches: SseMatchesEvent;
  profile: SseProfileEvent;
  delta: SseDeltaEvent;
  done: SseDoneEvent;
  error: SseErrorEvent;
}

export type SseEventName = keyof SseEventMap;

/** Satu frame SSE, sudah terurai dan menyempit lewat `name`. */
export type SseEvent = {
  [K in SseEventName]: { name: K; data: SseEventMap[K] };
}[SseEventName];
