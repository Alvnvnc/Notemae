/* Rute /konsultan sebagai React asli. Form + streaming SSE yang dulu ada di
   consult.js/bindConsult, kini state React. Dipakai juga sebagai seksi penutup
   beranda lewat <ConsultForm /> (tanpa meta), jadi keduanya tak pernah beda.

   Backend mengirim tahapan berurutan lewat SSE: kecocokan katalog dulu (<1
   detik), lalu hasil rerank model, lalu narasi per token. Kalau streaming gagal
   (proxy buffering, browser tanpa ReadableStream), jatuh ke endpoint sekali
   tembak yang hasilnya sama. */
import { useEffect, useRef, useState } from "react";
import type { ConsultStage, Fragrance, MatchResult, RecommendationRequest } from "../../lib/api-types.ts";
import { recommend, recommendFromText, streamRecommendation } from "../../lib/api.ts";
import { FAMILIES } from "../../lib/config.ts";
import { displayName, renderMarkdown } from "../../lib/format.ts";
import { IDR_PER_USD } from "../../lib/i18n.ts";
import { scrollToEl } from "../../legacy/motion.js";
import { useLocale, useT } from "../i18n.tsx";
import { useRouteMeta } from "../meta.ts";
import { useReveal } from "../reveal.ts";
import { Picker } from "../ui/Picker.tsx";

const CONSULT_STAGES = ["reading", "matching", "refining", "writing"] as const;
const OCCASIONS = ["office", "date", "casual", "party"] as const;
const CLIMATES = ["tropical", "warm", "mild", "hot"] as const;

