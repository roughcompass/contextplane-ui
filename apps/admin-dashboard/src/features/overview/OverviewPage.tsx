import { RefreshCw } from "lucide-react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { BRAND } from "@repo/ui/brand";
import { EmptyState, PageContainer, PageSkeleton, SectionSurface } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";
import {
  Button,
  DetailsLink,
  ImpactBadge,
  RequestFailure,
  Skeleton,
  StatusBadge,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getMemoryCurationCounts,
  getWhoAmI,
  listPromotionProposals,
  listSessions,
  listWorkspaces,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type PromotionProposal,
  type WhoAmI,
} from "../../shared/api";
import {
  curationQueueTotal,
  curationReasonSummaries,
  formatOverviewTimestamp,
  humanizeOverviewToken,
  overviewPreviewLimit,
  overviewProposalHref,
  overviewSessionHref,
  overviewValuePreview,
  overviewWorkspaceHref,
  selectGovernedOutcomes,
  selectOverviewProposals,
  selectRecentSessions,
  selectRecentWorkspaces,
  shortOverviewIdentifier,
} from "./overviewModel";

interface OverviewPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

interface OverviewGroupProps {
  action: ReactNode;
  children: ReactNode;
  description: ReactNode;
  title: string;
}

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function tenantQueryKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function identityName(identity: WhoAmI): string {
  return (
    identity.actor_display_name ??
    identity.actor_email ??
    shortOverviewIdentifier(identity.actor_id)
  );
}

function errorPresentation(error: unknown, source: string) {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "Connect through the deployment gateway or runtime token provider. Access tokens must not be placed in browser-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning" as const,
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential spans multiple tenants. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning" as const,
      };
    }
    if (error.status === 403) {
      return {
        body: `The service did not authorize ${source.toLocaleLowerCase()} for this actor and tenant. Other overview sources remain available.`,
        title: `${source} is restricted`,
        variant: "warning" as const,
      };
    }
    if (error.code === "service_unavailable" || error.code === "unavailable") {
      return {
        body: `${source} is not published by this deployment. Other overview sources remain available.`,
        title: `${source} is unavailable`,
        variant: "warning" as const,
      };
    }
  }

  return {
    body: `${source} could not be loaded. Other overview sources are preserved; retry this request when the service is available.`,
    title: `${source} could not be loaded`,
    variant: "danger" as const,
  };
}

function OverviewQueryFailure({
  error,
  onRetry,
  source,
}: {
  error: unknown;
  onRetry: () => void;
  source: string;
}) {
  const presentation = errorPresentation(error, source);
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={error instanceof ContextplaneApiError ? error.requestId : null}
      title={presentation.title}
      variant={presentation.variant}
    >
      {presentation.body}
    </RequestFailure>
  );
}

function OverviewGroup({ action, children, description, title }: OverviewGroupProps) {
  return (
    <div className="min-w-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="mt-1 text-sm leading-6 text-muted">{description}</div>
      </div>
      <div className="mt-4">{children}</div>
      <div className="mt-4 border-t border-border-subtle pt-2">{action}</div>
    </div>
  );
}

function GroupLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="space-y-4 py-2" role="status">
      <span className="sr-only">{label}</span>
      {["first", "second", "third"].map((row) => (
        <div className="space-y-2" key={row}>
          <Skeleton className="h-4 w-2/3" tone="strong" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function proposalStateTone(proposal: PromotionProposal): "info" | "success" | "warning" {
  if (proposal.state === "accepted") return "success";
  if (proposal.state === "amended") return "info";
  return "warning";
}

function ProposalRows({ proposals }: { proposals: readonly PromotionProposal[] }) {
  return (
    <ul aria-label="Open promotion proposal preview" className="divide-y divide-border-subtle">
      {proposals.map((proposal) => (
        <li key={proposal.proposal_id}>
          <a
            className="group -mx-2 flex min-h-20 items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={overviewProposalHref(proposal)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-accent">
                {humanizeOverviewToken(proposal.predicate)}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                <span className="font-mono">
                  {shortOverviewIdentifier(proposal.subject_entity_id)}
                </span>{" "}
                · Proposed {overviewValuePreview(proposal.proposed_value)}
              </span>
              <span className="mt-1 block text-xs text-subtle">
                Created {formatOverviewTimestamp(proposal.created_at)}
              </span>
            </span>
            <ImpactBadge className="shrink-0" highImpact={proposal.high_impact} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function SessionRows({ sessions }: { sessions: ReturnType<typeof selectRecentSessions> }) {
  return (
    <ul aria-label="Recent session preview" className="divide-y divide-border-subtle">
      {sessions.map((session) => (
        <li key={session.session_id}>
          <a
            className="group -mx-2 flex min-h-20 items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={overviewSessionHref(session.session_id)}
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-sm font-medium text-foreground group-hover:text-accent">
                {shortOverviewIdentifier(session.session_id)}
              </span>
              <span className="mt-1 block text-xs text-muted">
                Last activity {formatOverviewTimestamp(session.last_activity_at)}
              </span>
            </span>
            <StatusBadge className="shrink-0 tabular-nums">
              {session.event_count.toLocaleString("en-US")}{" "}
              {session.event_count === 1 ? "event" : "events"}
            </StatusBadge>
          </a>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceRows({ workspaces }: { workspaces: ReturnType<typeof selectRecentWorkspaces> }) {
  return (
    <ul aria-label="Recent workspace preview" className="divide-y divide-border-subtle">
      {workspaces.map((workspace) => (
        <li key={workspace.workspace_id}>
          <a
            className="group -mx-2 flex min-h-20 items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={overviewWorkspaceHref(workspace.workspace_id)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-accent">
                {workspace.name}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                {workspace.description || "No workspace description"}
              </span>
              <span className="mt-1 block text-xs text-subtle">
                Updated {formatOverviewTimestamp(workspace.updated_at)}
              </span>
            </span>
            <StatusBadge className="shrink-0">
              {workspace.owner_kind === "actor" ? "Personal" : "Tenant"}
            </StatusBadge>
          </a>
        </li>
      ))}
    </ul>
  );
}

function OutcomeRows({ proposals }: { proposals: readonly PromotionProposal[] }) {
  return (
    <ul aria-label="Governed proposal outcome preview" className="divide-y divide-border-subtle">
      {proposals.map((proposal) => (
        <li key={proposal.proposal_id}>
          <a
            className="group -mx-2 flex min-h-20 items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            href={overviewProposalHref(proposal)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-accent">
                {humanizeOverviewToken(proposal.predicate)}
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                <span className="font-mono">
                  {shortOverviewIdentifier(proposal.subject_entity_id)}
                </span>{" "}
                · {humanizeOverviewToken(proposal.target_kind)}
              </span>
              <span className="mt-1 block text-xs text-subtle">
                Proposal created {formatOverviewTimestamp(proposal.created_at)}
              </span>
            </span>
            <StatusBadge className="shrink-0" tone={proposalStateTone(proposal)}>
              {humanizeOverviewToken(proposal.state)}
            </StatusBadge>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function OverviewPage({ activeTenantName, apiTenantId, client }: OverviewPageProps) {
  const queryClient = useQueryClient();
  const tenantKey = tenantQueryKey(apiTenantId);
  const queryPrefix = ["overview", tenantKey] as const;
  const context = requestContext(apiTenantId);
  const activeRequests = useIsFetching({ queryKey: queryPrefix });
  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", tenantKey, "identity"],
    staleTime: 5 * 60 * 1000,
  });
  const openProposals = useQuery({
    enabled: identity.data !== undefined,
    queryFn: ({ signal }) =>
      listPromotionProposals(client, { pageSize: 25, state: "open" }, context, signal),
    queryKey: [...queryPrefix, "proposals", "open"],
  });
  const curationCounts = useQuery({
    enabled: identity.data !== undefined,
    queryFn: ({ signal }) => getMemoryCurationCounts(client, context, signal),
    queryKey: [...queryPrefix, "curation-counts"],
  });
  const sessions = useQuery({
    enabled: identity.data !== undefined,
    queryFn: ({ signal }) => listSessions(client, { limit: overviewPreviewLimit }, context, signal),
    queryKey: [...queryPrefix, "sessions", identity.data?.actor_id ?? "pending"],
  });
  const workspaces = useQuery({
    enabled: identity.data !== undefined,
    queryFn: ({ signal }) => listWorkspaces(client, {}, context, signal),
    queryKey: [...queryPrefix, "workspaces", identity.data?.actor_id ?? "pending"],
  });
  const outcomes = useQuery({
    enabled: identity.data !== undefined,
    queryFn: async ({ signal }) => {
      const [accepted, amended] = await Promise.all([
        listPromotionProposals(client, { pageSize: 25, state: "accepted" }, context, signal),
        listPromotionProposals(client, { pageSize: 25, state: "amended" }, context, signal),
      ]);
      return { accepted, amended };
    },
    queryKey: [...queryPrefix, "proposals", "outcomes"],
  });

  if (identity.isPending) return <PageSkeleton controls={2} rows={6} />;

  if (identity.isError) {
    const presentation = errorPresentation(identity.error, "Overview identity");
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ label: activeTenantName }]}
          description="See what needs attention, resume recent work, and follow governed outcomes without leaving the dedicated records and workflows behind."
          metadata={<StatusBadge>{activeTenantName}</StatusBadge>}
          title="Overview"
        />
        <RequestFailure
          onRetry={() => void identity.refetch()}
          requestId={
            identity.error instanceof ContextplaneApiError ? identity.error.requestId : null
          }
          title={presentation.title}
          variant={presentation.variant}
        >
          {presentation.body}
        </RequestFailure>
      </PageContainer>
    );
  }

  const proposalPreview = selectOverviewProposals(openProposals.data?.items ?? []);
  const recentSessions = selectRecentSessions(sessions.data ?? []);
  const recentWorkspaces = selectRecentWorkspaces(workspaces.data?.items ?? []);
  const governedOutcomes = outcomes.data
    ? selectGovernedOutcomes(outcomes.data.accepted.items, outcomes.data.amended.items)
    : [];
  const curationTotal = curationCounts.data ? curationQueueTotal(curationCounts.data) : 0;
  const curationReasons = curationCounts.data ? curationReasonSummaries(curationCounts.data) : [];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            disabled={activeRequests > 0}
            onClick={() => void queryClient.invalidateQueries({ queryKey: queryPrefix })}
            variant="secondary"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${activeRequests > 0 ? "motion-safe:animate-spin" : ""}`}
            />
            {activeRequests > 0 ? "Refreshing" : "Refresh overview"}
          </Button>
        }
        breadcrumbs={[{ label: identity.data.tenant_display_name }]}
        description="See what needs attention, resume recent work, and follow governed outcomes. Full records, filters, and workflows stay in their dedicated destinations."
        metadata={
          <>
            <StatusBadge tone="info">Cross-feature summary</StatusBadge>
            <StatusBadge>{identity.data.tenant_display_name}</StatusBadge>
            <StatusBadge>{identityName(identity.data)}</StatusBadge>
          </>
        }
        title="Overview"
      />

      <div className="space-y-6">
        <SectionSurface
          description="Actionable review signals only. Observed claims and governance proposals remain separate so their authority is not blurred."
          title="Needs attention"
        >
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-border-subtle">
            <div className="lg:pr-8">
              <OverviewGroup
                action={<DetailsLink href="/memory/promotions">Open proposal queue</DetailsLink>}
                description="High-impact items are prioritized from the first 25 open proposals returned by the service."
                title="Governance proposals"
              >
                {openProposals.isPending ? <GroupLoading label="Loading open proposals" /> : null}
                {openProposals.isError ? (
                  <OverviewQueryFailure
                    error={openProposals.error}
                    onRetry={() => void openProposals.refetch()}
                    source="Open proposals"
                  />
                ) : null}
                {openProposals.isSuccess && proposalPreview.length === 0 ? (
                  <EmptyState
                    className="px-0 py-6"
                    description="The service returned no items from the open proposal queue."
                    title="No open proposals were returned"
                  />
                ) : null}
                {proposalPreview.length > 0 ? <ProposalRows proposals={proposalPreview} /> : null}
              </OverviewGroup>
            </div>

            <div className="lg:pl-8">
              <OverviewGroup
                action={<DetailsLink href="/memory/review">Open curation queue</DetailsLink>}
                description="Service-published counts for the whole curation queue; no observed-claim rows are copied here."
                title="Living Memory curation"
              >
                {curationCounts.isPending ? <GroupLoading label="Loading curation counts" /> : null}
                {curationCounts.isError ? (
                  <OverviewQueryFailure
                    error={curationCounts.error}
                    onRetry={() => void curationCounts.refetch()}
                    source="Curation counts"
                  />
                ) : null}
                {curationCounts.isSuccess && curationTotal === 0 ? (
                  <EmptyState
                    className="px-0 py-6"
                    description="The service published a whole-queue total of zero."
                    title="No curation items are waiting"
                  />
                ) : null}
                {curationCounts.isSuccess && curationTotal > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {curationTotal.toLocaleString("en-US")}{" "}
                      {curationTotal === 1 ? "item" : "items"} waiting
                    </p>
                    <p className="mt-1 text-xs text-muted">Whole curation queue</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {curationReasons.map((reason) => (
                        <StatusBadge className="tabular-nums" key={reason.reason} tone="warning">
                          {reason.count.toLocaleString("en-US")} {reason.label.toLocaleLowerCase()}
                        </StatusBadge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </OverviewGroup>
            </div>
          </div>
        </SectionSurface>

        <SectionSurface
          description="Actor-private sessions and visible workspaces are shown as handoffs into the full working surfaces."
          title="Resume work"
        >
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-border-subtle">
            <div className="lg:pr-8">
              <OverviewGroup
                action={<DetailsLink href="/sessions">Open all sessions</DetailsLink>}
                description={`Up to ${overviewPreviewLimit} actor-private sessions ordered by their latest activity.`}
                title="Recent sessions"
              >
                {sessions.isPending ? <GroupLoading label="Loading recent sessions" /> : null}
                {sessions.isError ? (
                  <OverviewQueryFailure
                    error={sessions.error}
                    onRetry={() => void sessions.refetch()}
                    source="Recent sessions"
                  />
                ) : null}
                {sessions.isSuccess && recentSessions.length === 0 ? (
                  <EmptyState
                    className="px-0 py-6"
                    description="Start or record a session before there is work to resume here."
                    title="No retained sessions were returned"
                  />
                ) : null}
                {recentSessions.length > 0 ? <SessionRows sessions={recentSessions} /> : null}
              </OverviewGroup>
            </div>

            <div className="lg:pl-8">
              <OverviewGroup
                action={<DetailsLink href="/notebooks">Open all workspaces</DetailsLink>}
                description="The most recently updated active items from the first workspace page returned by the service."
                title="Recent workspaces"
              >
                {workspaces.isPending ? <GroupLoading label="Loading recent workspaces" /> : null}
                {workspaces.isError ? (
                  <OverviewQueryFailure
                    error={workspaces.error}
                    onRetry={() => void workspaces.refetch()}
                    source="Recent workspaces"
                  />
                ) : null}
                {workspaces.isSuccess && recentWorkspaces.length === 0 ? (
                  <EmptyState
                    className="px-0 py-6"
                    description="Create a personal or tenant workspace to keep resumable material."
                    title="No active workspaces were returned"
                  />
                ) : null}
                {recentWorkspaces.length > 0 ? (
                  <WorkspaceRows workspaces={recentWorkspaces} />
                ) : null}
              </OverviewGroup>
            </div>
          </div>
        </SectionSurface>

        <SectionSurface
          action={<DetailsLink href="/audit">Open audit log</DetailsLink>}
          description="Accepted and amended proposals from the first returned pages, ordered by proposal creation time. Use the audit log for decision-time history."
          title="Governed outcomes"
        >
          {outcomes.isPending ? <GroupLoading label="Loading governed outcomes" /> : null}
          {outcomes.isError ? (
            <OverviewQueryFailure
              error={outcomes.error}
              onRetry={() => void outcomes.refetch()}
              source="Governed outcomes"
            />
          ) : null}
          {outcomes.isSuccess && governedOutcomes.length === 0 ? (
            <EmptyState
              className="px-0 py-6"
              description="The first accepted and amended proposal pages contained no outcomes."
              title="No governed outcomes were returned"
            />
          ) : null}
          {governedOutcomes.length > 0 ? <OutcomeRows proposals={governedOutcomes} /> : null}
        </SectionSurface>
      </div>
    </PageContainer>
  );
}
