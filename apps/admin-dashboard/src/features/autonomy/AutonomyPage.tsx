import { PageContainer } from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { EnvelopePanel } from "./EnvelopePanel";

interface AutonomyPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * The suspend half of E10-T1, which held for two waves because it could not be
 * built: `AutonomyEnvelopeService` had all four acts and no transport reached
 * any of them, so the control that decides what an agent may do could be read
 * and not operated. E23-T5 routed them; this is the screen.
 *
 * The two non-negotiables carried from E10-T1 apply here as written, translated
 * from a preview to a reading: **the posture is point-in-time**, and
 * **reinstate is not a secondary action**.
 */
export function AutonomyPage({ activeTenantName, apiTenantId, client }: AutonomyPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Envelopes" }]}
        description="The envelope is what decides an agent may act at all. Suspending one stops it now and is reversible from this screen; revoking one ends the binding for good."
        title="Autonomy envelopes"
      />
      <EnvelopePanel
        {...(apiTenantId ? { apiTenantId } : {})}
        client={client}
        requestContext={requestContext}
      />
    </PageContainer>
  );
}
