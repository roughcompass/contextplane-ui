# Contextplane product design standard

This document is the UX and visual-design authority for Contextplane interfaces. It defines what the
product must communicate; `CLAUDE.md` defines how the React workspace implements it. The service
contract remains authoritative for domain semantics, data, permissions, and available actions.

## Product experience contract

Contextplane helps people discover, understand, evaluate, and govern organizational context without
mistaking an observation for organizational truth.

Every screen must optimize for these outcomes:

- **Orient quickly:** Make the tenant, product area, object type, object, and current state apparent
  without relying on browser history.
- **Explain the record:** Answer what it is, who owns it, where it came from, when it changed, how
  trustworthy it is, and what depends on it.
- **Preserve truth boundaries:** Keep canonical catalog records, observed claims, and workspace
  material visually and semantically distinct.
- **Support decisions:** Place evidence, caveats, impact, and permitted actions together. Do not
  make users reconstruct a decision from separate pages.
- **Make writes safe:** Preview consequential changes, prevent duplicates, expose conflicts, and
  leave a durable receipt.
- **Be dense, not crowded:** Prefer scan-friendly tables and compact metadata with progressive
  disclosure over dashboards made of decorative cards.
- **Degrade honestly:** Distinguish loading, no data, no match, unavailable, forbidden, stale,
  partial, and failed states. Never render one as another.

A user at a decision point should be able to answer: **What do I know? Why should I believe it? What
changed? What is affected? What can I do next?**

## Users and primary jobs

Server permissions, not role names in the UI, determine access. These personas guide prioritization;
they do not replace authorization checks.

| Persona       | Primary jobs                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Consumer      | Find a capability or interface, assess fitness and evidence, understand dependencies, and request missing context. |
| Producer      | Maintain owned records, review observations, respond to requests, and propose canonical changes.                   |
| Administrator | Govern tenants, access, lifecycle, and promotion workflows without obscuring ordinary catalog work.                |
| Auditor       | Trace claims, citations, decisions, promotions, actors, and timestamps without mutating the record.                |

Design the common read path first. Reveal write and governance controls only where context makes
their effect clear.

## Truth and evidence model

### Three information layers

| Layer                  | Meaning                                                                            | Required presentation                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical catalog**  | Approved capabilities, interfaces, components, versions, and relationships.        | Stable identity, lifecycle, visibility, owner, version, and last change. Use the product's neutral default treatment.            |
| **Observed context**   | Living Memory claims inferred or collected from sources; untrusted until reviewed. | Label as an observation or claim. Keep source, citations, observed time, confidence, and review state adjacent to the statement. |
| **Workspace material** | Mutable notes, decisions, and saved queries scoped to a person or team.            | Show workspace, owner, visibility, edit state, and last edit. Never imply that workspace text is canonical.                      |

Never merge these layers into an undifferentiated feed. A high confidence value does not make a
claim canonical. A workspace decision does not alter the catalog until the service records the
corresponding governed transition.

### Promotion and review

Any transition toward canonical state must show:

1. the current canonical value;
2. the proposed value and a field-level diff;
3. supporting and conflicting evidence;
4. affected versions, relationships, and dependents;
5. proposer, reviewer state, and timestamps; and
6. the exact action and whether it can be reversed.

After a decision, preserve the proposal, evidence, actor, outcome, and resulting canonical version
as one traceable chain.

### AI and automated evidence

- Mark generated or inferred content at the smallest meaningful scope: field, claim, row, or
  section—not the whole page when only one value is generated.
- Expose the source type, source identity, observation time, method or evaluator, and explanation
  when the API supplies them.
- Keep citations attached to the claim they support. A citation count without an inspectable source
  is not evidence.
- Present model confidence as reported uncertainty, with its scale and method. Do not translate it
  into invented labels or acceptance thresholds.
- Never anthropomorphize automation or present an evaluator score as a final decision.

## Information architecture

Organize navigation by user intent, not by endpoint or database table:

- **Overview:** Assigned attention, recent governed changes, and resumable work. Avoid vanity
  metrics and totals without an actionable interpretation.
- **Catalog:** Capabilities, interfaces, components, versions, and relationships.
- **Memory:** Claims, citations, observations, and review queues.
- **Workspaces:** Scoped notes, decisions, and saved queries.
- **Governance:** Requests, proposals, promotions, and lifecycle work.
- **Audit:** Immutable activity and decision history.
- **Administration:** Tenant-level configuration and access, only when the service exposes those
  operations.

Sections may nest when needed, but do not create placeholder destinations. Keep the primary
navigation stable across roles; omit unauthorized destinations rather than reordering the remaining
ones.

The application shell must provide:

