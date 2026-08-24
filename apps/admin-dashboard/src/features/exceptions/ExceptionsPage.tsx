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
 * was granted". It has existed; nothing called it.
 *
 * E22-T16 named three files still asserting its absence and swept two: the
 * adapter's docstring and one notice. The grant panel's *"Nothing lists
 * exceptions, so this is the only time it is shown"* survived, under a
 * paragraph here saying it had not — so the sweep's own record was the last
 * false claim standing (E23-T6). It is corrected, and its test is inverted
 * rather than deleted, which is what keeps the sentence from coming back.
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
