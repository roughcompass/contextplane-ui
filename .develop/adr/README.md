# Architecture decision records

UI decisions that outlive their PR are recorded here and change only by PR.
Numbered `NNNN-slug.md`, MADR-lite, and continuing the service repository's
numbering rather than restarting it — the two repositories deliver one product,
and two ADR 0004s would be a citation nobody can resolve.

Every ADR carries all six sections:

1. **Context** — the problem and the forces on it.
2. **Decision** — what was decided, concretely.
3. **Assumptions** — what the decision rests on. An ADR recorded without its
   assumptions cannot be revisited when one changes, which is the only reason
   to revisit a decision.
4. **Alternatives rejected** — and why.
5. **Consequences** — including costs accepted.
6. **Dissent** — disagreement is recorded, not resolved away.

`.develop/DESIGN.md` remains the standing UX and visual authority. An ADR here
decides something that standard does not settle, or records why a case is an
exception to it; it never quietly replaces a rule the standard states.
