# 0018 — A server-assigned identifier is chosen from a list, never typed

**Status:** Accepted 2026-08-24

## Context

The judgement this decision answers, in the user's words: *"the UI is not usable.
The UI is simply exposing API endpoints and not taking the user into
consideration."*

The measurement, run independently of the one E22 quotes and reaching the same
conclusion by the same method: a label-text scan of
`apps/admin-dashboard/src/features/**/*.tsx` finds **75 free-text fields whose
label asks for an identifier, across 24 screens**, after discarding two false
positives (`Workspace name`, `Workspace term` — a name and a search term). **22
placeholders name the format out loud** — `UUID`, `Entity UUID`, `UUIDs
separated by commas`, `64-character SHA-256 digest`,
`00000000-0000-0000-0000-000000000000`.

E22's own scan reported 67 across 20. The two differ because the parsers differ
on multi-line and interpolated labels, and neither is exact. **Treat the figure
as a floor and the shape as the finding**: it is dozens of fields across most of
the dashboard, not a handful on the four screens somebody happened to name.

Every one of them asks a human to type a value the human has no way to obtain
from the screen asking for it.

`.develop/DESIGN.md` already forbids this, in one sentence under **Users and
primary jobs**: *"Design the common read path first. Reveal write and governance
controls only where context makes their effect clear."* On `/revisions`,
`/sources` and the ARC authoring sections there is **no read path at all** — the
common path, and the only path, is a write against identifiers the reader cannot
obtain. The standard was not compromised under pressure. It was never applied to
these screens.

The reframe that makes this a category error rather than a papercut: the
dashboard's reader is an **evaluator**, the person who judges whether what the
machines are being served is right. An identifier text box presumes the reader
arrived carrying the answer, when the entire reason they are here is to find out
what the answer is.

## Decision

**A server-assigned identifier is selected from a list, never typed.** The field
is a picker populated from a read.

**Where no list endpoint exists, the field is blocked on building one — not
shipped as text.** This is the half that costs something. A screen that cannot
be built correctly waits for the read it needs; it does not ship a text box and
a placeholder describing the format, because that is how all 75 of these
arrived.

**A picker accepts a pasted identifier and resolves it to a named record.** An
expert who already has the UUID on the clipboard pastes it into the picker's
search field and sees the record it names. This is a requirement of the picker,
not a weakening of the rule — see the dissent, which is where it comes from.

### The exception, stated positively

**A value the operator is *asserting* about material the system has not yet seen
stays free text.** Content digests, external revision locators (`commit:abc123`),
external IDs, and free-prose reasons.

The test that separates the two classes, and it is a question rather than a
list: **would a list of existing values be the right answer, or would offering
one invert the control?**

For a corpus digest, offering a list of digests the system already holds defeats
the field's entire purpose, which is to constrain bytes **not yet fetched**.
`SourceGovernancePanel.tsx:338-343` already makes this argument in product copy,
and it is quoted rather than paraphrased because it is the clearest statement of
it anywhere in the tree:

> The digest **is** the corpus. A regenerated corpus with the same generator
> version has a different digest and needs its own approval — which is what
> keeps "it behaved correctly" meaning one thing across qualifications.

A blanket "no free-text identifiers" rule would break precisely the field whose
free-text-ness is the safety property. **The rule needs an exception clause and
the exception needs a test**, or the next reader deletes it as an oversight.

## Assumptions

1. **A read exists, or can be built, for anything the system assigned an
   identifier to.** The system minted the id; it knows the set. Where the read
   is missing it is missing by omission rather than by impossibility, which is
   why "block on building one" is a reasonable instruction rather than an
   indefinite hold.
2. **The collections are small enough to pick from, or paginated enough to
   search.** A picker over ten thousand claims is a search box with extra
   ceremony; the pickers this rule produces are over collections an evaluator
   navigates by name.
3. **The exception class stays small.** Four kinds of asserted value are named
   here. If it grows past that, the rule is being used to justify the status quo
   rather than to protect a safety property, and this ADR is what should be
   revisited.

## Alternatives rejected

**A blanket no-free-text-identifiers lint with per-site suppressions.**
Rejected, and the reason is a prediction about where the suppressions land:
they accumulate on the safety-relevant fields *first*, because those are the
ones that trip the rule. Within a release the digest fields carry
`// eslint-disable` comments and the rule reads as bureaucracy rather than as a
boundary. The exception has to be part of the rule, not an escape from it.

**Leaving the rule as documentation.** Rejected on this project's own
convention: a boundary without a check is a boundary that drifts. `DESIGN.md`
already said "design the common read path first" and 75 fields shipped anyway.
E22-T4 cuts the check.

**Fixing the four screens the user named and stopping.** Rejected because the
scan found dozens across most of the dashboard. Fixing what somebody noticed
leaves the rest, and the rest is the majority.

**Making every identifier field a picker immediately, including the ~25 with no
read behind them.** Rejected because it would mean building a picker over an
endpoint that does not exist — which in practice means a picker that is empty,
which is worse than a text box because it looks like the collection is empty
rather than like the read is missing.

## Consequences

The 75 fields sort into three dispositions, and the third is the honest one:

| Disposition | Count (approx.) | Ships when |
| --- | --- | --- |
| **Read exists, unused** | ~34 | now — UI-only, no service change |
| **Read must be built** | ~25 | after its service task |
| **Stays free text, deliberately** | ~8 | never |

The counts are approximate and the split is what matters; decomposition assigns
each field individually.

**The first batch is real and is larger than it looks.** The committed contract
publishes five listable ARC admin collections — `source-connectors`,
`source-upload-policies`, `observation-replay-corpora`, `approval-evidence`,
`approval-verifiers` — all seven ARC admin `GET`s are present in the pinned
contract at `c6c81d0`, all are typed in the generated client, and **the
dashboard calls none of them.** Its four ARC adapters make thirteen
`client.request` calls between them and not one is a list.

**One piece of product copy becomes false and has to change with the pickers.**
`SourceGovernancePanel.tsx` currently tells the reader that what they register
"cannot be read back afterwards, so what is registered here is not visible
anywhere else." That was true when it was written and stopped being true when
the reads landed. It is worse than an ordinary stale sentence: it tells a reader
the product cannot do something the product can do, and it will have been read
as a limitation of the system rather than of the screen. E22-T16 owns it.

**E22-T4 is the enforcing check**, and E22-T5 is the first batch.

## Dissent

**A picker is slower than a text box for an expert who already has the
identifier.** The strongest objection, and it is not hypothetical: an operator
debugging an incident has the UUID in their clipboard from a log line, and a
rule that makes them open a dropdown and scroll to find it has made their job
worse in the name of making a novice's job possible. Dashboards that optimise
only for first use become tools nobody reaches for on the tenth.

The objection is accepted and resolved by a requirement rather than by
weakening the rule: **pickers accept a pasted identifier and resolve it to a
named record.** The paste path is preserved and gains something — the reader
sees *which* record they pasted before they act on it, which is the check the
text box never offered. The rule forbids typing an identifier into a field that
cannot tell them what it names; it does not forbid pasting one.

**A second, narrower.** "Block on building the read" is a commitment to a
service change made by a UI decision, and the ~25 blocked fields are held
hostage to another repository's backlog. The counter is that shipping them as
text is what produced the current state, and that the alternative to waiting is
not a better screen but a screen that lies about being usable. The cost — that
those fields stay broken for longer, and visibly so — is accepted.
