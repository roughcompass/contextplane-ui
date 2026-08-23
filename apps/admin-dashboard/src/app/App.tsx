import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Braces,
  ChartColumn,
  Download,
  FileClock,
  FileWarning,
  FlaskConical,
  GitBranch,
  KeyRound,
  Library,
  ListChecks,
  MessageSquareText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  UserCog,
  Workflow,
} from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
} from "../shared/api";
import { createBrowserAccessTokenProvider } from "../shared/auth/runtimeAuth";
import { NotFoundPage } from "../shared/navigation/NotFoundPage";
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

const navigation: readonly NavigationSection[] = [
  {
    id: "discover",
    label: "Discover",
    items: [
      { href: "/", icon: <Activity className="size-4" />, label: "Overview" },
      { href: "/catalog", icon: <Library className="size-4" />, label: "Catalog" },
      { href: "/relationships", icon: <GitBranch className="size-4" />, label: "Relationships" },
      { href: "/memory", icon: <Braces className="size-4" />, label: "Living memory" },
    ],
  },
  {
    id: "work-with-context",
    label: "Work with context",
    items: [
      {
        href: "/context-lab",
        icon: <FlaskConical className="size-4" />,
        label: "Context Lab",
      },
      { href: "/tasks", icon: <ListChecks className="size-4" />, label: "Tasks" },
      { href: "/workspaces", icon: <Boxes className="size-4" />, label: "Workspaces" },
    ],
  },
  {
    id: "monitor-usage",
    label: "Monitor usage",
    items: [
      { href: "/activity", icon: <Bell className="size-4" />, label: "Activity" },
      { href: "/agents", icon: <Bot className="size-4" />, label: "Agents" },
      {
        href: "/sessions",
        icon: <MessageSquareText className="size-4" />,
        label: "Sessions",
      },
      { href: "/analytics", icon: <ChartColumn className="size-4" />, label: "Analytics" },
    ],
  },
  {
    id: "governance",
    label: "Governance",
    items: [
      { href: "/arc", icon: <ShieldCheck className="size-4" />, label: "Governed policies" },
      { href: "/proposals", icon: <Workflow className="size-4" />, label: "Proposals" },
      { href: "/ownership", icon: <UserCog className="size-4" />, label: "Ownership & profiles" },
      { href: "/quarantine", icon: <ShieldAlert className="size-4" />, label: "Quarantine" },
      { href: "/verifiers", icon: <KeyRound className="size-4" />, label: "Approval verifiers" },
      { href: "/exceptions", icon: <FileWarning className="size-4" />, label: "Exceptions" },
      { href: "/sources", icon: <Download className="size-4" />, label: "Source governance" },
      { href: "/revisions", icon: <Stamp className="size-4" />, label: "Revision lifecycle" },
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
  | "catalog"
  | "context-lab"
  | "exceptions"
  | "memory"
  | "not-found"
  | "overview"
  | "ownership"
  | "proposals"
  | "quarantine"
  | "relationships"
  | "revisions"
  | "sessions"
  | "sources"
  | "settings"
  | "tasks"
  | "verifiers"
  | "workspaces";

type UserRole = "Administrator" | "Auditor" | "Producer";

interface RouteDefinition {
  /** The nav href this route marks current. Several routes may share one. */
  readonly href: string;
  /** Preloads the route's chunk, so a click does not wait on the network twice. */
  readonly load: () => Promise<unknown>;
  /** Whether the shell resolves `whoami` before the page renders. */
  readonly usesIdentity: boolean;
  readonly role: UserRole;
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
    role: "Producer",
    usesIdentity: true,
  },
  agents: {
    href: "/agents",
    load: () => import("../features/agents"),
    role: "Administrator",
    usesIdentity: true,
  },
  analytics: {
    href: "/analytics",
    load: () => import("../features/analytics"),
    role: "Administrator",
    usesIdentity: false,
  },
  arc: {
    href: "/arc",
    load: () => import("../features/arc"),
    role: "Administrator",
    usesIdentity: true,
  },
  "assert-claim": {
    href: "/memory",
    load: () => import("../features/memory"),
    role: "Producer",
    usesIdentity: true,
  },
  audit: {
    href: "/audit",
    load: () => import("../features/audit"),
    role: "Auditor",
    usesIdentity: false,
  },
  catalog: {
    href: "/catalog",
    load: () => import("../features/catalog"),
    role: "Producer",
    usesIdentity: true,
  },
  "context-lab": {
    href: "/context-lab",
    load: () => import("../features/context-lab"),
    role: "Producer",
    usesIdentity: true,
  },
  exceptions: {
    href: "/exceptions",
    load: () => import("../features/exceptions"),
    role: "Administrator",
    usesIdentity: true,
  },
  memory: {
    href: "/memory",
    load: () => import("../features/memory"),
    role: "Producer",
    usesIdentity: true,
  },
  "not-found": {
    // No nav item is current: the address matched none of them, and marking one
    // anyway would claim the reader is somewhere they are not.
    href: "",
    load: () => Promise.resolve(),
    role: "Producer",
    usesIdentity: false,
  },
  overview: {
    href: "/",
    load: () => import("../features/overview"),
    role: "Producer",
    usesIdentity: true,
  },
  ownership: {
    href: "/ownership",
    load: () => import("../features/ownership"),
    role: "Producer",
    usesIdentity: true,
  },
  proposals: {
    href: "/proposals",
    load: () => import("../features/proposals"),
    role: "Producer",
    usesIdentity: true,
  },
  quarantine: {
    href: "/quarantine",
    load: () => import("../features/quarantine"),
    role: "Administrator",
    usesIdentity: true,
  },
  relationships: {
    href: "/relationships",
    load: () => import("../features/relationships"),
    role: "Producer",
    usesIdentity: true,
  },
  revisions: {
    href: "/revisions",
    load: () => import("../features/revisions"),
    role: "Administrator",
    usesIdentity: true,
  },
  sessions: {
    href: "/sessions",
    load: () => import("../features/sessions"),
    role: "Administrator",
    usesIdentity: true,
  },
  settings: {
    href: "/settings",
    load: () => import("../features/settings"),
    role: "Administrator",
    usesIdentity: true,
  },
  sources: {
    href: "/sources",
    load: () => import("../features/sources"),
    role: "Administrator",
    usesIdentity: true,
  },
  tasks: {
    href: "/tasks",
    load: () => import("../features/tasks"),
    role: "Producer",
    usesIdentity: true,
  },
  verifiers: {
    href: "/verifiers",
    load: () => import("../features/verifiers"),
    role: "Administrator",
    usesIdentity: true,
  },
  workspaces: {
    href: "/workspaces",
    load: () => import("../features/workspaces"),
    role: "Producer",
    usesIdentity: true,
  },
};

/**
 * Which route an address names, or `not-found`.
 *
 * Ordered: `/memory/assert` is a destination of its own and has to be tested
 * before `/memory/`'s prefix claims it. The fall-through used to be the
 * catalog, so a mistyped or stale URL rendered a real page and said nothing —
 * a copied URL is supposed to reconstruct the same view, and silently
 * reconstructing a different one is worse than reporting nothing.
 */
function routeForPathname(pathname: string): AppRoute {
  if (pathname === "/") return "overview";
  if (pathname === "/activity") return "activity";
  if (pathname === "/agents") return "agents";
  if (pathname === "/analytics") return "analytics";
  if (pathname === "/arc") return "arc";
  if (pathname === "/audit") return "audit";
  if (pathname === "/catalog") return "catalog";
  if (pathname === "/context-lab") return "context-lab";
  if (pathname === "/memory/assert") return "assert-claim";
  if (pathname === "/memory" || pathname.startsWith("/memory/")) return "memory";
  if (pathname === "/ownership") return "ownership";
  if (pathname === "/proposals" || pathname.startsWith("/proposals/")) return "proposals";
  if (pathname === "/quarantine") return "quarantine";
  if (pathname === "/relationships") return "relationships";
  if (pathname === "/revisions") return "revisions";
  if (pathname === "/sessions" || pathname.startsWith("/sessions/")) return "sessions";
  if (pathname === "/settings") return "settings";
  if (pathname === "/sources") return "sources";
  if (pathname === "/tasks") return "tasks";
  if (pathname === "/exceptions") return "exceptions";
  if (pathname === "/verifiers") return "verifiers";
  if (pathname === "/workspaces" || pathname.startsWith("/workspaces/")) return "workspaces";
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
  if (!pathname.startsWith("/proposals/")) return null;
  const encoded = pathname.slice("/proposals/".length);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function workspaceIdForPathname(pathname: string): string | null {
  if (!pathname.startsWith("/workspaces/")) return null;
  const encoded = pathname.slice("/workspaces/".length);
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

export function App() {
  const [activeTenantId, setActiveTenantId] = useState("northstar");
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname);
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
    (destination: URL) => {
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
  const userRole = routeDefinitions[route].role;
  const skeletonControls = route === "audit" ? 5 : 2;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
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
          user={{
            initials: "MM",
            name: "Morgan Morris",
            role: userRole,
          }}
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
            ) : route === "sessions" ? (
              <SessionsPage
                {...(activeApiTenantId ? { apiTenantId: activeApiTenantId } : {})}
                activeTenantName={activeTenantName}
                client={apiClient}
                searchRef={searchRef}
                selectedSessionId={sessionIdForPathname(pathname)}
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
            ) : route === "agents" ? (
              <AgentsPage
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
            ) : route === "memory" ? (
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
          {gettingStartedOpen ? (
            <Suspense fallback={null}>
              <GettingStartedDialog
                activeTenantName={activeTenantName}
                onClose={closeGettingStarted}
              />
            </Suspense>
          ) : null}
        </AppShell>
      </ToastProvider>
    </QueryClientProvider>
  );
}
