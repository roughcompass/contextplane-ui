import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { RevisionLifecyclePanel } from "./RevisionLifecyclePanel";

interface RevisionLifecyclePageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/** Proof that an approval happened, withdrawing it, and ending a revision. */
export function RevisionLifecyclePage({
  activeTenantName,
  apiTenantId,
  client,
}: RevisionLifecyclePageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Revisions" }]}
        description="Attach the evidence approving a revision, withdraw an approval, and record that a revision should no longer be relied on — saying which of the two things that means."
        title="Revisions"
      />
      <RevisionLifecyclePanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
