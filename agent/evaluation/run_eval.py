"""Offline A/B evaluation of the ranking pipeline on a persona golden set.

Usage:
    uv run python evaluation/run_eval.py                      # deterministic only
    uv run python evaluation/run_eval.py --with-qwen          # + LLM listwise rerank
    uv run python evaluation/run_eval.py --with-qwen --judge  # + LLM persona judge
    uv run python evaluation/run_eval.py --with-qwen --judge --runs 10

Ground-truth labels in fixtures/personas.json are hand-authored per persona,
independent of the scoring code, so the metrics are not circular. The catalog
fixture is for offline evaluation only and is never ingested.

When both variants run, a paired sign-flip permutation test and a bootstrap
95% CI are reported for the nDCG@3 delta. The optional judge roleplays each
persona (without seeing the labels) and rates every recommended item 0-2,
giving a second, label-independent quality signal plus its correlation with
the hand labels.
"""

import argparse
import copy
import hashlib
import json
import math
import platform
import random
import statistics
import sys
import time
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import reranker, scoring, taxonomy  # noqa: E402
from app.config import settings  # noqa: E402
from app.models import FragranceCandidate, RecommendationProfile  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
RESULTS_PATH = Path(__file__).parent / "results.json"
GAINS = {"perfect": 3.0, "good": 2.0, "acceptable": 1.0}
TOP_K = 3
SEED = 20260717

JUDGE_SYSTEM_PROMPT = """
You roleplay one specific Indonesian fragrance buyer. You receive the buyer's
own words and structured preferences, then a short list of recommended
fragrances with catalog facts. As that buyer, rate how happy you would be with
each recommendation: 2 = great match I would likely buy, 1 = acceptable,
0 = does not fit me. Rate every product independently rather than ranking the
products against each other. Judge only against the stated preferences and facts.
Return JSON only: {"ratings": {"<slug>": 0|1|2, ...}} covering every slug.
""".strip()


def load_catalog(path: Path | None = None) -> list[FragranceCandidate]:
    records = json.loads((path or FIXTURES / "catalog.json").read_text())
    return [
        FragranceCandidate(
            id=uuid.uuid5(uuid.NAMESPACE_URL, record["slug"]),
            source_url="https://example.com/evaluation-fixture",
            source_type="public_dataset",
            **record,
        )
        for record in records
    ]


def gain_map(persona: dict) -> dict[str, float]:
    gains: dict[str, float] = {}
    for grade, slugs in persona["relevant"].items():
        for slug in slugs:
            gains[slug] = GAINS[grade]
    return gains


def ndcg_at_k(ranked_slugs: list[str], gains: dict[str, float], k: int) -> float:
    dcg = sum(
        gains.get(slug, 0.0) / math.log2(position + 2)
        for position, slug in enumerate(ranked_slugs[:k])
    )
    ideal_gains = sorted(gains.values(), reverse=True)[:k]
    ideal = sum(
        gain / math.log2(position + 2) for position, gain in enumerate(ideal_gains)
    )
    return dcg / ideal if ideal else 0.0


def violation_flags(
    matches: list, profile: RecommendationProfile
) -> tuple[bool, bool]:
    avoided_notes, avoided_families = taxonomy.expand_avoided(profile.avoid_notes)
    avoid_violation = any(
        taxonomy.note_conflicts(m.fragrance.notes, avoided_notes, avoided_families)
        for m in matches
    )
    budget_violation = bool(profile.budget_idr) and any(
        m.fragrance.price_idr is not None
        and m.fragrance.price_idr > profile.budget_idr * scoring.BUDGET_TOLERANCE
        for m in matches
    )
    return avoid_violation, budget_violation


def diversity(matches: list) -> float:
    if len(matches) < 2:
        return 1.0
    pairs = [
        scoring.taste_similarity(a.fragrance, b.fragrance)
        for i, a in enumerate(matches)
        for b in matches[i + 1 :]
    ]
    return 1.0 - statistics.mean(pairs)


