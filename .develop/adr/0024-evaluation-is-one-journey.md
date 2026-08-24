# 0024 — Evaluation is one journey, and memory quality is a report

## Context

E24 gives the dashboard its first real evaluation surface: a prompt set, a run over it, a simulated
agent response, and five graded criteria. That raises a question the design standard does not settle
— whether _what is being graded_ becomes a second axis of primary navigation. Concretely: does an
evaluator choose between "evaluate the agent" and "evaluate memory" before they begin?

The question is not idle, and the case for splitting is real rather than strawman. Mid-2026 research
is explicit that memory quality inferred from end-task success is confounded.
[MemDelta](https://arxiv.org/pdf/2606.29914) names three confounds: agent architecture (a strong
model compensates for weak memory), task bias (some tasks do not exercise memory at all), and
retrieval strategy (which moves performance independently of what was stored). Its recommendation is
controlled baselines in which memory is measured in isolation _before_ task-level evaluation. Memory
is now a first-class evaluation category with its own benchmark suite — LongMemEval-V2, AMA-Bench,
StreamMemBench, LoCoMo, BEAM.

Three facts about this product bear on how that finding applies here.

**The design standard already draws an axis, and it is the one the tooling industry uses.**
`.develop/DESIGN.md` separates **offline evaluation of curated examples** from **online observation
of live activity**, and requires that they "must not share an unlabeled scorecard". LangSmith,
Langfuse and Arize Phoenix — the three products that standard cites as its research basis — all
organise the same way: `dataset → run → compare against a named baseline`, with evaluator type as a
_field on the result_, not a fork in the product. LangSmith does separate retrieval quality from
generation quality, but as two metrics inside one experiment over one dataset.

**The five criteria E24 defines already partition along the seam.** Required-fact recall and
precision fail when memory did not serve the right material. Groundedness and answer relevance fail
when the agent mishandled what it was given. Boundary violations fail governance. The attribution
the split was going to buy is already present _inside a single result_.

**The service plans to receipt the two halves separately.** E24 keeps resolution and generation as
separately addressable records precisely so that "the retrieval was fine and the agent fumbled it"
stays an answerable question — attribution as a property of the record rather than of the
navigation. That property is the subject of a service ADR not yet written: E24-T1 cuts it as **ADR
0022 — the resolver does not generate, and simulation is a separate receipted operation**, pending
and unclaimed at the time this was decided. This ADR depends on that property holding, not on the
number; if E24-T1 lands under a different number, the reference below follows it.

Set against that: the controlled measurement MemDelta asks for **exists and has no reader**.
`contextplane/context/evaluation/treatments.py` holds the canonical, governance, claim and resume
paths identical and varies only the workspace arm — a controlled baseline in the sense the paper
means — and E8's harness measures recall@10, extraction precision and recall per predicate,
retrieval precision joined through receipts, and multi-session recall. All of it terminates in
`eval/EVAL.md` and a CI target. No endpoint serves it and no screen renders it.

## Decision

**One evaluation journey.** An evaluator runs a prompt set and reads a graded result. There is no
prior choice between evaluating the agent and evaluating memory, and no second set of prompt sets,
runs, verdicts or comparison screens.

**Memory-versus-agent is an attribution axis inside a result, not a destination.** The score pane
groups its five criteria by what a failure implicates — memory, the agent, or governance — and the
improvement surface routes from a criterion to the surface that fixes it. Grouping is presentation
over the existing criteria; it mints no new score and no new vocabulary.

**Aggregate memory quality is a report, not a journey.** The trend over the system — E8's
measurements and the `treatments.py` ablation — is offline, deterministic, versioned, and about the
system rather than about any run a user started. It is reached from the evaluation journey when a
memory-implicating criterion fails, and it is legible on its own. It is not a second journey because
nobody initiates it and it grades no submission.

**The deterministic criteria stay reachable with no judge in the loop.** Recall, precision and
boundary violations are computed without a model. A deployment with no provider configured, or an
evaluator who wants the auditable signal only, gets those three. This is what keeps the controlled
measurement independent of the judged pipeline, and it is the operative half of MemDelta's
recommendation.

## Assumptions

1. **The five criteria stay partitioned as stated.** If a later rubric version adds a criterion that
   implicates memory and the agent jointly, the grouping stops being a clean attribution and this
   decision needs revisiting rather than quiet extension.
