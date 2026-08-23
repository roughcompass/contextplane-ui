import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { ReceiptExplorerPanel } from "./ReceiptExplorerPanel";

interface ReceiptsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/** What a resolution served, what it withheld, and what it cited. */
export function ReceiptsPage({ activeTenantName, apiTenantId, client }: ReceiptsPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Receipts" }]}
        description="Find the receipt for a resolution, see what it served and what it withheld, and follow the references it cited."
        eyebrow="Explain"
        title="Receipts"
      />
      <ReceiptExplorerPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
