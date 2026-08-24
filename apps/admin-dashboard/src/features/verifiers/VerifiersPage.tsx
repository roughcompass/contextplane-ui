import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { GovernanceObjectTable } from "../../shared/arcGovernance/GovernanceObjectTable";
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
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Approvers" }]}
        description="Enrol the keys allowed to approve a governed change, and end their authority when they should no longer hold it."
        title="Approvers"
      />
      <VerifierEnrolmentPanel client={client} requestContext={requestContext} />
      {/* Revoked verifiers stay in the table. "Who could approve this change at
          the time" is a question about a past state, and a list showing only
          current authority cannot answer it. */}
      <GovernanceObjectTable
        client={client}
        collection="approvalVerifiers"
        description="Every enrolled verifier, including revoked ones. Revoking ends future authority; it does not unmake an approval already given, and the row is what says who gave it."
        identifierLabel="Verifier"
        requestContext={requestContext}
        title="Enrolled approval verifiers"
      />
      <GovernanceObjectTable
        client={client}
        collection="approvalEvidence"
        description="Every piece of approval evidence filed against a revision. Evidence that is no longer in force was revoked after the fact — the approval it recorded still happened."
        identifierLabel="Evidence"
        requestContext={requestContext}
        title="Approval evidence"
      />
    </PageContainer>
  );
}
