# Contextplane UI engineering guide

## Scope and authority

- **Domain:** UI for a Context Plane: state graph, LLM context orchestration, and semantic data
  mesh.
- **Stack:** Turborepo, `pnpm`, React 19, strict TypeScript, Vite, Tailwind CSS v4.
- **Layout:** Applications live in `apps/`; shared packages, including `@repo/ui`, live in
  `packages/`.
- **Design:** Read [`.develop/DESIGN.md`](.develop/DESIGN.md) before user-facing work. It governs
  UX, trust presentation, page patterns, visual language, accessibility, and UI acceptance. This
  file governs implementation; the committed OpenAPI contract governs domain data, states,
  permissions, and actions.

## Workspace commands

Run package-manager and Turbo commands from the workspace root only.

- Install: `pnpm install`
- Develop: `pnpm dev` or `pnpm turbo dev`
- Gates: `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm type-check`; `pnpm test` enforces coverage
- Filter: `pnpm --filter admin-dashboard dev`; `pnpm --filter @repo/ui build`
- Target a test: `pnpm --filter admin-dashboard test -- -t "auth"`

## Workspace and package boundaries

- Never run `npm install` or `yarn install` in subfolders or introduce another lockfile.
- Every package owns its `package.json`, TypeScript config, scripts, and all imported dependencies.
  Do not rely on hoisting.
- `apps/*` never import another application's files. Move shared code to `packages/*`.
- Cross-package imports use declared `exports`; never use relative cross-package paths or internal
  deep imports.
- Applications consume the UI kit as `"@repo/ui": "workspace:*"`.
- Shared React libraries declare `react` and `react-dom` as peer dependencies; applications own the
  runtime. Matching development dependencies are allowed for package tooling.

## Feature architecture

Organize application code by product capability:

```text
apps/<app>/src/
  app/                 # bootstrap, providers, router, configuration
  routes/              # route composition and loading boundaries
  features/<feature>/  # components, hooks, api, model, colocated tests, index.ts
  shared/              # app-specific code with no feature owner
```

- Keep each feature's UI, state, data access, schemas, and tests together. Start flat; add
  subfolders only when navigation improves.
- Export a feature's supported API from its root `index.ts`; external code never imports feature
  internals.
- `app/` and `routes/` compose features. Features may depend on `shared/` and workspace packages;
  `shared/` never depends on features.
- Coordinate features at route or app boundaries. Do not create cycles or reach into another
  feature's internals.
- Use business vocabulary. Do not create generic top-level `components/`, `hooks/`, `services/`, or
  `utils/` dumping grounds.
- Keep app reuse in `shared/`, domain-neutral primitives in `packages/ui/`, and proven cross-app
  domain logic in a dedicated package. Share only after current consumers prove reuse.
- Name unit and component tests `<source>.test.ts` or `<source>.test.tsx` and place each beside the
  source file it covers. Do not create `test/`, `tests/`, or `__tests__/` directories under `src/`.
  The root lint gate rejects non-colocated tests and tests without a same-named sibling source.
- Keep only cross-feature integration and browser journeys in dedicated integration or end-to-end
  areas outside package `src/` trees.

## React implementation

- Use pure function components and Hooks. Treat props, state, and context as immutable; never
  request, subscribe, navigate, or update state during render. Use stable domain keys.
- Store minimal source state: interaction state locally, shareable navigation state in the URL,
  remote state in the data layer, and stable cross-tree state in a focused provider or store.
- Model mutually exclusive states with one status or a discriminated union. Use functional updates
  for prior-state transitions and `useReducer` for related event-driven state.
- Prefer composition and props before Context. Keep each Context focused and stable.
- Run user-triggered work in handlers. Effects only synchronize external systems; declare
  dependencies, clean up resources and in-flight work, and never suppress Hook dependency linting.
  Call Hooks only at component or custom-Hook top level.
- New DOM-exposing components accept a typed `ref` prop; retain `forwardRef` only at compatibility
  boundaries. Use `useId` for accessibility relationships, never list keys.
- Add Suspense only for supported data sources, with useful fallback and nearby error handling.
  Adapt mutable external stores with `useSyncExternalStore`.
- Keep Strict Mode enabled. Fix remount and effect defects instead of disabling it.

### Data, security, and performance

- The shared data layer owns requests, caching, deduplication, cancellation, retries, mutation
  effects, and cache updates. Presentational components consume typed loading, error, empty, and
  success states.
- Validate network, persisted, and URL data before it enters feature models. Include every request
  input in query identity; set freshness, retry, and invalidation intentionally.
