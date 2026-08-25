import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Braces,
  ChartColumn,
  ClipboardCheck,
  Download,
  FileClock,
  FileWarning,
  FlaskConical,
  GitBranch,
  KeyRound,
  Library,
  ListChecks,
  MessageSquareText,
  PauseCircle,
  Receipt,
  Settings,
  Gavel,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  UserCog,
  Workflow,
} from "lucide-react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { PageSkeleton } from "@repo/ui/layouts";
import { ToastProvider } from "@repo/ui/primitives";
import {
  AppShell,
  type ColorTheme,
  type NavigationSection,
  type TenantOption,
  type UserSummary,
} from "@repo/ui/shell";

import {
  ContextplaneApiError,
  createContextplaneClient,
  getMemoryClaim,
  getPromotionProposal,
  getWhoAmI,
  getWorkspace,
  listClaimPredicates,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type MemoryClaimPersona,
  type WhoAmI,
} from "../shared/api";
import { createBrowserAccessTokenProvider } from "../shared/auth/runtimeAuth";
import { NotFoundPage } from "../shared/navigation/NotFoundPage";
import { SurfaceProvider } from "../shared/navigation/surface";
import { EntitySearch } from "./EntitySearch";

declare global {
  interface Window {
    contextplane?: {
      getAccessToken?: () => Promise<string | null> | string | null;
      tenantIds?: Readonly<Record<string, string>>;
    };
  }
}

const AnalyticsPage = lazy(async () => {
  const feature = await import("../features/analytics");
  return { default: feature.AnalyticsPage };
});

const ArcPage = lazy(async () => {
  const feature = await import("../features/arc");
  return { default: feature.ArcPage };
});

const AuditPage = lazy(async () => {
  const feature = await import("../features/audit");
  return { default: feature.AuditPage };
});

const CatalogPage = lazy(async () => {
  const feature = await import("../features/catalog");
  return { default: feature.CatalogPage };
});

const GettingStartedDialog = lazy(async () => {
  const feature = await import("../features/getting-started");
  return { default: feature.GettingStartedDialog };
});

const ContextLabPage = lazy(async () => {
  const feature = await import("../features/context-lab");
  return { default: feature.ContextLabPage };
});

const EvaluationPage = lazy(async () => {
  const feature = await import("../features/evaluation");
  return { default: feature.EvaluationPage };
});

const SessionsPage = lazy(async () => {
  const feature = await import("../features/sessions");
  return { default: feature.SessionsPage };
});

const AssertClaimPage = lazy(async () => {
  const feature = await import("../features/memory");
  return { default: feature.AssertClaimPage };
});

const MemoryPage = lazy(async () => {
  const feature = await import("../features/memory");
  return { default: feature.MemoryPage };
});

const OverviewPage = lazy(async () => {
  const feature = await import("../features/overview");
  return { default: feature.OverviewPage };
});

const RelationshipsPage = lazy(async () => {
  const feature = await import("../features/relationships");
  return { default: feature.RelationshipsPage };
});

const SettingsPage = lazy(async () => {
  const feature = await import("../features/settings");
  return { default: feature.SettingsPage };
});

const QuarantinePage = lazy(async () => {
  const feature = await import("../features/quarantine");
  return { default: feature.QuarantinePage };
});

const CurationCockpitPage = lazy(async () => {
  const feature = await import("../features/curation");
  return { default: feature.CurationCockpitPage };
});

const VerifiersPage = lazy(async () => {
  const feature = await import("../features/verifiers");
  return { default: feature.VerifiersPage };
});

const ExceptionsPage = lazy(async () => {
  const feature = await import("../features/exceptions");
  return { default: feature.ExceptionsPage };
});

const SourceGovernancePage = lazy(async () => {
  const feature = await import("../features/sources");
  return { default: feature.SourceGovernancePage };
});

const RevisionLifecyclePage = lazy(async () => {
  const feature = await import("../features/revisions");
  return { default: feature.RevisionLifecyclePage };
});

const ReceiptsPage = lazy(async () => {
  const feature = await import("../features/receipts");
  return { default: feature.ReceiptsPage };
});

const AutonomyPage = lazy(async () => {
  const feature = await import("../features/autonomy");
  return { default: feature.AutonomyPage };
});

const AgentsPage = lazy(async () => {
  const feature = await import("../features/agents");
  return { default: feature.AgentsPage };
});

const ActivityPage = lazy(async () => {
  const feature = await import("../features/activity");
  return { default: feature.ActivityPage };
});

const OwnershipPage = lazy(async () => {
  const feature = await import("../features/ownership");
  return { default: feature.OwnershipPage };
});

const TasksPage = lazy(async () => {
  const feature = await import("../features/tasks");
  return { default: feature.TasksPage };
});

const ProposalsPage = lazy(async () => {
  const feature = await import("../features/proposals");
  return { default: feature.ProposalsPage };
});

