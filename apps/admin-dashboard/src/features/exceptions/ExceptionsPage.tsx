import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { GovernanceObjectTable } from "../../shared/arcGovernance/GovernanceObjectTable";
import { ExceptionGrantPanel } from "./ExceptionGrantPanel";

interface ExceptionsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * Documented deviations from a governing directive.
 *
 * Its reader is an auditor as much as an operator, which is why the register
 * comes first: an exception is *defined* as a documented deviation, and one
 * nobody can read is a deviation that was not documented.
 *
 * **This page used to say the register could not be built.** The service's own
 * read describes itself as *"the register an exception is supposed to have"*,
 * and says that until it existed an exception "was invisible from the moment it
 * was granted". It has existed; nothing called it. Three files here still
 * asserted its absence — the notice this replaces, its test, and the adapter's
 * docstring — which is the shape E22-T16 exists to sweep: copy describing a
 * limitation the product does not have.
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
      <GovernanceObjectTable
        client={client}
        collection="exceptions"
        description="Every exception granted for this tenant, including revoked ones. A deviation that is no longer in force still explains why something was permitted while it stood."
        identifierLabel="Exception"
        requestContext={requestContext}
        title="Exceptions in force"
      />
      <ExceptionGrantPanel client={client} requestContext={requestContext} />
    </PageContainer>
  );
}