- an explicit tenant context and safe tenant switching;
- global search over authorized records;
- persistent primary navigation with one current location;
- breadcrumbs for hierarchy, not as duplicate primary navigation; and
- account, help, and environment context in consistent locations.

Search, filters, sort, pagination, selected tab, comparison set, graph focus, and other shareable
view state belong in the URL. A copied URL should reconstruct the same view, subject to
authorization and data changes.

## Page archetypes

### Browse and queue pages

Use a table when records share comparable fields; use a structured list when they do not. Cards are
for small summaries or navigation, not the default catalog view.

A browse page contains, in order:

1. page title, one-sentence purpose, and at most one primary page action;
2. search, filters, saved views when useful, sort, and result count;
3. active-filter summary with a clear reset path;
4. the data region; and
5. cursor navigation and freshness or partial-result context.

Put the identifying link first. Include only decision-bearing columns, commonly owner, kind,
version, lifecycle, visibility, trust or review state, and update time. Put row actions last; expose
one frequent action and place the rest in an overflow menu. Make bulk selection state the selected
count and whether the scope is the current page or all matching results.

Default sorting must support the page's primary job—for example, highest attention or most recently
changed—not whichever field is easiest to implement. Preserve filter and sort state when a user
opens a record and returns.

### Entity detail pages

The header establishes identity before actions:

- breadcrumb and entity kind;
- canonical name and stable identifier;
- concise description;
- lifecycle, visibility, version, owner, and freshness;
- primary action plus a restrained overflow menu.

The body prioritizes overview, relationships, versions, evidence, usage or adoption, and activity
according to the entity type. Use a description list for metadata and a table for comparable
records. Tabs are reserved for distinct, substantial tasks; they must be URL-addressable and must
not hide a critical caveat or status.

On wide screens, a secondary pane may hold persistent decision context such as owner, trust, and
impact. On narrow screens, place that context before actions that depend on it.

### Compare and impact pages

Show current, proposed, and optional baseline values side by side. Emphasize changed fields, but
keep unchanged context available. Include upstream and downstream impact, version constraints,
unresolved references, partial-results warnings, and the query scope. Pair every graph with a
searchable textual list or table.

### Review and decision pages

Keep the item, rubric or policy, evidence, conflicts, history, and decision controls in one
workflow. Show queue progress without turning review speed into the quality signal. For pairwise
review, keep both options symmetrical and randomize ordering when the backend supports bias control.
Require the service-defined rationale and confirmation; do not invent client-only governance gates.

### Forms and editors

Use one primary column, group fields by user intent, and place advanced or uncommon fields behind
explicit disclosure. Explain immutable and inherited values. Preserve entered data after validation
or transient service failures. Put errors beside fields and provide a form-level summary that links
to each invalid control.

For edits to versioned or governed records, show the base version and unsaved state. On a
concurrency conflict, keep the user's draft, fetch the current record, and offer a reviewable
comparison; never silently overwrite or blindly retry.

### Activity and audit pages

Use a chronological, filterable log with actor, action, target, outcome, absolute time, and
correlation information when available. Expand an entry for before-and-after data or linked
evidence. Do not replace an audit trail with transient notifications.

### Graphs

Graphs support relationship exploration; they never replace discovery or impact lists. Start from a
focused root with visible direction, relationship type, depth, version, and time scope. Expand
progressively, disclose hidden-node counts, provide a legend, and keep node names searchable.
Selection must open an accessible detail view and have a keyboard-operable equivalent. Do not make
dragging or spatial memory necessary to complete a task.

## Evaluation and observability

Separate **offline evaluation** of curated examples from **online observation** of live activity.
They have different evidence and must not share an unlabeled scorecard.

An evaluation result must expose, when available:

- target, dataset or production scope, and version;
- evaluator type: deterministic, human, or model-based;
- rubric or criterion and its version;
- score or verdict plus explanation;
- run status, failures, coverage or sample count, and timestamp; and
- links to the underlying example, trace, claim, or citation.

Favor side-by-side comparison against a named baseline over isolated scores. Show both aggregate
movement and the examples that changed. Do not hide failed evaluations from an average, compare
incompatible scales, or imply statistical meaning the service does not provide.

Dashboards summarize and route attention; they are not the source of truth. Every number needs a
label, unit, time window, source, and reset or retention semantics. Never derive an operational rate
from one observation or render unavailable data as zero.

## Interaction and action safety

- Use links for navigation and buttons for commands. Labels use a specific verb and noun: “Review
  Proposal,” not “Continue” or “Submit.”
- Provide one primary action per scope. Visual prominence follows consequence and frequency, not
  stakeholder preference.
- Hide actions whose existence is sensitive. Otherwise, a visible disabled action must explain what
  condition or permission is missing.
