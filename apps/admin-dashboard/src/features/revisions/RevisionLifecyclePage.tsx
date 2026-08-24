import { useState } from "react";

import { PageContainer } from "@repo/ui/layouts";
import { Notice } from "@repo/ui/primitives";

import type { ArcRevision, ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { PageHeader } from "../../shared/navigation/surface";
import { RevisionIndexPanel } from "./RevisionIndexPanel";
import { RevisionLifecyclePanel } from "./RevisionLifecyclePanel";

interface RevisionLifecyclePageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * A revision, what rests on it, and the two endings.
 *
 * The list comes first and the acts follow from it. This screen used to be four
 * text boxes asking for a UUID: its argument about the two terminal acts is
 * correct and well made, and it gave the reader nothing to perform them on. The
 * fix was context, not copy.
 *
 * **The acts appear only once a revision is open.** Offering an irreversible
 * action beside an empty field invites somebody to paste an identifier they have
 * not looked at, which is exactly the mistake neither act can be undone from.
 */
export function RevisionLifecyclePage({
  activeTenantName,
  apiTenantId,
  client,
}: RevisionLifecyclePageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const [selected, setSelected] = useState<ArcRevision | null>(null);

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Revisions" }]}
        description="Attach the evidence approving a revision, withdraw an approval, and record that a revision should no longer be relied on — saying which of the two things that means."
        title="Revisions"
      />
      <RevisionIndexPanel
        client={client}
        onSelect={setSelected}
        requestContext={requestContext}
        selectedRevisionId={selected?.revision_id ?? null}
      />
      {selected ? (
        <RevisionLifecyclePanel
          client={client}
          requestContext={requestContext}
          selected={selected}
        />
      ) : (
        <Notice title="Choose a revision above" variant="info">
          Both acts on this screen are terminal and neither is undoable. They appear once a revision
          is open, so the thing being ended is one somebody has looked at rather than an identifier
          they pasted.
        </Notice>
      )}
    </PageContainer>
  );
}
