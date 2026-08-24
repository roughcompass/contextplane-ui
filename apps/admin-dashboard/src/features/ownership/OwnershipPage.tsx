import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { OwnershipPanel } from "./OwnershipPanel";

interface OwnershipPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

export function OwnershipPage({ activeTenantName, apiTenantId, client }: OwnershipPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Ownership & profiles" }]}
        description="Who answers for what: owners and assignments in both directions, profile revisions, and the bindings that put a profile into effect."
        title="Ownership & profiles"
      />
      <OwnershipPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
