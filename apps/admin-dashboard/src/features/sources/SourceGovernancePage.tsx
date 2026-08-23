import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { SourceGovernancePanel } from "./SourceGovernancePanel";

interface SourceGovernancePageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * What ARC is allowed to read, and what it replays against.
 *
 * Deliberately not folded into `ArcSourceEvidenceSection`, which E10-T10 asked
 * to be read first. That section is step 2 of authoring one artifact: it binds
 * *this* piece of evidence to *this* change. These three registrations are
 * deployment configuration that every such binding afterwards inherits — a
 * different job, a different reader, and a different frequency.
 *
 * What the two share is a direction, and it runs one way: nothing registered
 * here can be used until it exists, and everything admitted there is bounded by
 * what is registered here.
 */
export function SourceGovernancePage({
  activeTenantName,
  apiTenantId,
  client,
}: SourceGovernancePageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Source governance" }]}
        description="Set what ARC may fetch or accept, who may approve it, and what observation is replayed against. Every later admission inherits these limits."
        eyebrow="Govern"
        title="Source governance"
      />
      <SourceGovernancePanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
