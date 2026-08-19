import { Bell, Network, ShieldCheck, SquareTerminal } from "lucide-react";
import { useState } from "react";

import { PageContainer, PageHeader } from "@repo/ui/layouts";
import { Button, Notice } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { ActivityPanel } from "./ActivityPanel";
import { CoordinationPanel } from "./CoordinationPanel";
import { OwnershipPanel } from "./OwnershipPanel";

export type TenantWorkTask = "activity" | "coordination" | "ownership";

interface TenantWorkPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

const tasks: readonly {
  description: string;
  icon: typeof Bell;
  id: TenantWorkTask;
  label: string;
}[] = [
  {
    description: "Notifications, learning evidence, and external signals",
    icon: Bell,
    id: "activity",
    label: "Activity",
  },
  {
    description: "Owners, assignments, profile revisions, and bindings",
    icon: ShieldCheck,
    id: "ownership",
    label: "Ownership & profiles",
  },
  {
    description: "Intent participants and durable checkpoint chains",
    icon: Network,
    id: "coordination",
    label: "Task coordination",
  },
];

function taskFromLocation(): TenantWorkTask {
  const value = new URLSearchParams(window.location.search).get("task");
  return value === "ownership" || value === "coordination" ? value : "activity";
}

export function TenantWorkPage({ activeTenantName, apiTenantId, client }: TenantWorkPageProps) {
  const [task, setTask] = useState<TenantWorkTask>(taskFromLocation);
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  function changeTask(nextTask: TenantWorkTask) {
    const url = new URL(window.location.href);
    url.searchParams.set("task", nextTask);
    window.history.replaceState(window.history.state, "", url);
    setTask(nextTask);
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              window.location.href = "/service-tools?group=activity";
            }}
            variant="secondary"
          >
            <SquareTerminal aria-hidden="true" className="size-4" />
            Exact service tools
          </Button>
        }
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Tenant work" }]}
        description="Act on tenant-scoped activity, ownership governance, profile bindings, participants, and checkpoint evidence through guided workflows."
        eyebrow="Tenant operations"
        title="Tenant work"
      />

      <Notice title="Guided workflows first, exact contract always available" variant="info">
        These workspaces cover frequent operational jobs with service-validated forms and explicit
        receipts. Service tools remains the complete fallback for every tenant-focused OpenAPI
        operation and specialist fields.
      </Notice>

      <div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label="Tenant work tasks">
        {tasks.map((candidate) => {
          const Icon = candidate.icon;
          const selected = task === candidate.id;
          return (
            <button
              key={candidate.id}
              aria-controls="tenant-work-panel"
              aria-selected={selected}
              className={`min-h-24 rounded-lg border p-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected
                  ? "border-accent bg-accent-subtle"
                  : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted"
              }`}
              onClick={() => changeTask(candidate.id)}
              role="tab"
              type="button"
            >
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <Icon aria-hidden="true" className="size-4 text-accent" />
                {candidate.label}
              </span>
              <span className="mt-2 block text-xs leading-5 text-muted">
                {candidate.description}
              </span>
            </button>
          );
        })}
      </div>

      <div id="tenant-work-panel" role="tabpanel" aria-live="polite">
        {task === "activity" ? (
          <ActivityPanel client={client} requestContext={requestContext} />
        ) : task === "ownership" ? (
          <OwnershipPanel client={client} requestContext={requestContext} />
        ) : (
          <CoordinationPanel client={client} requestContext={requestContext} />
        )}
      </div>
    </PageContainer>
  );
}