def judge_digest(candidate: FragranceCandidate) -> dict[str, object]:
    return {
        "slug": candidate.slug,
        "brand": candidate.brand,
        "name": candidate.name,
        "description": candidate.description,
        "gender": candidate.gender,
        "notes": candidate.notes,
        "occasions": candidate.occasions,
        "climates": candidate.climates,
        "price_idr": candidate.price_idr,
        "rating": candidate.rating,
        "longevity_score": candidate.longevity_score,
        "projection_score": candidate.projection_score,
    }


def judge_ratings(
    client,
    model: str,
    persona: dict,
    candidates: list[FragranceCandidate],
) -> dict[str, int] | None:
    digests = [judge_digest(candidate) for candidate in candidates]
    known_slugs = {candidate.slug for candidate in candidates}
    try:
        completion = client.chat.completions.create(
            model=model,
            temperature=0.0,
            messages=[
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "buyer_words": persona["text"],
                            "preferences": persona["profile"],
                            "recommendations": digests,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            response_format={"type": "json_object"},
            extra_body=settings.structured_extra_body,
        )
        parsed = json.loads(completion.choices[0].message.content)
        ratings = {
            slug: max(0, min(2, int(value)))
            for slug, value in parsed.get("ratings", {}).items()
            if slug in known_slugs
        }
    except Exception as error:  # noqa: BLE001 — eval must survive any judge failure
        print(f"  judge failed for {persona['name']}: {error}")
        return None
    if set(ratings) != known_slugs:
        missing = sorted(known_slugs - set(ratings))
        print(f"  judge omitted candidates for {persona['name']}: {missing}")
        return None
    return ratings


def run_variant(
    personas: list[dict],
    catalog: list[FragranceCandidate],
    by_slug: dict[str, FragranceCandidate],
    use_rerank: bool,
    rerank_client,
) -> dict:
    per_persona = []
    for persona in personas:
        profile = RecommendationProfile(**persona["profile"])
        liked = [by_slug[s] for s in persona.get("reference_like_slugs", [])]
        disliked = [by_slug[s] for s in persona.get("reference_dislike_slugs", [])]
        started = time.monotonic()
        survivors, rejected = scoring.score_pool(profile, catalog, liked, disliked)
        if use_rerank:
            survivors = reranker.consensus_rerank(rerank_client, profile, survivors)
        matches = scoring.select_top(profile, survivors, rejected)
        elapsed = time.monotonic() - started
        ranked_slugs = [m.fragrance.slug for m in matches]
        gains = gain_map(persona)
        avoid_violation, budget_violation = violation_flags(matches, profile)
        row = {
            "persona": persona["name"],
            "top": ranked_slugs,
            "ndcg@3": round(ndcg_at_k(ranked_slugs, gains, TOP_K), 3),
            "hit@1": gains.get(ranked_slugs[0], 0.0) >= GAINS["good"]
            if ranked_slugs
            else False,
            "avoid_violation": avoid_violation,
            "budget_violation": budget_violation,
            "diversity": round(diversity(matches), 3),
            "latency_s": round(elapsed, 2),
        }
        per_persona.append(row)

    summary = {
        "per_persona": per_persona,
        "mean_ndcg@3": round(statistics.mean(r["ndcg@3"] for r in per_persona), 3),
        "hit@1_rate": round(
            sum(r["hit@1"] for r in per_persona) / len(per_persona), 3
        ),
        "avoid_violation_rate": round(
            sum(r["avoid_violation"] for r in per_persona) / len(per_persona), 3
        ),
        "budget_violation_rate": round(
            sum(r["budget_violation"] for r in per_persona) / len(per_persona), 3
        ),
        "mean_diversity": round(
            statistics.mean(r["diversity"] for r in per_persona), 3
        ),
        "mean_latency_s": round(
            statistics.mean(r["latency_s"] for r in per_persona), 2
        ),
    }
    return summary


def attach_judgments(
    summaries: list[dict],
    personas: list[dict],
    by_slug: dict[str, FragranceCandidate],
    judge_client,
    judge_model: str,
) -> None:
    """Judge each persona-product pair once across every variant and run."""
    for index, persona in enumerate(personas):
        slugs = list(
            dict.fromkeys(
                slug
                for summary in summaries
                for slug in summary["per_persona"][index]["top"]
            )
        )
        random.Random(f"{SEED}:{persona['name']}").shuffle(slugs)
        ratings = judge_ratings(
            judge_client,
            judge_model,
            persona,
            [by_slug[slug] for slug in slugs],
        )
        if ratings is None:
            continue
        gains = gain_map(persona)
        for summary in summaries:
            row = summary["per_persona"][index]
            selected = row["top"]
            row["judge_ratings"] = {slug: ratings[slug] for slug in selected}
            row["judge_mean"] = round(
                statistics.mean(ratings[slug] for slug in selected), 3
            )
            row["label_gains"] = {
                slug: gains.get(slug, 0.0) for slug in selected
            }

    for summary in summaries:
        judged = [row for row in summary["per_persona"] if "judge_mean" in row]
        if judged:
            summary["mean_judge"] = round(
                statistics.mean(row["judge_mean"] for row in judged), 3
            )
            summary["judged_personas"] = len(judged)


def sample_sd(values: list[float]) -> float:
    return statistics.stdev(values) if len(values) > 1 else 0.0


def aggregate_runs(runs: list[dict]) -> dict:
    """Aggregate stochastic runs without treating runs as extra personas."""
    if not runs:
        raise ValueError("at least one rerank run is required")
    if len(runs) == 1:
        result = copy.deepcopy(runs[0])
        result["runs"] = 1
        result["mean_ndcg@3_sd_across_runs"] = 0.0
        result["hit@1_rate_sd_across_runs"] = 0.0
        result["mean_diversity_sd_across_runs"] = 0.0
        result["mean_latency_s_sd_across_runs"] = 0.0
        if "mean_judge" in result:
            result["mean_judge_sd_across_runs"] = 0.0
        return result

    per_persona: list[dict] = []
    for rows in zip(*(run["per_persona"] for run in runs), strict=True):
        top_counts = Counter(tuple(row["top"]) for row in rows)
        mode_top, mode_count = top_counts.most_common(1)[0]
        hit_rate = statistics.mean(float(row["hit@1"]) for row in rows)
        avoid_rate = statistics.mean(float(row["avoid_violation"]) for row in rows)
        budget_rate = statistics.mean(float(row["budget_violation"]) for row in rows)
        aggregate = {
            "persona": rows[0]["persona"],
            "top": list(mode_top),
            "top_run_frequency": round(mode_count / len(runs), 3),
            "ndcg@3": round(statistics.mean(row["ndcg@3"] for row in rows), 3),
            "hit@1": hit_rate >= 0.5,
            "hit@1_rate": round(hit_rate, 3),
            "avoid_violation": avoid_rate > 0,
            "avoid_violation_rate": round(avoid_rate, 3),
            "budget_violation": budget_rate > 0,
            "budget_violation_rate": round(budget_rate, 3),
            "diversity": round(
                statistics.mean(row["diversity"] for row in rows), 3
            ),
            "latency_s": round(
                statistics.mean(row["latency_s"] for row in rows), 2
            ),
        }
        judged = [row["judge_mean"] for row in rows if "judge_mean" in row]
        if judged:
            aggregate["judge_mean"] = round(statistics.mean(judged), 3)
        per_persona.append(aggregate)

    metric_keys = (
        "mean_ndcg@3",
        "hit@1_rate",
        "avoid_violation_rate",
        "budget_violation_rate",
        "mean_diversity",
        "mean_latency_s",
    )
    result: dict = {"runs": len(runs), "per_persona": per_persona}
    for key in metric_keys:
        values = [float(run[key]) for run in runs]
        result[key] = round(statistics.mean(values), 3)
        if key in {
            "mean_ndcg@3",
            "hit@1_rate",
            "mean_diversity",
            "mean_latency_s",
        }:
            result[f"{key}_sd_across_runs"] = round(sample_sd(values), 3)
    judged_runs = [float(run["mean_judge"]) for run in runs if "mean_judge" in run]
    if judged_runs:
        result["mean_judge"] = round(statistics.mean(judged_runs), 3)
        result["mean_judge_sd_across_runs"] = round(sample_sd(judged_runs), 3)
        result["judged_personas"] = min(
            int(run.get("judged_personas", 0)) for run in runs
        )
    return result


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mean_x = statistics.mean(xs)
    mean_y = statistics.mean(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    sx = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    sy = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    return cov / (sx * sy) if sx and sy else 0.0


def paired_stats(base: dict, alternatives: list[dict]) -> dict:
    if not alternatives:
        raise ValueError("at least one alternative run is required")
    delta_matrix = [
        [
            run["per_persona"][index]["ndcg@3"] - base_row["ndcg@3"]
            for run in alternatives
        ]
        for index, base_row in enumerate(base["per_persona"])
    ]
    # Each persona remains one statistical unit. Repeated model calls estimate
    # its expected stochastic outcome rather than inflating the sample size.
    deltas = [statistics.mean(run_deltas) for run_deltas in delta_matrix]
    mean_delta = statistics.mean(deltas)
    rng = random.Random(SEED)
    observed = abs(mean_delta)
    permutations = 20000
    extreme = sum(
        1
        for _ in range(permutations)
        if abs(
            statistics.mean(delta * rng.choice((1, -1)) for delta in deltas)
        )
        >= observed - 1e-12
    )
    p_value = (extreme + 1) / (permutations + 1)
    bootstrap = []
    for _ in range(10000):
        sampled_personas = [rng.randrange(len(deltas)) for _ in deltas]
        bootstrap.append(
            statistics.mean(
                rng.choice(delta_matrix[index]) for index in sampled_personas
            )
        )
    bootstrap.sort()
    run_deltas = [
        run["mean_ndcg@3"] - base["mean_ndcg@3"] for run in alternatives
    ]
    delta_sd = sample_sd(deltas)
    return {
        "mean_ndcg_delta": round(mean_delta, 3),
        "median_persona_delta": round(statistics.median(deltas), 3),
        "cohens_dz": round(mean_delta / delta_sd, 3) if delta_sd else None,
        "p_value_sign_flip": round(p_value, 4),
        "ci95_bootstrap": [round(bootstrap[249], 3), round(bootstrap[9749], 3)],
        "ci_method": "hierarchical bootstrap over personas and stochastic runs",
        "wins": sum(1 for d in deltas if d > 1e-9),
        "losses": sum(1 for d in deltas if d < -1e-9),
        "ties": sum(1 for d in deltas if abs(d) <= 1e-9),
        "rerank_runs": len(alternatives),
        "run_mean_delta": round(statistics.mean(run_deltas), 3),
        "run_delta_sd": round(sample_sd(run_deltas), 3),
        "run_delta_min": round(min(run_deltas), 3),
        "run_delta_max": round(max(run_deltas), 3),
        "positive_run_rate": round(
            sum(delta > 0 for delta in run_deltas) / len(run_deltas), 3
        ),
    }


def rank_values(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    index = 0
    while index < len(order):
        end = index + 1
        while end < len(order) and values[order[end]] == values[order[index]]:
            end += 1
        rank = (index + end - 1) / 2 + 1
        for position in order[index:end]:
            ranks[position] = rank
        index = end
    return ranks


def quadratic_weighted_kappa(left: list[int], right: list[int]) -> float:
    categories = 3
    observed = [[0 for _ in range(categories)] for _ in range(categories)]
    for left_value, right_value in zip(left, right, strict=True):
        observed[left_value][right_value] += 1
    left_counts = [sum(row) for row in observed]
    right_counts = [
        sum(observed[row][column] for row in range(categories))
        for column in range(categories)
    ]
    total = len(left)
    observed_disagreement = 0.0
    expected_disagreement = 0.0
    for row in range(categories):
        for column in range(categories):
            weight = ((row - column) / (categories - 1)) ** 2
            observed_disagreement += weight * observed[row][column] / total
            expected_disagreement += (
                weight * left_counts[row] * right_counts[column] / total**2
            )
    if expected_disagreement == 0:
        return 1.0 if observed_disagreement == 0 else 0.0
    return 1 - observed_disagreement / expected_disagreement


def judge_label_agreement(summaries: list[dict]) -> dict | None:
    observations: dict[tuple[str, str], tuple[float, float]] = {}
    duplicate_observations = 0
    inconsistent_duplicates = 0
    for summary in summaries:
        for row in summary["per_persona"]:
            for slug, rating in row.get("judge_ratings", {}).items():
                if slug in row.get("label_gains", {}):
                    key = (row["persona"], slug)
                    observation = (
                        float(rating),
                        float(row["label_gains"][slug]),
                    )
                    if key in observations:
                        duplicate_observations += 1
                        if observations[key] != observation:
                            inconsistent_duplicates += 1
                        continue
                    observations[key] = observation
    ratings = [value[0] for value in observations.values()]
    gains = [value[1] for value in observations.values()]
    if len(ratings) < 10:
        return None
    collapsed_gains = [min(2, round(gain)) for gain in gains]
    integer_ratings = [round(rating) for rating in ratings]
    return {
        "pearson_r": round(pearson(ratings, gains), 3),
        "spearman_rho": round(pearson(rank_values(ratings), rank_values(gains)), 3),
        "quadratic_weighted_kappa": round(
            quadratic_weighted_kappa(integer_ratings, collapsed_gains), 3
        ),
        "unique_persona_item_pairs": len(ratings),
        "duplicate_observations_removed": duplicate_observations,
        "inconsistent_duplicate_ratings": inconsistent_duplicates,
        "label_scale_note": "hand gains 3/2/1/0 collapse to 2/2/1/0 for kappa",
    }


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-qwen", action="store_true")
    parser.add_argument("--judge", action="store_true")
    parser.add_argument(
        "--runs",
        type=int,
        default=1,
        help="independent stochastic rerank runs; use at least 10 for reporting",
    )
    parser.add_argument(
        "--judge-model",
        help="optional independent judge model code (defaults to QWEN_MODEL)",
    )
    parser.add_argument(
        "--personas-file",
        type=Path,
        default=FIXTURES / "personas.json",
        help="frozen labeled persona fixture to evaluate",
    )
    parser.add_argument(
        "--catalog-file",
        type=Path,
        default=FIXTURES / "catalog.json",
        help="catalog fixture used for every variant",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=RESULTS_PATH,
        help="result JSON path",
    )
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.runs > 1 and not args.with_qwen:
        parser.error("--runs greater than 1 requires --with-qwen")

    if not args.personas_file.is_file():
        parser.error(f"persona fixture not found: {args.personas_file}")
    if not args.catalog_file.is_file():
        parser.error(f"catalog fixture not found: {args.catalog_file}")
    if not args.output.parent.is_dir():
        parser.error(f"output directory not found: {args.output.parent}")

    catalog = load_catalog(args.catalog_file)
    by_slug = {candidate.slug: candidate for candidate in catalog}
    personas = json.loads(args.personas_file.read_text())

    client = None
    if args.with_qwen or args.judge:
        if not settings.dashscope_api_key:
            print("DASHSCOPE_API_KEY is not set; running deterministic only.")
        else:
            from openai import OpenAI

            client = OpenAI(
                api_key=settings.dashscope_api_key,
                base_url=settings.qwen_base_url,
                timeout=45,
                max_retries=2,
            )
    judge_client = client if args.judge else None
    judge_model = args.judge_model or settings.qwen_model

    results: dict = {
        "metadata": {
            "created_at": datetime.now(UTC).isoformat(),
            "primary_metric": "mean_ndcg@3",
            "personas_fixture": str(args.personas_file.resolve()),
            "personas_fixture_sha256": file_sha256(args.personas_file),
            "catalog_fixture": str(args.catalog_file.resolve()),
            "catalog_fixture_sha256": file_sha256(args.catalog_file),
            "personas": len(personas),
            "catalog_items": len(catalog),
            "python": platform.python_version(),
            "random_seed": SEED,
            "command": [sys.executable, *sys.argv],
            "rerank_model": settings.qwen_model if args.with_qwen else None,
            "rerank_runs_requested": args.runs if args.with_qwen else 0,
            "rerank_votes": settings.qwen_rerank_votes,
            "rerank_pool": settings.qwen_rerank_pool,
            "rerank_weight": settings.qwen_rerank_weight,
            "rerank_temperature": settings.qwen_rerank_temperature,
            "judge_model": judge_model if args.judge else None,
            "judge_uses_reranker_model": (
                judge_model == settings.qwen_model if args.judge and args.with_qwen else None
            ),
            "scope": (
                "offline ranking over structured profiles and a curated full catalog; "
                "does not evaluate extraction, production retrieval, ingestion, or explanations"
            ),
        },
        "personas": len(personas),
        "deterministic": run_variant(personas, catalog, by_slug, False, None),
    }
    rerank_runs: list[dict] = []
    if args.with_qwen and client is not None:
        for run_number in range(1, args.runs + 1):
            print(f"running stochastic rerank {run_number}/{args.runs}")
            rerank_runs.append(
                run_variant(personas, catalog, by_slug, True, client)
            )

    judged_summaries = [results["deterministic"], *rerank_runs]
    if judge_client is not None:
        attach_judgments(
            judged_summaries,
            personas,
            by_slug,
            judge_client,
            judge_model,
        )

    if rerank_runs:
        results["deterministic+llm_rerank"] = aggregate_runs(rerank_runs)
        results["significance"] = paired_stats(results["deterministic"], rerank_runs)
        if len(rerank_runs) > 1:
            results["rerank_runs"] = rerank_runs
    results["metadata"]["rerank_runs_completed"] = len(rerank_runs)

    agreement = judge_label_agreement(judged_summaries)
    if agreement:
        results["judge_label_agreement"] = agreement

    args.output.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"\nresults written to {args.output} ({len(personas)} personas)\n")

    variant_names = [
        name for name in ("deterministic", "deterministic+llm_rerank")
        if name in results
    ]
    header = (
        f"{'variant':<28}{'nDCG@3':>8}{'hit@1':>8}{'avoid✗':>8}"
        f"{'budget✗':>9}{'divers':>8}{'judge':>7}{'lat(s)':>8}"
    )
    print(header)
    print("-" * len(header))
    for name in variant_names:
        summary = results[name]
        judge_cell = summary.get("mean_judge", "-")
        print(
            f"{name:<28}{summary['mean_ndcg@3']:>8}{summary['hit@1_rate']:>8}"
            f"{summary['avoid_violation_rate']:>8}{summary['budget_violation_rate']:>9}"
            f"{summary['mean_diversity']:>8}{judge_cell:>7}{summary['mean_latency_s']:>8}"
        )
    if "significance" in results:
        sig = results["significance"]
        print(
            f"\npaired nDCG@3 delta: {sig['mean_ndcg_delta']:+.3f} "
            f"(p={sig['p_value_sign_flip']}, 95% CI {sig['ci95_bootstrap']}, "
            f"wins/losses/ties {sig['wins']}/{sig['losses']}/{sig['ties']})"
        )
        if sig["rerank_runs"] > 1:
            print(
                f"stochastic run delta: mean={sig['run_mean_delta']:+.3f}, "
                f"sd={sig['run_delta_sd']:.3f}, range="
                f"[{sig['run_delta_min']:+.3f}, {sig['run_delta_max']:+.3f}], "
                f"positive={sig['positive_run_rate']:.1%}"
            )
    if agreement:
        print(
            f"judge vs hand labels: Pearson r={agreement['pearson_r']}, "
            f"Spearman rho={agreement['spearman_rho']}, "
            f"weighted kappa={agreement['quadratic_weighted_kappa']} over "
            f"{agreement['unique_persona_item_pairs']} unique persona-item pairs"
        )
    print()
    for name in variant_names:
        print(f"== {name} ==")
        for row in results[name]["per_persona"]:
            marker = "•" if row["hit@1"] else "○"
            judge_note = (
                f" judge={row['judge_mean']}" if "judge_mean" in row else ""
            )
            frequency = (
                f" mode={row['top_run_frequency']:.0%}"
                if "top_run_frequency" in row
                else ""
            )
            print(
                f" {marker} {row['persona']:<36} ndcg={row['ndcg@3']:<6}"
                f"{judge_note}{frequency} top={', '.join(row['top'])}"
            )
        print()


if __name__ == "__main__":
    main()
