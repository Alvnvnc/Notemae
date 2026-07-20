/* Lapisan API tipis di atas backend publik (lihat docs/api-contract.md).
   GET di-cache singkat di memori supaya navigasi bolak-balik terasa instan
   (KNF-01) tanpa menyimpan data basi terlalu lama (KNF-13). */
import type {
  DupeResponse,
  FeaturedList,
  Fragrance,
  FragranceList,
  NoteTier,
  RecommendationRequest,
  RecommendationResponse,
  SseEvent,
  SseEventMap,
  SseEventName,
  TextRecommendationResponse,
} from "./api-types.ts";
import { BACKEND_URL, FETCH_LIMIT, FEATURED_LIMIT } from "./config.ts";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 90_000;

interface Options {
  signal?: AbortSignal;
}

async function getJson<T>(path: string, { signal }: Options = {}): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const res = await fetch(BACKEND_URL + path, { signal });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

export interface SearchParams extends Options {
  q?: string;
  note?: string;
  noteTier?: NoteTier;
  occasion?: string;
  maxPriceIdr?: number;
  /** Dibatasi 50 oleh API. */
  limit?: number;
}

export async function searchFragrances({
  q,
  note,
  noteTier,
  occasion,
  maxPriceIdr,
  limit = FETCH_LIMIT,
  signal,
}: SearchParams = {}): Promise<Fragrance[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (q) qs.set("q", q);
  if (note) qs.set("note", note);
  if (noteTier) qs.set("note_tier", noteTier);
  if (occasion) qs.set("occasion", occasion);
  if (maxPriceIdr) qs.set("max_price_idr", String(maxPriceIdr));
  const data = await getJson<FragranceList>(`/v1/fragrances?${qs}`, { signal });
  return data.items || [];
}

export function getFragrance(slug: string, opts: Options = {}): Promise<Fragrance> {
  return getJson<Fragrance>(`/v1/fragrances/${encodeURIComponent(slug)}`, opts);
}

export function getDupes(
  slug: string,
  { explain = false, signal }: Options & { explain?: boolean } = {},
): Promise<DupeResponse> {
  const qs = explain ? "?explain=true" : "";
  return getJson<DupeResponse>(`/v1/fragrances/${encodeURIComponent(slug)}/dupes${qs}`, { signal });
}

export async function getFeatured({
  limit = FEATURED_LIMIT,
  signal,
}: Options & { limit?: number } = {}): Promise<DupeResponse[]> {
  const data = await getJson<FeaturedList>(`/v1/featured?limit=${limit}`, { signal });
  return data.items || [];
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(BACKEND_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export function recommend(payload: RecommendationRequest): Promise<RecommendationResponse> {
  return postJson<RecommendationResponse>("/v1/recommendations", payload);
}

export function recommendFromText(text: string, limit = 3): Promise<TextRecommendationResponse> {
  return postJson<TextRecommendationResponse>("/v1/recommendations/from-text", { text, limit });
}

/* ---- rekomendasi streaming (SSE) ----------------------------------------- */

/* Backend mengirim tahapannya berurutan: kecocokan katalog lebih dulu (di
   bawah sedetik), lalu hasil rerank model, lalu narasi per token. Dipakai
   POST + ReadableStream, bukan EventSource, karena EventSource hanya bisa
   GET dan payload profil terlalu besar untuk query string. */

/** Nama event yang dikenal; frame lain diabaikan alih-alih mematikan stream. */
const KNOWN: readonly SseEventName[] = ["stage", "matches", "profile", "delta", "done", "error"];

function isKnown(name: string): name is SseEventName {
  return (KNOWN as readonly string[]).includes(name);
}

function parseSseChunk(buffer: string, onEvent: (event: SseEvent) => void): string {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    let name = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (!data.length || !isKnown(name)) continue;

    /* Penguraian dipisah tegas dari pemanggilan handler. Versi sebelumnya
       membungkus keduanya dalam satu try/catch "frame rusak", sehingga galat
       yang sengaja dilempar handler - persis yang dilakukan event `error` -
       ikut ditelan dan stream berjalan terus seolah tidak terjadi apa-apa. */
    let payload: unknown;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      continue; // frame rusak: lewati, jangan matikan stream
    }
    // Nama sudah dipersempit ke SseEventName di atas, tapi isi payload-nya
    // datang dari kawat: TypeScript tidak bisa membuktikan pasangannya cocok.
    onEvent({ name, data: payload } as SseEvent);
  }
  return rest;
}

export type StreamKind = "parametric" | "text";

export type SseHandlers = {
  [K in SseEventName]?: (data: SseEventMap[K]) => void;
};

/**
 * Menjalankan stream rekomendasi sampai selesai.
 *
 * `handlers` dipanggil per event dan sudah bertipe sesuai namanya, jadi
 * `handlers.delta` menerima `{ text }` tanpa cast di sisi pemanggil.
 */
export async function streamRecommendation(
  kind: StreamKind,
  payload: unknown,
  handlers: SseHandlers,
  { signal }: Options = {},
): Promise<void> {
  const path =
    kind === "text" ? "/v1/recommendations/from-text/stream" : "/v1/recommendations/stream";
  const res = await fetch(BACKEND_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`POST ${path} -> ${res.status}`);

  const dispatch = (event: SseEvent): void => {
    // Setiap cabang union punya pasangan name/data yang cocok; pemanggilan
    // lewat indeks membuat TypeScript kehilangan hubungan itu, jadi
    // penyempitannya dilakukan sekali di sini.
    const handler = handlers[event.name] as ((data: unknown) => void) | undefined;
    handler?.(event.data);
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = parseSseChunk(buffer + decoder.decode(value, { stream: true }), dispatch);
    }
  } finally {
    // Handler yang melempar (mis. event `error`) keluar dari loop lebih awal;
    // tanpa ini koneksinya menggantung sampai GC.
    await reader.cancel().catch(() => {});
  }
}
