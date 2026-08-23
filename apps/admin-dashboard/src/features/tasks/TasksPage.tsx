import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { TaskCoordinationPanel } from "./TaskCoordinationPanel";

interface TasksPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

export function TasksPage({ activeTenantName, apiTenantId, client }: TasksPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Tasks" }]}
        description="Who is working a task and what has been established on it: participant grants, and the append-only checkpoint chain a second agent resumes from."
        eyebrow="Work with context"
        title="Tasks"
      />
      <TaskCoordinationPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
