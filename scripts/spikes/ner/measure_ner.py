#!/usr/bin/env python3
"""
Z0B NER spike — local feasibility measurement for the OPTIONAL recall layer.

Answers the questions plan §15 asks of this spike:
  - installed footprint (MB) against the Vercel Python bundle limit
  - model load time (the cold-import proxy)
  - per-transcript latency at realistic session lengths
  - recall on the SAME fixtures the Node layer is scored on, so Node-only,
    NER-only and Node+NER land in one table

Nothing here is deployed. The deploy-ready function is index.py; this script
only measures.

Usage:
    npx tsx scripts/spikes/ner/measure-node.ts > node-results.json
    ./venv/bin/python scripts/spikes/ner/measure_ner.py node-results.json
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import unicodedata

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURE_DIR = REPO_ROOT / "__tests__" / "lib" / "zoom" / "fixtures"
MODEL = "es_core_news_md"

# Mirrors the Node layer: connectors and two-letter fragments match too much to
# be safe evidence that a detected entity is an attendee.
CONNECTORS = {"de", "del", "la", "las", "los", "y", "da", "do"}


def normalize(value: str) -> str:
    stripped = unicodedata.normalize("NFD", value)
    return "".join(c for c in stripped if unicodedata.category(c) != "Mn").lower()


def attendee_tokens(names: list[str]) -> set[str]:
    tokens: set[str] = set()
    for name in names:
        for part in normalize(name).split():
            if len(part) >= 3 and part not in CONNECTORS:
                tokens.add(part)
    return tokens


def directory_size_mb(path: pathlib.Path) -> float:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total / 1_000_000


def ner_sanitize(
    nlp,
    text: str,
    attendees: list[str],
    *,
    any_label: bool = False,
    shape_filter: bool = False,
    non_person_terms: frozenset[str] = frozenset(),
    max_tokens: int = 4,
) -> str:
    """
    Redacts entities that are not attendees, newest offsets first.

    any_label=False -> PER entities only (the naive reading of "use NER").
    any_label=True  -> entities of ANY label, minus anything the Node layer's
                       non-person lexicon vetoes. This exists because the spike
                       found Spanish NER routinely detects an ambiguous given
                       name but tags it LOC/ORG/MISC.
    shape_filter    -> additionally drop spans that cannot be a name: longer
                       than max_tokens, or containing a verb. Both use
                       information the model already computed, so they are free.
    """
    allow = attendee_tokens(attendees)
    doc = nlp(text)
    numbers: dict[str, int] = {}
    spans = []

    for ent in doc.ents:
        if not any_label and ent.label_ != "PER":
            continue
        tokens = [t for t in normalize(ent.text).split() if t not in CONNECTORS]
        if any(t in allow for t in tokens):
            continue
        if any_label and any(t in non_person_terms for t in tokens):
            continue
        if shape_filter:
            if len(ent) > max_tokens:
                continue
            # "Vamos", "Propongo", "Sugiero" arrive as MISC entities. A span
            # containing a verb is a clause, not a person.
            if any(t.pos_ in ("VERB", "AUX") for t in ent):
                continue
        assigned = next(
            (numbers[t] for t in tokens if t in numbers),
            len({v for v in numbers.values()}) + 1,
        )
        for t in tokens:
            numbers[t] = assigned
        spans.append((ent.start_char, ent.end_char, f"[persona {assigned}]"))

    out = text
    for start, end, token in sorted(spans, key=lambda s: -s[0]):
        out = out[:start] + token + out[end:]
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: measure_ner.py <node-results.json>", file=sys.stderr)
        return 2

    node_results = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    node_verdicts = {
        case["id"]: {m["mention"]: m["caughtByNode"] for m in case["mentions"]}
        for suite in node_results["suites"]
        for case in suite["cases"]
    }

    # ---- footprint -------------------------------------------------------
    site_packages = pathlib.Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    print("## Footprint")
    print(f"python:                    {sys.version.split()[0]}")
    print(f"site-packages:             {directory_size_mb(site_packages):.1f} MB")

    # ---- load time -------------------------------------------------------
    import spacy  # imported here so the timing below excludes nothing

    started = time.perf_counter()
    nlp = spacy.load(MODEL, disable=["lemmatizer", "textcat"])
    load_seconds = time.perf_counter() - started
    model_dir = pathlib.Path(spacy.util.get_package_path(MODEL))
    print(f"spaCy:                     {spacy.__version__}")
    print(f"model:                     {MODEL} ({directory_size_mb(model_dir):.1f} MB on disk)")
    print(f"model load (cold-import proxy): {load_seconds:.2f} s")
    print()

    # ---- latency ---------------------------------------------------------
    precision = json.loads((FIXTURE_DIR / "precision.json").read_text(encoding="utf-8"))
    corpus = "\n\n".join(precision["paragraphs"])
    corpus_words = len(corpus.split())

    print("## Latency (after load; single process, no batching)")
    print("| Input | Words | Wall time | Words/s |")
    print("|---|---|---|---|")
    for label, multiplier in (("fixture corpus", 1), ("~1h session", 15), ("~2h session", 30)):
        text = "\n\n".join([corpus] * multiplier)
        words = corpus_words * multiplier
        started = time.perf_counter()
        nlp(text)
        elapsed = time.perf_counter() - started
        print(f"| {label} | {words:,} | {elapsed:.2f} s | {words/elapsed:,.0f} |")
    print()

    # ---- recall ----------------------------------------------------------
    non_person = frozenset(node_results.get("nonPersonTerms", []))

    # (suite, category, node, ner_per, ner_any) per mention
    max_tokens = int(node_results.get("maxNameTokens", 4))
    rows: list[tuple[str, str, bool, bool, bool, bool]] = []
    for name in ("must-catch.json", "adversarial.json"):
        suite = json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))
        for case in suite["cases"]:
            per_only = ner_sanitize(nlp, case["text"], case["attendees"])
            any_label = ner_sanitize(
                nlp,
                case["text"],
                case["attendees"],
                any_label=True,
                non_person_terms=non_person,
            )
            filtered = ner_sanitize(
                nlp,
                case["text"],
                case["attendees"],
                any_label=True,
                shape_filter=True,
                non_person_terms=non_person,
                max_tokens=max_tokens,
            )
            for mention in case["mustRedact"]:
                rows.append(
                    (
                        suite["suite"],
                        case.get("category", "explicit-reference"),
                        node_verdicts.get(case["id"], {}).get(mention, False),
                        mention not in per_only,
                        mention not in any_label,
                        mention not in filtered,
                    )
                )

    def summarize(label: str, subset: list[tuple[str, str, bool, bool, bool, bool]]) -> None:
        if not subset:
            return
        n = len(subset)
        pct = lambda i: f"{sum(1 for r in subset if r[i])/n:.1%}"
        union = lambda i: f"{sum(1 for r in subset if r[2] or r[i])/n:.1%}"
        print(
            f"| {label} | {n} | {pct(2)} | {pct(3)} | {pct(4)} | {pct(5)} | "
            f"{union(3)} | {union(5)} |"
        )

    print("## Recall — identical fixtures, six configurations")
    print(
        "| Slice | Mentions | Node-only | NER PER | NER any | NER any+shape | "
        "Node+PER | Node+any+shape |"
    )
    print("|---|---|---|---|---|---|---|---|")
    summarize("must-catch (blocking)", [r for r in rows if r[0] == "must-catch"])
    adversarial = [r for r in rows if r[0] == "adversarial"]
    summarize("adversarial (monitoring)", adversarial)
    for category in sorted({r[1] for r in adversarial}):
        summarize(f"  ↳ {category}", [r for r in adversarial if r[1] == category])
    print()

    both_missed = [r for r in adversarial if not r[2] and not r[5]]
    print(
        f"adversarial mentions missed by Node AND any+shape NER: "
        f"{len(both_missed)}/{len(adversarial)}"
    )

    # Precision counter-check: the any-label variant is only worth recommending
    # if it does not start shredding ordinary session speech.
    precision_text = "\n\n".join(precision["paragraphs"])
    for label, kwargs in (
        ("PER-only", {}),
        ("any-label", {"any_label": True, "non_person_terms": non_person}),
        (
            "any-label + shape filter",
            {
                "any_label": True,
                "shape_filter": True,
                "non_person_terms": non_person,
                "max_tokens": max_tokens,
            },
        ),
    ):
        out = ner_sanitize(nlp, precision_text, precision["attendees"], **kwargs)
        print(f"false redactions on name-free corpus ({label}): {out.count('[persona')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
