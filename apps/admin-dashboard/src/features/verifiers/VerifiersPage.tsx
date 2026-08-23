import { PageContainer, PageHeader } from "@repo/ui/layouts";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { VerifierEnrolmentPanel } from "./VerifierEnrolmentPanel";

interface VerifiersPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * Who may approve an ARC change.
 *
 * Its own destination rather than a section of the policy screen, because its
 * reader is not the same person: deciding who is allowed to approve and
 * approving are different jobs, and keeping them apart is the whole reason
 * verifiers are enrolled at all.
 */
export function VerifiersPage({ activeTenantName, apiTenantId, client }: VerifiersPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Approval verifiers" }]}
        description="Enrol the keys allowed to approve a governed change, and end their authority when they should no longer hold it."
        eyebrow="Govern"
        title="Approval verifiers"
      />
      <VerifierEnrolmentPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