- Keep low-risk, reversible edits direct. Use confirmation only for destructive, expensive,
  externally visible, or governance-changing operations.
- A confirmation names the target and consequence. High-impact changes include a diff or
  affected-count summary; typing a name is reserved for irreversible loss.
- While a mutation is pending, prevent duplicate submission without blocking unrelated reading. Do
  not optimistically finalize governance or destructive actions.
- Report writes persistently near their result or in activity history. Include the effect, target,
  actor, and time; do not rely on a disappearing toast as the only receipt.
- Announce asynchronous results and errors without moving focus unnecessarily. Move focus into
  dialogs and restore it when they close.
- Support undo when the domain and API make reversal truthful. Never offer a cosmetic undo that
  cannot restore server state.

## Status, trust, and time semantics

Do not use one badge system for unrelated concepts.

| Signal         | Meaning                                               | Presentation rule                                                                |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Lifecycle      | Where a record is in its domain lifecycle.            | Stable label and optional icon; use semantic color only when action is required. |
| Workflow state | Where a request, review, or proposal is in a process. | Use the service vocabulary and show the next valid action.                       |
| Severity       | Urgency or impact.                                    | Reserve warning and danger colors for actual risk, not ordinary status.          |
| Confidence     | Reported uncertainty in an observation or evaluation. | Show value, scale, method, and explanation; never use color alone.               |
| Freshness      | When evidence or state was observed or changed.       | Show an absolute timestamp, with relative age as supporting text.                |
| Completeness   | Coverage, sample size, or partial traversal.          | State the scope and what is missing.                                             |
| Visibility     | Who may discover or use the record.                   | Keep near identity and action controls.                                          |
| Provenance     | Human, imported, observed, or generated origin.       | Keep inspectable at the value or claim it qualifies.                             |

Unknown, not measured, not applicable, not authorized, and zero are different values. Use their
exact meaning; never substitute an em dash without an accessible explanation.

## Visual language

The interface should feel calm, precise, and operational—not promotional.

- Build from semantic design tokens. Support light, dark, increased contrast, and reduced motion
  from the beginning.
- Use a neutral canvas and surfaces, one restrained brand accent, and semantic colors only for
  states. Color never carries meaning alone.
- Establish hierarchy with typography and spacing before borders, background fills, or elevation.
  Keep labels readable; secondary does not mean tiny or low contrast.
- Use a consistent spacing scale. Align page titles, controls, tables, and detail content to the
  same grid.
- Prefer borders or tonal changes for contained surfaces. Reserve shadows for elements that
  physically overlay content. Avoid stacked cards, excessive rounding, gradients, glass effects, and
  decorative glow.
- Use moderate radii for controls and surfaces; reserve pills for tags, statuses, and compact
  filters.
- Give data tables the available width. Use compact density for simple, repetitive data and standard
  density for rich rows. Right-align comparable numbers and use tabular figures.
- Use monospace only for identifiers, code, hashes, and machine values. Long IDs get a copy action
  and a human-readable label where one exists.
- Icons supplement labels. Icon-only actions require a conventional symbol, accessible name, and
  tooltip.
- Motion communicates continuity or progress, lasts only as long as needed, and stops under
  `prefers-reduced-motion`. Never animate live data merely to attract attention.

Charts must have a single analytical purpose, labeled axes, unit, time window, source, and a text or
table alternative. Avoid 3D effects, truncated axes that distort change, and palettes that cannot be
read in grayscale.

## Responsive behavior

Desktop is the primary environment, not the only supported one.

- At narrow widths, collapse navigation into a full-height overlay and keep tenant and
  current-location context visible.
- Reflow details to one column and place prerequisite context before dependent actions.
- Prioritize table columns; allow a contained horizontal scroll when comparison would be damaged by
  stacking. Never force the whole page to scroll in two dimensions.
- Convert side panes and complex dialogs to full-screen surfaces when space requires.
- Keep primary actions reachable without covering content or keyboard focus.
- Meet WCAG reflow at 320 CSS pixels and 200% zoom. Use at least the WCAG 24 CSS-pixel target
  minimum and prefer 44 pixels for primary touch actions.

## Loading, empty, error, and freshness states

Design these states with the successful view; do not add them after implementation.

- **Loading:** Preserve layout. Use a shape-matched skeleton when the shape is known and a labeled
  progress treatment when it is not. Keep stale data visible when safe and mark it as refreshing.
- **No data yet:** Explain what will appear and give the permitted next step.
- **No results:** Echo the search or filters and offer to clear or adjust them.
- **Unavailable or partial:** State which source or scope is missing and how that limits
  interpretation.
