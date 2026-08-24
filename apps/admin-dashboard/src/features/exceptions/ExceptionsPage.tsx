import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { ExceptionGrantPanel } from "./ExceptionGrantPanel";

interface ExceptionsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * Documented deviations from a governing directive.
 *
 * Its reader is an auditor as much as an operator, which is why the missing
 * register is stated on the page rather than left as an absence — an auditor
 * looking at a grant form and finding no list will reasonably conclude there
 * are no exceptions.
 */
export function ExceptionsPage({ activeTenantName, apiTenantId, client }: ExceptionsPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Exceptions" }]}
        description="Record that a governing directive does not apply in a narrower scope, for a stated reason and — where one is given — until a stated date."
        title="Exceptions"
      />
      <ExceptionGrantPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