- Place error boundaries around routes or independent features.
- Treat all Vite-bundled values, including `VITE_*`, as public. Never ship secrets.
- Client authorization shapes the UI only; the server enforces permissions and validates mutations.
- Sanitize untrusted markup before `dangerouslySetInnerHTML`. Telemetry may include route and
  feature context, never tokens, secrets, or personal data.
- Profile before optimizing. Memoize only for measured benefit or identity contracts; split large
  route/feature bundles near their loading boundary.
- Measure production p75 LCP, INP, and CLS; target `<=2.5s`, `<=200ms`, and `<=0.1`. Enforce bundle
  and route budgets in CI; review regressions rather than raising limits automatically.
- Follow the accessibility and rendered-behavior requirements in
  [`.develop/DESIGN.md`](.develop/DESIGN.md). Test user-visible behavior, not implementation
  details; snapshots are not sufficient for interactive behavior.

## Forms

- Use React Hook Form for schema validation, dynamic fields, server errors, or complex submission
  state. Keep simple forms native.
- Own one `useForm` at the feature form boundary. Use `FormProvider` only for deeply nested fields;
  never nest providers for one form.
- Supply complete form-level `defaultValues`; never default a field to `undefined`. Use `reset`
  deliberately when the edited resource changes.
- Prefer `register` for native inputs and standard-ref UI controls. Use `Controller` only for
  non-standard controlled components; never register a controlled field twice.
- Use either a schema resolver or built-in rules for each validation concern. Keep schemas with
  their feature and treat server validation as authoritative.
- Subscribe narrowly with `useWatch`, `useFormState`, or `getFieldState`. Use `useFieldArray` for
  repeated fields, `field.id` as the key, and not `shouldUnregister: true`.
- Submit through `handleSubmit` with one pending-state owner. Dispatch React Actions after client
  validation; do not synchronize two form state machines with an Effect.
- Mark invalid fields with `aria-invalid`, connect messages through `aria-describedby`, and focus
  the first invalid field after submission.

## Contextplane API

- Generate a typed client from the committed OpenAPI document; never hand-write endpoint DTOs.
- Route HTTP through that client and one runtime adapter owning base URL, bearer token, tenant
  selection, error parsing, and correlation metadata.
- Send `Authorization: Bearer <token>` and, for multi-tenant principals, `X-Tenant-ID`.
- Parse failures as `errors: Array<{ path, code, message }>` and branch on `code`, never
  display-text `message`.
- In one adapter, map paths such as `$.name` and `$.attributes.0.value` to React Hook Form names.
  Map pathless errors to `root.server` or feature feedback.
- Use a fresh `Idempotency-Key` per user-initiated create; reuse it only to retry the identical
  request body.
- Preserve detail-response `ETag` values and send `If-Match` for updates/deletes. On `412`, retain
  the draft, refetch, and ask the user to review the newer state.
- Return `next_cursor` unchanged. Never decode, construct, compare, or persist cursors as business
  data.
- Handle `401`, `403`, `412`, `429`, and service unavailability centrally while preserving feature
  recovery.
- Never call protected Prometheus endpoints or parse metrics exposition in the browser.
- Use a same-origin proxy or deployment-gateway CORS. Never use `no-cors` as a workaround.

## Quality gates

- Every change passes formatting, linting, type checking, tests, and production build through root
  commands.
- Every application and package with executable source enforces at least 80% statements, branches,
  functions, and lines through its Vitest coverage configuration. Do not narrow coverage inputs,
  exclude testable source, or lower thresholds to make a gate pass; add meaningful behavior tests.
- Enforce package and feature boundaries with lint or architecture checks, not documentation alone.
- Use unit tests for pure logic, component tests for user behavior, and browser tests for critical
  journeys and package integration. Mock network/browser boundaries, not internal Hooks.
- Keep suppressions narrow and document the concrete reason and removal condition.
- CI runs the same scripts as local development; do not hide validation in workflow-only commands.

## `@repo/ui`

- Use named exports and publish only supported package `exports`; consumers never deep-import
  internals.
- Props use `interface`, extend appropriate native attributes, and include `React.Ref<T>` when
  exposing a DOM node.
- Interactive button primitives explicitly use `type="button"` unless designed to submit.
- Merge foundation and consumer classes with `cn(...)`. Express variants/sizes as clear object
  configuration, not inline ternary strings.
- Keep complete Tailwind classes static and scanner-visible. Each application's main CSS includes
  `@source "../../../packages/ui/src";`.
- Do not use `any`, non-null assertions, or unchecked casts to evade contracts; narrow unknowns at
  boundaries.
- Model mutually exclusive variants with discriminated unions.
- Set `displayName` immediately after compatibility wrappers using `memo` or `forwardRef`.