const WorkspacesPage = lazy(async () => {
  const feature = await import("../features/workspaces");
  return { default: feature.WorkspacesPage };
});

const tenants: readonly TenantOption[] = [
  { id: "northstar", name: "Northstar Systems" },
  { id: "field-labs", name: "Field Labs" },
];

/**
 * Five surfaces, each a question an evaluator asks, plus Overview ungrouped.
 *
 * The groups are **questions, not object types**, because the reader arrives
 * with a question and not with an object. What replaced them —  Discover / Work
 * with context / Monitor usage / Governance — grouped by what a thing *is*, so
 * a reader tracing where an answer came from had to already know that workspace
 * material is a source and that receipts are not part of "governance".
 *
 * The ordering is the evaluator's own sequence: see what was served, trace where
 * it came from, decide what is contested, check who consumed it, change the
 * rules that produced it.
 *
 * **Two placements are load-bearing rather than tidy.** Notebooks is under
 * Sources because workspace material is literally one of the blocks
 * `/v1/context/resolve` returns — it *is* a source of served context, and filing
 * it under notes would hide that from the reader tracing an answer. Analytics is
 * under Agents because usage volume is a fact about consumers, not a report for
 * its own sake.
 *
 * **The arithmetic is written down because a regrouping that quietly loses a
 * destination is a deletion nobody voted for.** 24 entries: 1 ungrouped + 3 + 6
 * + 4 + 4 + 6, being 23 existing destinations plus one addition.
 *
 * The addition is `Needs review`, promoted out of the `?tab=curation` value that
 * Overview and `AssertClaimPage` already deep-linked to as though it were a
 * destination. It is one now.
 *
 * The plan's table counted 22 existing and gave Judgement two. It was written
 * before `/curation` existed; E5-T6 has since shipped the reviewer cockpit, so
 * there are 23, and the 23rd belongs in Judgement by that surface's own
 * question — *what is contested, and what am I being asked to decide?* Nothing
 * is invented and nothing is dropped.
 */