2. **The deterministic scorer remains runnable with no provider configured** — the property E24-T1
   is to record as ADR 0022's first assumption, pending at the time of writing. If scoring ever
   requires a judge, the independent control disappears and memory quality becomes visible only
   through a judged pipeline.
3. **E8's measurements gain a reader.** This is the load-bearing one and it is not yet true. Until
   an endpoint serves them and a surface renders them, the only memory signal an evaluator can see
   is the one that arrives through an LLM-judged agent run — which is precisely the confound
   MemDelta names. This decision is sound _given_ the report; without it, the dissent below wins.
4. **Judge calibration lands before judged verdicts are presented as settled** — an unfitted judge
   renders as unproven. This is the third part of the decision E24-T2 is to record as **ADR 0023 — a
   judge is never the candidate, and its confidence is uncalibrated until fitted**, also pending and
   unclaimed. A confident memory verdict produced by an uncalibrated instrument is worse than no
   verdict.

None of 0022 or 0023 exists on `main` at the time this ADR is written, and both are cited above by
the property they establish rather than as settled precedent. If either is renumbered or decided
differently, this ADR is revisited rather than quietly left pointing at a citation that no longer
resolves.

## Alternatives rejected

- **Two primary journeys — "agent eval" and "memory eval".** Its merit is MemDelta's, recorded
  intact: the confound is real, and a product that only ever grades memory through task outcome
  cannot separate storage quality from architecture. It lost for two reasons. First, it forces the
  evaluator to diagnose before they can — to name the failing component at the door, which is
  exactly what E24-T13 refuses to do on the user's instruction that there is not one path to improve
  a failing run. Second, it duplicates prompt sets, runs, verdicts and comparison across two spines,
  and E21 already recorded what happens when consecutive stages of one job land in different groups.
  The confound is answered by the controlled report and the judge-free deterministic path, both of
  which this decision keeps, rather than by a navigation split.
- **A blended memory-health score.** Rejected on the same grounds E24 rejects a blended run score
  and `.develop/DESIGN.md` rejects a composite: five criteria produce five answers, and one index
  hides which arrow broke.
- **Folding memory quality into E11's receipts explorer.** E11 answers what was served to whom under
  suppression floors. That is a privacy-shaped question over live activity; memory quality is an
  offline measurement over curated fixtures. Merging them would put two evidence classes on one
  scorecard, which the design standard forbids in as many words.
- **Leaving memory quality in CI.** The status quo. Rejected because it makes the product claim
  unfalsifiable from the outside: the numbers exist, and the person whose job is evaluating whether
  the system is trustworthy cannot see them.

## Consequences

- E24-T10 through T13 build one spine. The score pane groups by implication; the improvement surface
  links out; neither introduces a second evaluation entry point.
- The memory-quality report is **not E24's** and is not built inside the score pane. It belongs to
  E8, which owns the measurements, and it needs a service task before a dashboard task — `make eval`
  writes to a markdown file, so there is no endpoint to read. That ordering is stated so the UI task
  is not cut against an endpoint nobody built.
- E8's epic body does not currently name "these measurements have no reader" among its remainders,
  so the body is amended before the tasks are cut, per this plan's rule that a task whose premise
  the body does not carry is how E19 shipped six tasks on false premises. Cutting a UI task also
  makes E8 span both repositories.
- This is the third instance of one shape in this codebase: E9's `requires_validated` with no
  caller, E17's `resolve_weights` with no production caller, and now E8's measurements with no
  reader. The plan already wrote after the second that twice is enough to make it a thing to check
  for.
- Accepted cost: an evaluator who wants only the memory trend passes through the evaluation surface
  to reach it. That is a real extra step, taken deliberately, because the alternative charges every
  evaluator a classification decision at the door to save one reader a click.

## Dissent

**That attribution inside a result is not the same as an independent measurement, and this decision
risks being read as though it were.** MemDelta's finding is about confounds in the _measurement_,
not about where a link sits: grouping criteria by implication still grades memory through a pipeline
in which the agent, the retrieval configuration and the judge all vary. A reader who sees "recall
failed" grouped under _memory_ may take it as an isolated memory measurement when it is not one.

This is not resolved away. It is answered by three commitments that are checkable rather than
asserted: the deterministic criteria are computed with no model in the loop; the aggregate report is
an ablation with the non-workspace arms held identical, which is a controlled baseline in MemDelta's
sense; and assumption 3 records that if the report never ships, this dissent is correct and the
decision should be reopened rather than defended. The grouping is a routing aid. The measurement is
the report, and the report is the thing that must exist.
