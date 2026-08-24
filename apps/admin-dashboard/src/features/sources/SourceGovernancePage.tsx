import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { GovernanceObjectTable } from "../../shared/arcGovernance/GovernanceObjectTable";
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
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Sources" }]}
        description="Set what ARC may fetch or accept, who may approve it, and what observation is replayed against. Every later admission inherits these limits."
        title="Sources"
      />
      <SourceGovernancePanel client={client} requestContext={requestContext} />
      {/* The tables sit under the forms rather than beside them, because the
          order matches the job: an operator arrives to register something, and
          the first question they have afterwards is whether it took. Putting
          the read above the write would ask them to scroll past a list to reach
          the thing they came to do. */}
      <GovernanceObjectTable
        client={client}
        collection="sourceConnectors"
        description="Every connector registered for this tenant, including ones that have been revoked — a fetch that used to work and now refuses is usually explained by a row here, not by its absence."
        identifierLabel="Connector"
        requestContext={requestContext}
        revocable="connector"
        title="Registered source connectors"
      />
      <GovernanceObjectTable
        client={client}
        collection="sourceUploadPolicies"
        description="Every upload policy, on the same terms."
        identifierLabel="Policy"
        requestContext={requestContext}
        revocable="upload-policy"
        title="Registered upload policies"
      />
      <GovernanceObjectTable
        client={client}
        collection="replayCorpora"
        description="Every approved corpus. A qualification citing a digest that is no longer in force was measured against something this tenant has since withdrawn."
        identifierLabel="Corpus digest"
        requestContext={requestContext}
        title="Approved replay corpora"
      />
    </PageContainer>
  );
}
