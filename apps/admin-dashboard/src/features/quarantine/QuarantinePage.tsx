import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { QuarantinePanel } from "./QuarantinePanel";

interface QuarantinePageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

export function QuarantinePage({ activeTenantName, apiTenantId, client }: QuarantinePageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Quarantine" }]}
        description="Withhold claims by where they came from when an ingest or an extractor turns out to have been wrong, see what rests on them first, and put them back."
        eyebrow="Govern"
        title="Quarantine"
      />
      <QuarantinePanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
