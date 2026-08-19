# Contextplane UI

Browser client for the [Contextplane](https://github.com/roughcompass/contextplane) service — a
context plane covering the state graph, LLM context orchestration, and the semantic data mesh.

This is a Turborepo workspace. One application ships today, `admin-dashboard`, backed by a shared
design-system package.

## Layout

```text
apps/admin-dashboard/     # the operator and tenant-administrator dashboard
packages/ui/              # @repo/ui — domain-neutral primitives, layouts, shell, brand
.develop/DESIGN.md        # design language, trust presentation, accessibility, UI acceptance
CLAUDE.md                 # engineering guide: architecture, React rules, quality gates
```

The dashboard is organised by product capability rather than by technical layer. Each feature under
`apps/admin-dashboard/src/features/` owns its components, hooks, data access, schemas, and colocated
tests, and exports its supported surface from a root `index.ts`. Current features cover the catalog,
relationships, memory governance, ARC trust operations, audit, analytics, workspaces, sessions,
proposals, tenant work, service tools, settings, and administration.

## Requirements

- Node.js 20 or newer
- pnpm 11.21.0 (pinned via `packageManager`; run `corepack enable` to pick it up automatically)
- A reachable Contextplane service for anything beyond unit tests

## Getting started

```bash
pnpm install
cp apps/admin-dashboard/.env.example apps/admin-dashboard/.env
pnpm dev
```

`.env` configures the local development session only. Those names deliberately omit the `VITE_`
prefix so the dev client secret stays server-side and never reaches the browser bundle. Treat every
`VITE_*` value as public — it is compiled into the shipped bundle.

## Commands

Run these from the workspace root; Turbo fans them out across packages.

| Command                             | Purpose                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                          | Start development servers                                           |
| `pnpm build`                        | Production build (type-checks first)                                |
| `pnpm test`                         | Vitest with coverage thresholds enforced                            |
| `pnpm type-check`                   | `tsc --noEmit` across the workspace                                 |
| `pnpm lint`                         | Test-colocation check, then ESLint at zero warnings                 |
| `pnpm format` / `pnpm format:write` | Prettier check / write                                              |
| `pnpm generate:api`                 | Regenerate the typed API client from the service's OpenAPI document |

Target one package with `--filter`, for example `pnpm --filter admin-dashboard dev` or
`pnpm --filter @repo/ui build`.

## The API contract

`apps/admin-dashboard/src/shared/api/generated/contextplane.ts` is generated, not written. It comes
from the committed `openapi.json` in the service repository, which this workspace expects as a
sibling checkout:

```text
<parent>/contextplane/openapi.json
<parent>/contextplane-ui/
```

After the service contract changes, regenerate and let the type checker find the call sites:

```bash
pnpm generate:api && pnpm type-check
```

Never hand-edit the generated file, and never hand-write endpoint DTOs beside it. Everything else in
`shared/api/` — the runtime adapter that owns base URL, bearer token, tenant selection, error
parsing, and correlation metadata — is written by hand on top of the generated types.

## Conventions

`CLAUDE.md` is the authority on implementation: workspace and package boundaries, feature
architecture, React and forms rules, API client conventions, and the quality gates.
`.develop/DESIGN.md` governs anything user-facing. Read the one that matches what you are changing.

Two rules catch most mistakes early. Tests live beside the source they cover — the root lint gate
rejects a test without a same-named sibling — and applications never import another application's
files, so shared code moves into `packages/`.
