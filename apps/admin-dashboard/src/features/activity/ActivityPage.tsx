import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { ActivityPanel } from "./ActivityPanel";

interface ActivityPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

export function ActivityPage({ activeTenantName, apiTenantId, client }: ActivityPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Activity" }]}
        description="What has arrived and what needs acknowledging: notifications, learning evidence, and signals from outside the plane."
        eyebrow="Monitor"
        title="Activity"
      />
      <ActivityPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