- **Forbidden:** Explain the required access only when disclosure is safe; provide a route back.
- **Failure:** Describe what failed in plain language, preserve useful context, offer a targeted
  retry, and include support correlation data without exposing secrets.
- **Success:** Show the resulting state or durable receipt, then offer the logical next task.

An empty state replaces the missing data region. Do not leave an inert toolbar, pagination, or blank
chart around it.

## Accessibility and inclusive use

WCAG 2.2 AA is the release baseline, not the full definition of usable.

- Use semantic landmarks, headings, tables, lists, forms, links, and buttons before adding ARIA.
- Provide a skip link, logical focus order, visible unobscured focus, and keyboard operation for
  every workflow.
- Associate every control with a persistent label, help, and error text. Placeholder text is never
  the label.
- Announce changed result counts, loading completion, validation, and write outcomes with
  appropriate live regions.
- Pair color with text, icon, or pattern. Verify text, non-text, focus, and chart contrast in every
  theme.
- Make graphs, charts, drag interactions, hover content, and visual diffs available in an equivalent
  non-visual and non-drag form.
- Keep zoom, text spacing, reduced motion, screen magnification, and high-contrast mode functional.
  Do not disable browser zoom.
- Test critical journeys with keyboard and a screen reader in addition to automated accessibility
  checks.

## Content design

- Use concise, plain language and the service's domain vocabulary consistently: capability,
  interface, component, claim, citation, proposal, promotion, and workspace.
- Use title case for page titles. Use sentence case for section headings, labels, table headers, and
  actions unless a proper noun requires otherwise.
- Keep page overlines compact and restrained: uppercase, semibold, and `0.04em` letter spacing.
- Set page descriptions one step above standard body copy, with a compact `1.5` line height and
  muted color so they remain readable without competing with the title.
- Lead with the outcome or problem. Explain impact and the next action; do not blame the user or
  apologize generically.
- Use specific action labels and nouns. Avoid “OK,” “Yes,” “No,” “Submit,” “Manage,” and “Learn
  more” when a precise label exists.
- Show absolute date, time, and timezone for audit and governance records. Relative time may
  supplement it.
- Expand uncommon abbreviations on first use. Keep API codes and correlation IDs as supporting
  diagnostic detail, not the primary error message.
- Do not call inferred content “knowledge,” “truth,” “verified,” or “safe” unless the corresponding
  service state supports that claim.

## Definition of done for UI work

A screen is not complete until review confirms:

- tenant, location, object identity, source layer, and current state are clear;
- trust, provenance, freshness, visibility, and partial-data caveats appear where they affect a
  decision;
- the primary job has a direct path and the page has no competing primary actions;
- search, filter, sort, tabs, comparison, and graph focus survive reload and sharing;
- permitted, forbidden, pending, conflict, success, and destructive paths are coherent;
- loading, no-data, no-results, unavailable, partial, stale, and failure states are intentionally
  distinct;
- tables, graphs, charts, forms, and dialogs work by keyboard and with a screen reader;
- the layout works at narrow, medium, and wide widths, at 200% zoom, and in every theme;
- rendered geometry, overflow, contrast, focus, and layering have been checked in a real browser—not
  inferred from markup or class names; and
- behavioral, accessibility, and critical browser tests cover the user-visible effect.

## Research basis

This standard synthesizes recurring patterns rather than copying one product:

- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/),
  [Port Context Lake](https://docs.port.io/context-lake/overview/), and
  [Datadog Catalog](https://docs.datadoghq.com/internal_developer_portal/catalog/): centralized
  discovery, ownership, entity-centered navigation, saved views, relationships, governance, and
  operational context.
- [DataHub lineage](https://docs.datahub.com/docs/features/feature-guides/lineage) and
  [OpenMetadata lineage](https://docs.open-metadata.org/latest/how-to-guides/data-lineage): focused
  relationship exploration, progressive expansion, time scope, and impact analysis.
- [LangSmith evaluation](https://docs.langchain.com/langsmith/evaluation-concepts),
  [Langfuse evaluation](https://langfuse.com/docs/evaluation/overview), and
  [Arize Phoenix evaluation](https://arize.com/docs/phoenix/evaluation/llm-evals): offline versus
  online evaluation, datasets, traces, explanation, human review, and side-by-side comparison.
- [GitHub Primer](https://primer.style/product/components/data-table/),
  [PatternFly](https://www.patternfly.org/components/table/design-guidelines), and
  [Carbon](https://carbondesignsystem.com/components/data-table/usage/): mature admin layout, table,
  action, density, loading, empty-state, and AI-provenance conventions.
- [Nielsen's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) and
  [WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/): status visibility, user control, error
  prevention and recovery, consistency, recognition, and accessible interaction.
