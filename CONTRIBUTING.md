# Contributing

This repository follows the shared delivery process, canonical at
`contextplane/docs/07-contributing/03-delivery-process.md` in the
[roughcompass/contextplane](https://github.com/roughcompass/contextplane)
repository. In one line: GitHub Issues/PRs are the only coordination state;
trunk-based with short-lived branches; claim = assign + push branch + draft PR;
push every ~30 minutes regardless of test state; stale claims (8h without a
push) may be taken over from the branch tip; every change merges by PR through
required checks with squash-only merges.

## UI-specific rules

- **Gates (required checks):** `pnpm lint`, `pnpm type-check`, `pnpm test`
  (coverage ≥ 80% per package), `pnpm build`, bundle budgets, and the
  generated-client drift check. Run them from the workspace root.
- **The API client is generated from the pinned contract.** `openapi.json` is
  vendored in this repository as a committed file; `generate:api` reads only
  that file — never a sibling `contextplane` checkout. CI fails if
  regeneration from the pinned contract produces a diff. Contract bumps are
  one PR updating the pin and the regenerated client together, blocked by the
  server PR that shipped the contract.
- **Hotspots (serialized, one PR at a time):** `pnpm-lock.yaml`, the vendored
  `openapi.json` + generated client, any coverage or budget baseline files.
- **Risky paths needing the `needs-human` label:** auth/token handling, the
  API adapter (`shared/api/`), anything touching tenant selection.
- Engineering conventions (feature architecture, React rules, forms, testing,
  `@repo/ui` rules) live in [CLAUDE.md](CLAUDE.md) and are binding. Design
  acceptance lives in [.develop/DESIGN.md](.develop/DESIGN.md).
- Redact tokens, tenant identifiers, and personal data before posting logs to
  issues or PRs; post excerpts, never dumps.