const navigation: readonly NavigationSection[] = [
  {
    // No `label`: Overview is the landing entry and belongs to none of the five.
    // An empty heading would put an unnamed landmark in the navigation.
    id: "overview",
    items: [{ href: "/", icon: <Activity className="size-4" />, label: "Overview" }],
  },
  {
    id: "served",
    label: "Served",
    items: [
      { href: "/receipts", icon: <Receipt className="size-4" />, label: "Receipts" },
      { href: "/context-lab", icon: <FlaskConical className="size-4" />, label: "Context Lab" },
      { href: "/evaluation", icon: <ClipboardCheck className="size-4" />, label: "Evaluation" },
      { href: "/sessions", icon: <MessageSquareText className="size-4" />, label: "Sessions" },
    ],
  },
  {
    id: "sources",
    label: "Sources",
    items: [
      { href: "/catalog", icon: <Library className="size-4" />, label: "Catalog" },
      { href: "/memory", icon: <Braces className="size-4" />, label: "Claims" },
      { href: "/relationships", icon: <GitBranch className="size-4" />, label: "Relationships" },
      { href: "/notebooks", icon: <Boxes className="size-4" />, label: "Notebooks" },
      { href: "/sources", icon: <Download className="size-4" />, label: "Sources" },
      { href: "/quarantine", icon: <ShieldAlert className="size-4" />, label: "Withheld" },
    ],
  },
  {
    id: "judgement",
    label: "Judgement",
    items: [
      { href: "/memory/review", icon: <Scale className="size-4" />, label: "Needs review" },
      { href: "/curation", icon: <Gavel className="size-4" />, label: "Curation review" },
      { href: "/memory/promotions", icon: <Workflow className="size-4" />, label: "Promotions" },
      { href: "/exceptions", icon: <FileWarning className="size-4" />, label: "Exceptions" },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    items: [
      { href: "/agents", icon: <Bot className="size-4" />, label: "Agents" },
      { href: "/autonomy", icon: <PauseCircle className="size-4" />, label: "Envelopes" },
      { href: "/tasks", icon: <ListChecks className="size-4" />, label: "Tasks" },
      { href: "/activity", icon: <Bell className="size-4" />, label: "Activity" },
      { href: "/analytics", icon: <ChartColumn className="size-4" />, label: "Analytics" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/arc", icon: <ShieldCheck className="size-4" />, label: "Policies" },
      { href: "/revisions", icon: <Stamp className="size-4" />, label: "Revisions" },
      { href: "/verifiers", icon: <KeyRound className="size-4" />, label: "Approvers" },
      { href: "/ownership", icon: <UserCog className="size-4" />, label: "Ownership & profiles" },
      { href: "/audit", icon: <FileClock className="size-4" />, label: "Audit log" },
      { href: "/settings", icon: <Settings className="size-4" />, label: "Settings" },
    ],
  },
];

type AppRoute =
  | "activity"
  | "agents"
  | "analytics"
  | "arc"
  | "assert-claim"
  | "audit"
  | "autonomy"
  | "catalog"
  | "context-lab"
  | "evaluation"
  | "exceptions"
  | "memory"
  | "memory-review"
  | "not-found"
  | "overview"
  | "ownership"
  | "proposals"
  | "receipts"
  | "curation"
  | "quarantine"
  | "relationships"
  | "revisions"
  | "sessions"
  | "sources"
  | "settings"
  | "tasks"
  | "verifiers"
  | "workspaces";

/**
 * The five surfaces, and the empty string for Overview which is in none.
 *
 * This replaces `UserRole`, which every route carried and nothing read. E22-T6
 * removed the one consumer — the header that relabelled the reader on every
 * navigation — and left the field on 22 entries, so the type survived as a
 * per-page persona nobody was being shown. The slot is now the surface, which is
 * a fact about where the reader is rather than a claim about who they are.
 */
type Surface = "" | "Served" | "Sources" | "Judgement" | "Agents" | "Governance";

interface RouteDefinition {
  /** The nav href this route marks current. Several routes may share one. */
  readonly href: string;
  /** Preloads the route's chunk, so a click does not wait on the network twice. */
  readonly load: () => Promise<unknown>;
  /** Whether the shell resolves `whoami` before the page renders. */
  readonly usesIdentity: boolean;
  /**
   * The surface this route sits in, rendered as the page's eyebrow.
   *
   * Here rather than in each page because it is a fact about the grouping and
   * not about the page: 21 distinct eyebrow strings across three vocabularies —
   * "Govern", "Observed context", "Scoped working memory", "Agent readiness" —
   * described what a page was *about*, which the page's own title already says.
   * What a reader cannot get from the title is which of five surfaces they are
   * standing in, and a regrouping is when that becomes answerable.
   */
  readonly surface: Surface;
}

/**
 * Every route's facts in one place.
 *
 * These used to be five parallel lists — a union, a pathname matcher, a chunk
 * loader, an identity predicate, and two nested ternary chains — each edited by
 * hand when a destination was added. Nothing made them agree, so a route could
 * load its chunk and still highlight nothing in the navigation, and only a
 * person reading all five would notice. Adding a destination is now one entry.
 */
const routeDefinitions: Readonly<Record<AppRoute, RouteDefinition>> = {
  activity: {
    href: "/activity",
    load: () => import("../features/activity"),
    surface: "Agents",
    usesIdentity: true,
  },
  agents: {
    href: "/agents",
    load: () => import("../features/agents"),
    surface: "Agents",
    usesIdentity: true,
  },
  autonomy: {
    href: "/autonomy",
    load: () => import("../features/autonomy"),
    surface: "Agents",
    usesIdentity: true,
  },
  analytics: {
    href: "/analytics",
    load: () => import("../features/analytics"),
    surface: "Agents",
    usesIdentity: false,
  },
  arc: {
    href: "/arc",
    load: () => import("../features/arc"),
    surface: "Governance",
    usesIdentity: true,
  },
  "assert-claim": {
    href: "/memory",
    load: () => import("../features/memory"),
    surface: "Sources",
    usesIdentity: true,
  },
  audit: {
    href: "/audit",
    load: () => import("../features/audit"),
    surface: "Governance",
    usesIdentity: false,
  },
  catalog: {
    href: "/catalog",
    load: () => import("../features/catalog"),
    surface: "Sources",
    usesIdentity: true,
  },
  "context-lab": {
    href: "/context-lab",
    load: () => import("../features/context-lab"),
    surface: "Served",
    usesIdentity: true,
  },
  evaluation: {
    href: "/evaluation",
    load: () => import("../features/evaluation"),
    surface: "Served",
    // No identity read: the page shows this tenant's sets, runs and verdicts,
    // and who the reader is changes what the *service* returns rather than what
    // the screen asks for. A page that took an identity it did not consult would
    // be a dependency nobody could remove later.
    usesIdentity: false,
  },
  exceptions: {
    href: "/exceptions",
    load: () => import("../features/exceptions"),
    surface: "Judgement",
    usesIdentity: true,
  },
  memory: {
    href: "/memory",
    load: () => import("../features/memory"),
    surface: "Sources",
    usesIdentity: true,
  },
  /**
   * The same page as `memory`, and deliberately a second entry.
   *
   * `routeDefinitions` maps one route to one surface, and `/memory/review` is
   * listed under **Judgement** while `/memory` is under **Sources**. Resolving
   * both to `memory` made the promoted destination report the wrong surface and
   * mark the wrong nav item current — the one failure the surface slot exists to
   * prevent, on the one destination E22-T10 created (E23-T6).
   *
   * The component is identical; `memoryModel` reads the area from the address.
   * What differs is where the reader is standing, which is what these two
   * fields are for.
   */
  "memory-review": {
    href: "/memory/review",
    load: () => import("../features/memory"),
    surface: "Judgement",
    usesIdentity: true,
  },
  "not-found": {
    // No nav item is current: the address matched none of them, and marking one
    // anyway would claim the reader is somewhere they are not.
    href: "",
    load: () => Promise.resolve(),
    surface: "",
    usesIdentity: false,
  },
  overview: {
    href: "/",
    load: () => import("../features/overview"),
    surface: "",
    usesIdentity: true,
  },
  ownership: {
    href: "/ownership",
    load: () => import("../features/ownership"),
    surface: "Governance",
    usesIdentity: true,
  },
  proposals: {
    href: "/memory/promotions",
    load: () => import("../features/proposals"),
    surface: "Judgement",
    usesIdentity: true,
  },
  curation: {
    href: "/curation",
    load: () => import("../features/curation"),
    surface: "Judgement",
    usesIdentity: true,
  },
  quarantine: {
    href: "/quarantine",
    load: () => import("../features/quarantine"),
    surface: "Sources",
    usesIdentity: true,
  },
  receipts: {
    href: "/receipts",
    load: () => import("../features/receipts"),
    surface: "Served",
    usesIdentity: true,
  },
  relationships: {
    href: "/relationships",
    load: () => import("../features/relationships"),
    surface: "Sources",
    usesIdentity: true,
  },
  revisions: {
    href: "/revisions",
    load: () => import("../features/revisions"),
    surface: "Governance",
    usesIdentity: true,
  },
  sessions: {
    href: "/sessions",
    load: () => import("../features/sessions"),
    surface: "Served",
    usesIdentity: true,
  },
  settings: {
    href: "/settings",
    load: () => import("../features/settings"),
    surface: "Governance",
    usesIdentity: true,
  },
  sources: {
    href: "/sources",
    load: () => import("../features/sources"),
    surface: "Sources",
    usesIdentity: true,
  },
  tasks: {
    href: "/tasks",
    load: () => import("../features/tasks"),
    surface: "Agents",
    usesIdentity: true,
  },
  verifiers: {
    href: "/verifiers",
    load: () => import("../features/verifiers"),
    surface: "Governance",
    usesIdentity: true,
  },
  workspaces: {
    href: "/notebooks",
    load: () => import("../features/workspaces"),
    surface: "Sources",
    usesIdentity: true,
  },
};

/**
 * Addresses that moved, and the address each now names.
 *
 * **Redirects rather than fall-throughs.** An address somebody bookmarked, put
 * in a runbook or pasted into a ticket keeps working, and the reader lands where
 * they meant to rather than on a not-found page that is technically correct and
 * useless. Consulted before the matcher below so a moved address can never be
 * matched by a rule that outlived it.
 *
 * The service repo's operator docs were grepped for all four before any of them
 * moved, which is what E21 asked for. None appears there: every `/proposals`,
 * `/workspaces` and `/memory/...` hit in `docs/` is a `/v1/` API path, and the
 * dashboard's own addresses are referenced only from the dashboard.
 */
const MOVED_ADDRESSES: Readonly<Record<string, string>> = {
  "/memory/assert": "/memory/claims/new",
  "/proposals": "/memory/promotions",
  "/workspaces": "/notebooks",
};

/**
 * Where a moved address should send the reader, or `null`.
 *
 * `?tab=curation` is handled here rather than in the table because it is the one
 * move keyed on a query parameter rather than a path — the curation queue was
 * reachable only as a *value*, which is why Overview and `AssertClaimPage` both
 * deep-linked to it as though it were a destination. It is one now.
 *
 * Prefixes are carried: `/proposals/abc` becomes `/memory/promotions/abc`, so a
 * link to one proposal survives the move rather than landing on the list.
 */
function movedAddress(pathname: string, search: string): string | null {
  if (pathname === "/memory" && new URLSearchParams(search).get("tab") === "curation") {
    const parameters = new URLSearchParams(search);
    parameters.delete("tab");
    const rest = parameters.toString();
    return rest === "" ? "/memory/review" : `/memory/review?${rest}`;
  }
  for (const [from, to] of Object.entries(MOVED_ADDRESSES)) {
    if (pathname === from) return to;
    if (pathname.startsWith(`${from}/`)) return `${to}${pathname.slice(from.length)}`;
  }
  return null;
}

/**
 * Which route an address names, or `not-found`.
 *
 * Ordered: `/memory/claims/new` is a destination of its own and has to be tested
 * before `/memory/`'s prefix claims it. The fall-through used to be the
 * catalog, so a mistyped or stale URL rendered a real page and said nothing —
 * a copied URL is supposed to reconstruct the same view, and silently
 * reconstructing a different one is worse than reporting nothing.
 */
function routeForPathname(pathname: string): AppRoute {
  if (pathname === "/") return "overview";
  if (pathname === "/activity") return "activity";
  if (pathname === "/agents") return "agents";
  if (pathname === "/autonomy") return "autonomy";
  if (pathname === "/analytics") return "analytics";
  if (pathname === "/arc") return "arc";
  if (pathname === "/audit") return "audit";
  if (pathname === "/catalog") return "catalog";
  if (pathname === "/context-lab") return "context-lab";
  if (pathname === "/evaluation") return "evaluation";
  if (pathname === "/memory/claims/new") return "assert-claim";
  if (pathname === "/curation") return "curation";
  // Before `/memory/`'s prefix, which would otherwise claim it. Two addresses
  // now live under `/memory/` and belong to different routes, so the prefix rule
  // comes last among them — the same ordering hazard this function's docstring
  // names for `/memory/claims/new`, and one that reappears whenever a surface
  // gains a second address under one parent.
  if (pathname === "/memory/promotions" || pathname.startsWith("/memory/promotions/")) {
    return "proposals";
  }
  // `/memory/review` is the curation queue as an address of its own, and its own
  // route: the page is the same, the surface is not. Ordered before the general
  // `/memory/` catch, which is the hazard this function's docstring already
  // names and which reappears every time a second address moves under one
  // parent.
  if (pathname === "/memory/review") return "memory-review";
  if (pathname === "/memory" || pathname.startsWith("/memory/")) return "memory";
  if (pathname === "/ownership") return "ownership";
  if (pathname === "/quarantine") return "quarantine";
  if (pathname === "/receipts") return "receipts";
  if (pathname === "/relationships") return "relationships";
  if (pathname === "/revisions") return "revisions";
  if (pathname === "/sessions" || pathname.startsWith("/sessions/")) return "sessions";
  if (pathname === "/settings") return "settings";
  if (pathname === "/sources") return "sources";
  if (pathname === "/tasks") return "tasks";
  if (pathname === "/exceptions") return "exceptions";
  if (pathname === "/verifiers") return "verifiers";
  if (pathname === "/notebooks" || pathname.startsWith("/notebooks/")) return "workspaces";
  return "not-found";
}

function loadRouteModule(route: AppRoute): Promise<unknown> {
  return routeDefinitions[route].load();
}

function routeUsesIdentity(route: AppRoute): boolean {
  return routeDefinitions[route].usesIdentity;
}

function apiRequestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function queryTenantKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function memoryPersonaForUrl(url: URL): MemoryClaimPersona {
  const persona = url.searchParams.get("persona");
  if (
    persona === "l1_responder" ||
    persona === "l3_engineer" ||
    persona === "architect" ||
    persona === "agent"
  ) {
    return persona;
  }
  return "agent";
}

function sessionIdForPathname(pathname: string): string | null {
  if (!pathname.startsWith("/sessions/")) return null;
  const encoded = pathname.slice("/sessions/".length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function memoryClaimIdForPathname(pathname: string): string | null {
  if (!pathname.startsWith("/memory/claims/")) return null;
  const encoded = pathname.slice("/memory/claims/".length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function proposalIdForPathname(pathname: string): string | null {
  if (!pathname.startsWith("/memory/promotions/")) return null;
  const encoded = pathname.slice("/memory/promotions/".length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function workspaceIdForPathname(pathname: string): string | null {
  if (!pathname.startsWith("/notebooks/")) return null;
  const encoded = pathname.slice("/notebooks/".length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function prepareRouteNavigation({
  apiTenantId,
  client,
  queryClient,
  url,
}: {
  apiTenantId: string | undefined;
  client: ContextplaneClient;
  queryClient: QueryClient;
  url: URL;
}): Promise<void> {
  const route = routeForPathname(url.pathname);
  const context = apiRequestContext(apiTenantId);
  const tenantKey = queryTenantKey(apiTenantId);
  const preparations: Promise<unknown>[] = [loadRouteModule(route)];

  if (routeUsesIdentity(route)) {
    preparations.push(
      queryClient.prefetchQuery({
        queryFn: ({ signal }) => getWhoAmI(client, context, signal),
        queryKey: ["contextplane", tenantKey, "identity"],
        staleTime: 5 * 60 * 1000,
      }),
    );
  }

  if (route === "assert-claim") {
    preparations.push(
      queryClient.prefetchQuery({
        queryFn: ({ signal }) => listClaimPredicates(client, context, signal),
        queryKey: ["contextplane", tenantKey, "claim-predicates"],
        staleTime: 5 * 60 * 1000,
      }),
    );
  }

  const proposalId = proposalIdForPathname(url.pathname);
  if (proposalId) {
    preparations.push(
      queryClient.prefetchQuery({
        queryFn: ({ signal }) => getPromotionProposal(client, proposalId, context, signal),
        queryKey: ["contextplane", tenantKey, "promotion-proposal", proposalId],
      }),
    );
  }

  const workspaceId = workspaceIdForPathname(url.pathname);
  if (workspaceId) {
    preparations.push(
      queryClient.prefetchQuery({
        queryFn: ({ signal }) => getWorkspace(client, workspaceId, context, signal),
        queryKey: ["contextplane", tenantKey, "workspace", workspaceId],
      }),
    );
  }

  const claimId = memoryClaimIdForPathname(url.pathname);
  if (claimId) {
    const persona = memoryPersonaForUrl(url);
    preparations.push(
      queryClient.prefetchQuery({
        queryFn: ({ signal }) => getMemoryClaim(client, claimId, persona, context, signal),
        queryKey: ["contextplane", tenantKey, "memory", "claim", claimId, persona],
      }),
    );
  }

  await Promise.allSettled(preparations);
}

function destinationFromTarget(target: EventTarget | null): URL | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a");
  if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) {
    return null;
  }
  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin || !/^https?:$/.test(destination.protocol)) {
    return null;
  }
  return destination;
}

function initialTheme(): ColorTheme {
  const stored = window.localStorage.getItem("contextplane-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Who the shell says is reading, from `whoami` rather than from a literal.
 *
 * The header rendered `Morgan Morris` and initials `MM` for every reader, on
 * every deployment, while the shell was already resolving `whoami` two lines
 * away. The service answered the question, the shell asked it, and the answer
 * was discarded.
 *
 * Three states, kept apart because they mean different things to somebody
 * looking at the chrome to work out whose session they are in:
 *
 * - resolved, with a display name — show it;
 * - resolved, no display name — show the actor id, truncated. An identity that
 *   exists and is unnamed is not the same as no identity, and a placeholder
 *   name would be the defect this replaces, one deployment later;
 * - unresolved — say so. `Signing in…` is honest while the query is in flight
 *   and after it fails; inventing a reader is what produced `Morgan Morris`.
 *
 * No `role`. Under the one-operator decision the chrome has no role to display,
 * and the previous value was `routeDefinitions[route].role` — the current
 * page's notional persona, relabelling the reader on every navigation. That is
 * the defect, not a placeholder for a better value.
 */
function readerSummary(identity: WhoAmI | undefined): UserSummary {
  if (!identity) return { initials: "—", name: "Signing in…" };
  const name = identity.actor_display_name?.trim();
  if (name) return { initials: initialsOf(name), name };
  return { initials: "—", name: `Actor ${identity.actor_id.slice(0, 8)}` };
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/u).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((part) => part?.[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * The providers, and nothing else.
 *
 * Split out when the header started reading `whoami`: a `useQuery` in this
 * component's body runs *outside* the `QueryClientProvider` this component
 * renders, so the shell's own data has to live one level down. Keeping the
 * split explicit is better than the alternative shape — passing the resolved
 * identity down as a prop from a parent that cannot subscribe to it.
 */
export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry(failureCount, error) {
              if (
                error instanceof ContextplaneApiError &&
                [400, 401, 403, 404, 422].includes(error.status)
              ) {
                return false;
              }
              return failureCount < 1;
            },
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppShellRoot />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function AppShellRoot() {
  const [activeTenantId, setActiveTenantId] = useState("northstar");
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);
  // Initialised through the redirect table, and the address bar is corrected in
  // the same breath. A reader who opened a bookmarked `/proposals` sees
  // `/memory/promotions` — landing on the right page while the URL still says
  // the old one would leave them copying an address that is about to stop
  // working, and would make the next reload a second redirect.
  const [pathname, setPathname] = useState(() => {
    const moved = movedAddress(window.location.pathname, window.location.search);
    if (moved === null) return window.location.pathname;
    window.history.replaceState(window.history.state, "", moved);
    return new URL(moved, window.location.origin).pathname;
  });
  const [routeNavigationPending, setRouteNavigationPending] = useState(false);
  const [tenantChangePending, setTenantChangePending] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>(initialTheme);
  const [accessTokenProvider] = useState(() =>
    createBrowserAccessTokenProvider({
      getHostAccessToken: () => window.contextplane?.getAccessToken,
      hostname: window.location.hostname,
      isDevelopment: import.meta.env.MODE === "development",
    }),
  );
  const [apiClient] = useState(() =>
    createContextplaneClient({
      getAccessToken: () => accessTokenProvider.getAccessToken(),
      onUnauthorized: () => accessTokenProvider.invalidate(),
    }),
  );
  // The client lives in `App`, above the provider. See its docstring.
  const queryClient = useQueryClient();
  const focusMainOnRouteChange = useRef(false);
  const gettingStartedButtonRef = useRef<HTMLButtonElement>(null);
  const gettingStartedFocusFrame = useRef<number | null>(null);
  const intentPreloads = useRef(new Set<string>());
  const navigationRequest = useRef(0);
  const routeProgressTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tenantChangeRequest = useRef(0);
  const tenantProgressTimer = useRef<number | null>(null);
  const route = routeForPathname(pathname);
  const activeTenantName =
    tenants.find((tenant) => tenant.id === activeTenantId)?.name ?? "Unknown tenant";
  const activeApiTenantId = window.contextplane?.tenantIds?.[activeTenantId];

  const scheduleNavigation = useCallback(
    (requested: URL) => {
      // Redirected here rather than at each call site. Three reach this — a link
      // click, a back button, and the initial load — and a rewrite applied at
      // two of them is the one a moved address slips through.
      const moved = movedAddress(requested.pathname, requested.search);
      const destination = moved === null ? requested : new URL(moved, requested.origin);
      if (moved !== null) window.history.replaceState(window.history.state, "", destination);

      const request = navigationRequest.current + 1;
      navigationRequest.current = request;
      if (routeProgressTimer.current !== null) window.clearTimeout(routeProgressTimer.current);
      routeProgressTimer.current = window.setTimeout(() => {
        setRouteNavigationPending(true);
        routeProgressTimer.current = null;
      }, 150);
      void prepareRouteNavigation({
        apiTenantId: activeApiTenantId,
        client: apiClient,
        queryClient,
        url: destination,
      }).then(() => {
        if (navigationRequest.current !== request) return;
        if (routeProgressTimer.current !== null) {
          window.clearTimeout(routeProgressTimer.current);
          routeProgressTimer.current = null;
        }
        focusMainOnRouteChange.current = true;
        startTransition(() => {
          setPathname(destination.pathname);
          setRouteNavigationPending(false);
        });
      });
    },
    [activeApiTenantId, apiClient, queryClient],
  );

  const scheduleTenantChange = useCallback(
    (tenantId: string) => {
      const nextApiTenantId = window.contextplane?.tenantIds?.[tenantId];
      if (!routeUsesIdentity(route)) {
        startTransition(() => setActiveTenantId(tenantId));
        return;
      }

      const request = tenantChangeRequest.current + 1;
      tenantChangeRequest.current = request;
      if (tenantProgressTimer.current !== null) window.clearTimeout(tenantProgressTimer.current);
      tenantProgressTimer.current = window.setTimeout(() => {
        setTenantChangePending(true);
        tenantProgressTimer.current = null;
      }, 150);
      const context = apiRequestContext(nextApiTenantId);
      void queryClient
        .prefetchQuery({
          queryFn: ({ signal }) => getWhoAmI(apiClient, context, signal),
          queryKey: ["contextplane", queryTenantKey(nextApiTenantId), "identity"],
          staleTime: 5 * 60 * 1000,
        })
        .then(() => {
          if (tenantChangeRequest.current !== request) return;
          if (tenantProgressTimer.current !== null) {
            window.clearTimeout(tenantProgressTimer.current);
            tenantProgressTimer.current = null;
          }
          startTransition(() => {
            setActiveTenantId(tenantId);
            setTenantChangePending(false);
          });
        });
    },
    [apiClient, queryClient, route],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("contextplane-theme", theme);
  }, [theme]);

  useEffect(
    () => () => {
      if (gettingStartedFocusFrame.current !== null) {
        window.cancelAnimationFrame(gettingStartedFocusFrame.current);
      }
      if (routeProgressTimer.current !== null) window.clearTimeout(routeProgressTimer.current);
      if (tenantProgressTimer.current !== null) window.clearTimeout(tenantProgressTimer.current);
    },
    [],
  );

  useEffect(() => {
    let focusFrame: number | null = null;

    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const search = searchRef.current;
        const hiddenFilters = search?.closest<HTMLElement>("[data-table-filters='true'][hidden]");
        const collapsedFilters = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[aria-expanded="false"][aria-controls]'),
        ).find((button) => {
          const controlledId = button.getAttribute("aria-controls");
          return controlledId
            ? document.getElementById(controlledId)?.dataset.tableFilters === "true"
            : false;
        });

        if (hiddenFilters || collapsedFilters) {
          const disclosure = hiddenFilters
            ? document.querySelector<HTMLButtonElement>(`[aria-controls="${hiddenFilters.id}"]`)
            : collapsedFilters;
          disclosure?.click();
          if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
          focusFrame = window.requestAnimationFrame(() => {
            searchRef.current?.focus();
            focusFrame = null;
          });
        } else {
          search?.focus();
        }
      }
    }

    window.addEventListener("keydown", focusSearch);
    return () => {
      window.removeEventListener("keydown", focusSearch);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  useEffect(() => {
    function restoreLocation() {
      scheduleNavigation(new URL(window.location.href));
    }

    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [scheduleNavigation]);

  useEffect(() => {
    if (!focusMainOnRouteChange.current) return;
    focusMainOnRouteChange.current = false;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  function navigateWithoutReload(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) {
      return;
    }

    const destination = destinationFromTarget(event.target);
    if (!destination) return;

    const sameDocumentHash =
      destination.pathname === window.location.pathname &&
      destination.search === window.location.search &&
      destination.hash;
    if (sameDocumentHash) return;

    event.preventDefault();
    if (destination.href === window.location.href) return;

    window.history.pushState(window.history.state, "", destination);
    scheduleNavigation(destination);
  }

  function preloadNavigation(event: FocusEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    const destination = destinationFromTarget(event.target);
    if (!destination || destination.href === window.location.href) return;
    const intentKey = `${queryTenantKey(activeApiTenantId)}:${destination.href}`;
    if (intentPreloads.current.has(intentKey)) return;
    intentPreloads.current.add(intentKey);
    void prepareRouteNavigation({
      apiTenantId: activeApiTenantId,
      client: apiClient,
      queryClient,
      url: destination,
    });
  }

  function closeGettingStarted() {
    setGettingStartedOpen(false);
    if (gettingStartedFocusFrame.current !== null) {
      window.cancelAnimationFrame(gettingStartedFocusFrame.current);
    }
    gettingStartedFocusFrame.current = window.requestAnimationFrame(() => {
      gettingStartedButtonRef.current?.focus();
      gettingStartedFocusFrame.current = null;
    });
  }

  const activeHref = routeDefinitions[route].href;
  const navigationPending = routeNavigationPending || tenantChangePending;
  // The same query key the two prefetches above populate, so the header shows
  // what the shell has already resolved rather than issuing a third request.
  const identity = useQuery({
    enabled: routeUsesIdentity(route),
    queryFn: ({ signal }) => getWhoAmI(apiClient, apiRequestContext(activeApiTenantId), signal),
    queryKey: ["contextplane", queryTenantKey(activeApiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });
  const skeletonControls = route === "audit" ? 5 : 2;

  return (
    <AppShell
      activeHref={activeHref}
      activeTenantId={activeTenantId}
      gettingStartedButtonRef={gettingStartedButtonRef}
      navigation={navigation}
      navigationFooter={
        <div className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck aria-hidden="true" className="size-4 text-success" />
          <span>Service contract current</span>
        </div>
      }
      onClick={navigateWithoutReload}
      onFocusCapture={preloadNavigation}
      onOpenGettingStarted={() => setGettingStartedOpen(true)}
      onPointerOver={preloadNavigation}
      onTenantChange={scheduleTenantChange}
      onThemeToggle={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      search={
        <EntitySearch
          {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
          client={apiClient}
          onResolved={(entityId) => {
            const destination = new URL(window.location.href);
            destination.pathname = "/catalog";
            destination.search = `?capability=${encodeURIComponent(entityId)}&panel=overview`;
            window.history.pushState(window.history.state, "", destination);
            scheduleNavigation(destination);
          }}
        />
      }
      tenants={tenants}
      theme={theme}
      user={readerSummary(identity.data)}
    >
      {navigationPending ? (
        <div
          aria-label="Loading destination"
          className="fixed top-16 right-0 left-0 z-40 h-0.5 overflow-hidden bg-accent-subtle lg:left-64"
          role="status"
        >
          <div className="h-full w-full bg-accent motion-safe:animate-pulse" />
        </div>
      ) : null}
      <SurfaceProvider surface={routeDefinitions[route].surface}>
        <Suspense fallback={<PageSkeleton controls={skeletonControls} />}>
          {route === "overview" ? (
            <OverviewPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "audit" ? (
            <AuditPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          ) : route === "arc" ? (
            <ArcPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          ) : route === "analytics" ? (
            <AnalyticsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          ) : route === "context-lab" ? (
            <ContextLabPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          ) : route === "evaluation" ? (
            <EvaluationPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "sessions" ? (
            <SessionsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
              selectedSessionId={sessionIdForPathname(pathname)}
            />
          ) : route === "curation" ? (
            <CurationCockpitPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "quarantine" ? (
            <QuarantinePage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "verifiers" ? (
            <VerifiersPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "exceptions" ? (
            <ExceptionsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "sources" ? (
            <SourceGovernancePage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "revisions" ? (
            <RevisionLifecyclePage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "receipts" ? (
            <ReceiptsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "agents" ? (
            <AgentsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "autonomy" ? (
            <AutonomyPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "activity" ? (
            <ActivityPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "ownership" ? (
            <OwnershipPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "tasks" ? (
            <TasksPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "not-found" ? (
            <NotFoundPage activeTenantName={activeTenantName} pathname={pathname} />
          ) : route === "assert-claim" ? (
            <AssertClaimPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "memory" || route === "memory-review" ? (
            <MemoryPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
              selectedClaimId={memoryClaimIdForPathname(pathname)}
            />
          ) : route === "proposals" ? (
            <ProposalsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
              selectedProposalId={proposalIdForPathname(pathname)}
            />
          ) : route === "relationships" ? (
            <RelationshipsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          ) : route === "settings" ? (
            <SettingsPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
            />
          ) : route === "workspaces" ? (
            <WorkspacesPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
              selectedWorkspaceId={workspaceIdForPathname(pathname)}
            />
          ) : (
            <CatalogPage
              {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
              activeTenantName={activeTenantName}
              client={apiClient}
              searchRef={searchRef}
            />
          )}
        </Suspense>
      </SurfaceProvider>
      {gettingStartedOpen ? (
        <Suspense fallback={null}>
          <GettingStartedDialog activeTenantName={activeTenantName} onClose={closeGettingStarted} />
        </Suspense>
      ) : null}
    </AppShell>
  );
}
