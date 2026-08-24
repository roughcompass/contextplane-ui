import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { CurationCockpitPanel } from "./CurationCockpitPanel";

interface CurationCockpitPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

export function CurationCockpitPage({
  activeTenantName,
  apiTenantId,
  client,
}: CurationCockpitPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Curation review" }]}
        description="What is waiting for a curator, why the service put each row where it is, and what each decision commits to before it is taken."
        eyebrow="Govern"
        title="Curation review"
      />
      <CurationCockpitPanel
        client={client}
        requestContext={requestContext}
        tenantKey={apiTenantId ?? "credential-default"}
      />
    </PageContainer>
  );
}