function Stepper({ stage, hidden }: { stage: ConsultStage | null; hidden: boolean }) {
  const t = useT();
  const at = stage ? CONSULT_STAGES.indexOf(stage) : -1;
  return (
    <ol className="steps" id="consult-steps" aria-hidden="true" hidden={hidden}>
      {CONSULT_STAGES.map((s, i) => (
        <li className="steps__item" data-stage={s} key={s}
          data-state={at < 0 ? undefined : i < at ? "done" : i === at ? "active" : "todo"}>
          <span className="steps__dot"></span>
          <span className="steps__label">{t(`stage.${s}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function RecHead({ recommendation, top, refined }: { recommendation: Fragrance; top: MatchResult | null; refined: boolean }) {
  const t = useT();
  return (
    <div className="rec__head">
      <p className="rec__eyebrow">{t("home.recommended")}</p>
      <h3 className="rec__name">{displayName(recommendation.brand, recommendation.name)}</h3>
      {top && typeof top.score === "number" && (
        <p className="rec__score">
          {t("home.matchScore", { score: top.score })}
          {!refined && <> <span className="rec__provisional">{t("home.provisional")}</span></>}
        </p>
      )}
    </div>
  );
}

function RecFoot({ recommendation, alternatives }: { recommendation: Fragrance; alternatives: Fragrance[] }) {
  const t = useT();
  const alts = (alternatives || []).map((a) => displayName(a.brand, a.name)).join(", ");
  return (
    <>
      {alts && <p className="rec__alt"><strong>{t("home.consider")}</strong> {alts}</p>}
      {recommendation.slug && (
        <p className="rec__alt" style={{ marginTop: 20 }}>
          <a className="btn btn--ghost" href={`/parfum/${encodeURIComponent(recommendation.slug)}`}>{t("home.viewDupe")}</a>
        </p>
      )}
    </>
  );
}

function RecSkeleton() {
  const t = useT();
  return (
    <>
      <div className="rec__head">
        <p className="rec__eyebrow">{t("home.recommended")}</p>
        <p className="rec__name skel-text skel-text--lg"><span></span></p>
        <p className="rec__score skel-text"><span></span></p>
      </div>
      <div className="rec__body skel-text skel-text--body"><span></span><span></span><span></span></div>
    </>
  );
}

export function ConsultForm({ page = false }: { page?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const budgetStep = locale === "en" ? 50 : 50000;

  const [profile, setProfile] = useState("");
  const [occasion, setOccasion] = useState("office");
  const [climate, setClimate] = useState("tropical");
  const [budget, setBudget] = useState(() => (locale === "en" ? 100 : 1500000));
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<ConsultStage | null>(null);
  const [status, setStatus] = useState<{ text: string; tone: "error" | null }>({ text: "", tone: null });
  const [resultVisible, setResultVisible] = useState(false);
  const [skeleton, setSkeleton] = useState(false);
  const [recommendation, setRecommendation] = useState<Fragrance | null>(null);
  const [top, setTop] = useState<MatchResult | null>(null);
  const [refined, setRefined] = useState(false);
  const [alternatives, setAlternatives] = useState<Fragrance[]>([]);
  const [explanation, setExplanation] = useState("");

  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const occasionOptions = OCCASIONS.map((v) => ({ value: v, label: t(`occasion.${v}`) }));
  const climateOptions = CLIMATES.map((v) => ({ value: v, label: t(`climate.${v}`) }));

  const stop = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
  };

  const onCancel = () => {
    stop();
    setStatus({ text: t("home.cancelled"), tone: null });
    setResultVisible(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    setBusy(true);
    setStage("matching");
    setStatus({ text: t("home.matching"), tone: null });
    setSkeleton(true);
    setResultVisible(true);
    setRecommendation(null);
    setExplanation("");
    requestAnimationFrame(() => { if (resultRef.current) scrollToEl(resultRef.current); });

    const profileText = profile.trim();
    const budgetNum = Number(budget) || 0;
    const budgetIdr = budgetNum ? (locale === "en" ? Math.round(budgetNum * IDR_PER_USD) : budgetNum) : null;
    const kind = profileText ? "text" : "parametric";
    const textPayload = { text: profileText, limit: 3 };
    const paramPayload: RecommendationRequest = {
      occasion, climate, budget_idr: budgetIdr,
      preferred_notes: notes.split(",").map((s) => s.trim()).filter(Boolean),
      limit: 3,
    };

    let painted = false;
    try {
      await streamRecommendation(kind, kind === "text" ? textPayload : paramPayload, {
        stage: (data) => { setStage(data.stage); setStatus({ text: t(`stage.${data.stage}`), tone: null }); },
        matches: (data) => {
          setSkeleton(false);
          setRecommendation(data.recommendation);
          setTop(data.matches?.[0] ?? null);
          setRefined(!!data.refined);
          setAlternatives(data.refined ? (data.alternatives || []) : []);
          painted = true;
        },
        delta: (data) => { setExplanation((prev) => prev + data.text); painted = true; },
        error: (data) => { throw new Error(data.detail || "stream error"); },
      }, { signal });
      if (!painted) throw new Error("empty stream");
      setStatus({ text: t("home.ai"), tone: null });
    } catch {
      if (signal.aborted) return;
      const ok = await legacyRecommend();
      setStatus(ok ? { text: t("home.catalogFallback"), tone: null } : { text: t("home.unavailable"), tone: "error" });
      if (!ok) setResultVisible(false);
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
    }

    async function legacyRecommend(): Promise<boolean> {
      try {
        const data = kind === "text"
          ? await recommendFromText(textPayload.text, textPayload.limit)
          : await recommend(paramPayload);
        setSkeleton(false);
        setRecommendation(data.recommendation);
        setTop((data.matches || [])[0] ?? null);
        setRefined(true);
        setAlternatives(data.alternatives || []);
        setExplanation(data.explanation || "");
        return true;
      } catch { return false; }
    }
  };

  const Title = page ? "h1" : "h2";

  return (
    <section className={`consult sect shell${page ? " consult--page" : ""}`} id="konsultan" aria-labelledby="consult-title">
      <div className="consult__grid">
        <div className="consult__copy">
          <Title className="h-sect" id="consult-title" data-reveal="">{t("home.consultTitle")}</Title>
          <p className="lede" data-reveal="">{t("home.consultLede")}</p>
          <div className="consult__notes" data-reveal="" aria-hidden="true">
            {FAMILIES.map((f) => <span className="tag" key={f.q}>{f.name}</span>)}
          </div>
        </div>
        <div>
          <form className="consult__form" id="consult-form" noValidate data-reveal="" onSubmit={onSubmit} aria-busy={busy}>
            <label className="field field--wide">
              <span>{t("home.profile")}</span>
              <textarea name="profile" rows={3} placeholder={t("home.profilePlaceholder")} value={profile} onChange={(e) => setProfile(e.target.value)} />
            </label>
            <label className="field">
              <span id="consult-occasion-label">{t("home.occasion")}</span>
              <Picker value={occasion} options={occasionOptions} onChange={setOccasion} ariaLabelledby="consult-occasion-label" />
            </label>
            <label className="field">
              <span id="consult-climate-label">{t("home.climate")}</span>
              <Picker value={climate} options={climateOptions} onChange={setClimate} ariaLabelledby="consult-climate-label" />
            </label>
            <label className="field">
              <span>{t("home.budget")}</span>
              <input name="budget" type="number" inputMode="numeric" min={0} step={budgetStep} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>{t("home.notes")}</span>
              <input name="notes" type="text" placeholder="iris, citrus, cedar" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="consult__actions">
              <button className="btn" id="consult-submit" type="submit" disabled={busy} aria-busy={busy}>
                <span className="spin" aria-hidden="true"></span>
                <span id="consult-submit-label">{busy && stage ? t(`stage.${stage}`) : t("home.recommend")}</span>
              </button>
              {busy && (
                <button className="btn btn--quiet" id="consult-cancel" type="button" onClick={onCancel}>{t("home.cancel")}</button>
              )}
            </div>
          </form>
          <p className={`status${busy ? " sr-only" : ""}`} id="consult-status" role="status" aria-live="polite" data-tone={status.tone || undefined}>{status.text}</p>
          <article className="rec" id="consult-result" hidden={!resultVisible} aria-busy={busy} ref={resultRef}>
            <Stepper stage={stage} hidden={!busy} />
            <div id="consult-result-body">
              {skeleton ? <RecSkeleton /> : recommendation && (
                <>
                  <RecHead recommendation={recommendation} top={top} refined={refined} />
                  <div className="rec__body" dangerouslySetInnerHTML={{ __html: explanation ? renderMarkdown(explanation) : "" }} />
                  {refined && <RecFoot recommendation={recommendation} alternatives={alternatives} />}
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function ConsultRoute() {
  const t = useT();
  useRouteMeta({ title: t("nav.consultant"), desc: t("home.consultLede"), stage: false });
  useReveal();
  return <ConsultForm page />;
}
