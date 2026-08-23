import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";
import {
  assignTenantOwnership,
  findTargetOwners,
  getProfileConformance,
  getTenantOwnershipAssignment,
  listPrincipalOwnership,
  planProfileBinding,
  publishProfileExtension,
  publishProfileRevision,
  transitionProfileBinding,
  transitionTenantOwnership,
} from "./ownership";

const ownership = {
  confidence: 0.9,
  derivation_method: "declared",
  effective_from: "2026-08-12T14:28:41Z",
  effective_to: null,
  is_pending: false,
  owned_target_id: "target-a",
  owned_target_kind: "capability",
  owner_principal: "actor-a",
  ownership_assignment_id: "assignment-a",
  provenance_id: "provenance-a",
  recorded_at: "2026-08-12T14:28:41Z",
  recorded_by: "actor-admin",
  replaced_by_assignment_id: null,
  revocation_reason: null,
  role: "owner",
  scope: "full",
  source: "manual",
  validation_state: "validated",
};



function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return clientFromRequest(request);
}


describe("ownership and profile API", () => {
  it("supports ownership lookup, assignment, and lifecycle transitions", async () => {
    const client = clientFor(() => ({ items: [ownership] }));
    const mutationClient = clientFor(() => ownership);

    const byTarget = await findTargetOwners(client, "capability/type", "target with spaces", true, {
      tenantId: "tenant-a",
    });
    const byOwner = await listPrincipalOwnership(client, "actor/a", false, {
      tenantId: "tenant-a",
    });
    const created = await assignTenantOwnership(
      mutationClient,
      {
        owned_target_id: "target-a",
        owned_target_kind: "capability",
        owner_principal: "actor-a",
        profile_revision_id: "revision-a",
        role: "owner",
        scope: "full",
        source: "manual",
      },
      { tenantId: "tenant-a" },
    );
    await getTenantOwnershipAssignment(mutationClient, "assignment/a", {
      tenantId: "tenant-a",
    });
    await transitionTenantOwnership(
      mutationClient,
      "assignment/a",
      { reason: "Reviewed", to_state: "validated" },
      { tenantId: "tenant-a" },
    );

    expect(byTarget[0]).toEqual(expect.objectContaining({ confidence: 0.9, role: "owner" }));
    expect(byOwner[0]?.ownershipAssignmentId).toBe("assignment-a");
    expect(created.validationState).toBe("validated");
    expect(client.request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/ownership:owned-by?include_pending=true&owned_target_id=target+with+spaces&owned_target_kind=capability%2Ftype",
      "/v1/ownership:owns?include_pending=false&owner_principal=actor%2Fa",
    ]);
    expect(mutationClient.request).toHaveBeenLastCalledWith(
      "/v1/ownership/assignments/assignment%2Fa:transition",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("covers profile publishing, planning, and binding transitions", async () => {
    const client = clientFor((path) => ({ path, state: "accepted" }));
    const context = { tenantId: "tenant-a" };

    await getProfileConformance(client, context);
    await planProfileBinding(
      client,
      {
        effective_from: "2026-08-12T14:28:41Z",
        profile_revision_id: "revision-a",
        reason: "Adopt policy profile",
      },
      context,
    );
    await transitionProfileBinding(
      client,
      "binding/a",
      "rollback/complete",
      { reason: "Recovery verified" },
      context,
    );
    await publishProfileExtension(
      client,
      { namespace: "tenant-policy", target_core_revision_id: "revision-a" },
      context,
    );
    await publishProfileRevision(
      client,
      {
        compatibility: "backward_compatible",
        profile_family: "policy",
        profile_name: "Policy service",
        semantic_version: "2.0.0",
      },
      context,
    );

    expect(client.request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/profiles/conformance",
      "/v1/profiles/bindings",
      "/v1/profiles/bindings/binding%2Fa/rollback/complete",
      "/v1/profiles/extensions",
      "/v1/profiles/revisions",
    ]);
    expect(client.request).toHaveBeenLastCalledWith(
      "/v1/profiles/revisions",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

});
