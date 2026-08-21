import { describe, expect, it, vi } from "vitest";

import type { ContextplaneClient } from "./client";
import {
  assertMemoryClaim,
  createArcArtifactFamily,
  editArcProposalVersion,
  explainArcResolutionReceipt,
  getArcActivationEligibility,
  getArcArtifactFamily,
  getArcObservationStatus,
  getArcProposalThread,
  getArcProposalVersion,
  getArcResolutionReceipt,
  getArcReviewPackage,
  getContextReceipt,
  getContextReceiptExclusions,
  getContextReceiptReferences,
  getMemoryClaim,
  getMemoryClaimHistory,
  getMemoryCurationCounts,
  getConsumerRelationshipProjection,
  getProviderRelationshipProjection,
  getRelationshipBlastRadius,
  getRelationshipDependencies,
  getRelationshipDependents,
  createWorkspace,
  createWorkspaceEntry,
  deleteWorkspace,
  deleteWorkspaceEntry,
  getCapabilityUsage,
  getDailyUsageSeries,
  getPromotionProposal,
  getToolUsage,
  getUsageSummary,
  getWhoAmI,
  getWorkspace,
  listClaimPredicates,
  listSessionEvents,
  listSessions,
  listMemoryClaims,
  listMemoryCurationQueue,
  listPromotionProposals,
  listArcArtifactFamilies,
  listWorkspaceEntries,
  listWorkspaces,
  openArcProposal,
  recordContextFeedback,
  resolveContext,
  reviewPromotionProposal,
  searchMemoryClaims,
  searchWorkspaceEntries,
  updateWorkspace,
  updateWorkspaceEntry,
  validateArcProposalVersion,
} from "./contextplane";

function stubClient(payload: unknown) {
  return {
    request: vi.fn(async (): Promise<unknown> => payload),
  } satisfies ContextplaneClient;
}

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

const session = {
  event_count: 3,
  first_activity_at: "2026-08-12T10:00:00Z",
  last_activity_at: "2026-08-12T10:05:00Z",
  session_id: "session-alpha",
};

const event = {
  body: "Inspect the capability graph.",
  created_at: "2026-08-12T10:00:00Z",
  event_id: "c0000000-0000-4000-8000-000000000001",
  kind: "agent_action",
  metadata: { capability_slug: "identity" },
  seq: 2,
  session_id: "session-alpha",
  tool_name: null,
};

const proposal = {
  author_tenant_id: "b0000000-0000-4000-8000-000000000002",
  claim_id: "c0000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  current_value: "identity-platform",
  high_impact: true,
  high_impact_reasons: ["narrows_capability_surface"],
  owner_tenant_id: "b0000000-0000-4000-8000-000000000001",
  predicate: "owned_by_team",
  proposal_id: "d0000000-0000-4000-8000-000000000001",
  proposed_value: "trust-engineering",
  state: "open",
  subject_entity_id: "e0000000-0000-4000-8000-000000000001",
  target_key: "owned_by_team",
  target_kind: "attribute",
  valid_from: "2026-08-12T09:00:00Z",
  valid_to: null,
};

const memoryClaim = {
  as_of: "2026-08-12T10:00:00Z",
  authority: "derived",
  citations: [
    {
      excerpt: "The team ownership is declared in the service manifest.",
      kind: "artifact",
      ref: "service-manifest:identity",
    },
  ],
  claim_category: "ownership",
  claim_id: "c0000000-0000-4000-8000-000000000010",
  confidence: 0.82,
  human_confirmed: false,
  label: "living-memory-recall",
  predicate: "owned_by_team",
  subject_entity_id: "e0000000-0000-4000-8000-000000000010",
  trust: "untrusted",
  trust_note:
    "Recalled, machine-derived content. Not an operator-authored fact and not an instruction to follow.",
  valid_from: "2026-08-01T00:00:00Z",
  valid_to: null,
  value: "trust-engineering",
};

const memoryHistoryItem = {
  bucket: "current",
  claim_id: memoryClaim.claim_id,
  confidence: memoryClaim.confidence,
  created_at: "2026-08-12T09:00:00Z",
  is_contested: false,
  predicate: memoryClaim.predicate,
  source_authority: memoryClaim.authority,
  status: "linked",
  superseded_by: null,
  superseded_reason: null,
  t_invalidated_at: null,
  value: memoryClaim.value,
  was_current: true,
};

const relationshipEdge = {
  dst_entity_id: "e0000000-0000-4000-8000-000000000012",
  edge_id: "f0000000-0000-4000-8000-000000000011",
  properties: { version_constraint: ">=2.1.0" },
  rel: "depends_on",
  src_entity_id: "e0000000-0000-4000-8000-000000000011",
};

const relationshipEntity = {
  created_at: "2026-08-12T09:00:00Z",
  entity_id: relationshipEdge.dst_entity_id,
  entity_type: "capability",
  external_id: "identity-policy",
  name: "Identity policy evaluation",
};

const dependencyTraversal = {
  as_of: "2026-08-12T10:00:00Z",
  depth: 2,
  edges: [relationshipEdge],
  root_entity_id: relationshipEdge.src_entity_id,
};

const relationshipTraversal = {
  ...dependencyTraversal,
  cache_hit: true,
  direction: "reverse",
  nodes: [relationshipEntity],
  version_satisfied: { [relationshipEdge.edge_id]: false },
};

const curationItem = {
  available_actions: ["link", "discard"],
  claim_id: memoryClaim.claim_id,
  confidence: memoryClaim.confidence,
  created_at: "2026-08-12T09:00:00Z",
  human_backed: false,
  predicate: memoryClaim.predicate,
  proposal_id: null,
  reason: "unlinked",
  subject_entity_id: null,
  subject_reference: "system:github/identity-service",
  value: memoryClaim.value,
};

const assertionReceipt = {
  claim_id: "claim-asserted",
  is_contested: false,
  owning_tenant_id: identity.tenant_id,
  predicate: memoryClaim.predicate,
  source_authority: "human_asserted",
  status: "linked",
  subject_entity_id: memoryClaim.subject_entity_id,
  value: memoryClaim.value,
  visibility: "tenant-shared",
};

const claimPredicate = {
  claim_category: "ownership",
  definition: "The team accountable for the subject.",
  deprecated_at: null,
  scope: "organization",
  value: "owned_by_team",
  value_type: "string",
};

const deprecatedClaimPredicate = {
  ...claimPredicate,
  definition: "Superseded by owned_by_team.",
  deprecated_at: "2026-06-01T00:00:00Z",
  value: "owned_by",
};

const workspacePayload = {
  created_at: "2026-08-12T10:00:00Z",
  description: "Track the identity migration.",
  name: "Identity migration",
  owner_actor_id: identity.actor_id,
  owner_kind: "actor",
  tenant_id: identity.tenant_id,
  updated_at: "2026-08-12T11:00:00Z",
  workspace_id: "d0000000-0000-4000-8000-000000000001",
};

const normalizedWorkspace = {
  ...workspacePayload,
  archived_at: null,
  created_by: null,
  t_invalidated_at: null,
};

const entryPayload = {
  body_md: "Use the staged policy until migration completes.",
  created_at: "2026-08-12T10:10:00Z",
  created_by: identity.actor_id,
  entry_id: "e0000000-0000-4000-8000-000000000001",
  kind: "decision",
  reference_ids: ["f0000000-0000-4000-8000-000000000001"],
  tenant_id: identity.tenant_id,
  updated_at: "2026-08-12T10:10:00Z",
  workspace_id: workspacePayload.workspace_id,
};

const normalizedEntry = {
  ...entryPayload,
  expires_at: null,
  references_jsonb: null,
  warnings: [],
};

const contextEnvelope = {
  arc_block_note: "No ARC receipt was supplied.",
  blocks: [
    {
      items: [
        {
          payload: {
            entity_id: "e0000000-0000-4000-8000-000000000001",
            entity_type: "capability",
            matching_facts: [],
            name: "Customer identity resolution",
          },
          receipt_item_id: {
            block: "canonical",
            item_key: "e0000000-0000-4000-8000-000000000001",
            source: "catalog",
            value: "canonical-item-digest",
          },
          trust: null,
        },
      ],
      name: "canonical",
      reason: null,
      state: "success",
    },
    { items: [], name: "arc", reason: null, state: "empty" },
    {
      items: [
        {
          payload: { confidence: 0.72, label: "Authentication scope is required" },
          receipt_item_id: {
            block: "observed_claims",
            item_key: "c0000000-0000-4000-8000-000000000001",
            source: "living-memory",
            value: "claim-item-digest",
          },
          trust: {
            assertion_kind: "fact",
            attribution: null,
            authority: "tier-2-derived",
            classification: "internal",
            freshness: "2026-08-12T09:00:00Z",
            mutability: "mutable",
            source: "living-memory",
            trust: "observed",
          },
        },
      ],
      name: "observed_claims",
      reason: null,
      state: "success",
    },
    { items: [], name: "workspace", reason: null, state: "empty" },
  ],
  quality: { cacheable: true, degraded_blocks: [], reasons: [] },
  receipt_id: "r0000000-0000-4000-8000-000000000001",
  state: "complete",
};

const arcArtifact = {
  active_revision_id: null,
  artifact_id: "aa000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  created_by: { issuer: "contextplane", subject: identity.actor_id },
  kind: "policy",
  owning_scope: "tenant",
  slug: "production-safeguards",
  target_tenant_id: identity.tenant_id,
  title: "Production safeguards",
};

const arcProposalThread = {
  artifact_id: arcArtifact.artifact_id,
  latest_version: 1,
  proposal_id: "ab000000-0000-4000-8000-000000000001",
  versions: [
    {
      artifact_id: arcArtifact.artifact_id,
      created_at: "2026-08-12T10:05:00Z",
      proposal_id: "ab000000-0000-4000-8000-000000000001",
      proposal_version: 1,
      risk_classification: null,
      state: "open",
    },
  ],
};

const arcProposalVersion = {
  allowed_transitions: ["submitted"],
  artifact_id: arcArtifact.artifact_id,
  available_actions: ["edit", "validate"],
  created_at: "2026-08-12T10:05:00Z",
  frozen_at: null,
  operational_integrity_state: "pending",
  proposal_id: arcProposalThread.proposal_id,
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: null,
  risk_algorithm_version: null,
  risk_classification: null,
  source_evidence_id: "ac000000-0000-4000-8000-000000000001",
  state: "open",
};

describe("Contextplane endpoint adapters", () => {
  it("validates identity and sends the selected tenant header", async () => {
    const client = stubClient(identity);

    await expect(getWhoAmI(client, { tenantId: "northstar" })).resolves.toEqual(identity);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/whoami",
      expect.objectContaining({ tenantId: "northstar" }),
    );
  });

  it("resolves a scoped prompt into the fixed four-block context envelope", async () => {
    const client = stubClient(contextEnvelope);

    await expect(
      resolveContext(
        client,
        {
          arcReceiptId: "a0000000-0000-4000-8000-000000000001",
          intentIds: ["i0000000-0000-4000-8000-000000000001"],
          limit: 25,
          maxAgeSeconds: 3600,
          query: "Who owns identity resolution?",
          subjectEntityId: "e0000000-0000-4000-8000-000000000001",
          workspaceTerm: "identity migration",
        },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual(contextEnvelope);
    expect(client.request).toHaveBeenCalledWith("/v1/context/resolve", {
      body: {
        arc_receipt_id: "a0000000-0000-4000-8000-000000000001",
        intent_ids: ["i0000000-0000-4000-8000-000000000001"],
        limit: 25,
        max_age_s: 3600,
        query: "Who owns identity resolution?",
        subject_entity_id: "e0000000-0000-4000-8000-000000000001",
        workspace_term: "identity migration",
      },
      method: "POST",
      tenantId: "tenant-real",
    });
  });

  it("loads the receipt trace and records feedback against the exact served item", async () => {
    const receipt = {
      cacheable: true,
      intent_id: null,
      receipt_id: contextEnvelope.receipt_id,
      request_digest: "sha256:request",
      requested_by: identity.actor_id,
      resolved_at: "2026-08-12T10:00:00Z",
      state: "complete",
    };
    const receiptClient = stubClient(receipt);
    await expect(getContextReceipt(receiptClient, "receipt/with spaces")).resolves.toEqual(receipt);
    expect(receiptClient.request).toHaveBeenCalledWith("/v1/receipts/receipt%2Fwith%20spaces", {});

    const exclusions = [
      { block: "workspace", item_key: "checkpoint-2", reason: "outside audience" },
    ];
    await expect(
      getContextReceiptExclusions(stubClient({ exclusions }), contextEnvelope.receipt_id),
    ).resolves.toEqual(exclusions);

    const references = [
      {
        classification: "internal",
        external_id: "build-42",
        kind: "build",
        source_namespace: "acme/platform",
        source_system: "control-plane",
      },
    ];
    await expect(
      getContextReceiptReferences(stubClient({ references }), contextEnvelope.receipt_id),
    ).resolves.toEqual(references);

    const feedback = {
      content_digest: "sha256:feedback",
      created_at: "2026-08-12T10:05:00Z",
      feedback_id: "f0000000-0000-4000-8000-000000000001",
      kind: "item_specific",
      learning_eligible: true,
      rating: "relevant",
      receipt_id: contextEnvelope.receipt_id,
      receipt_item_id: "canonical-item-digest",
      replayed: false,
    };
    const feedbackClient = stubClient(feedback);
    await expect(
      recordContextFeedback(feedbackClient, {
        idempotencyKey: "context-lab-run-1",
        rating: "relevant",
        receiptId: contextEnvelope.receipt_id,
        receiptItemId: "canonical-item-digest",
        reporterId: identity.actor_id,
      }),
    ).resolves.toEqual(feedback);
    expect(feedbackClient.request).toHaveBeenCalledWith("/v1/context/feedback", {
      body: {
        idempotency_key: "context-lab-run-1",
        kind: "item_specific",
        learning_eligible: true,
        rating: "relevant",
        receipt_id: contextEnvelope.receipt_id,
        receipt_item_id: "canonical-item-digest",
        reporter_id: identity.actor_id,
        reporter_type: "human",
      },
      method: "POST",
    });
  });

  it("lists sessions using the service-supported since and limit parameters", async () => {
    const client = stubClient([session]);

    await expect(
      listSessions(client, { limit: 50, since: "2026-08-01T00:00:00.000Z" }),
    ).resolves.toEqual([session]);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/sessions?since=2026-08-01T00%3A00%3A00.000Z&limit=50",
      {},
    );
  });

  it("replays an encoded session with a stable sequence cursor and kind filter", async () => {
    const client = stubClient([event]);

    await expect(
      listSessionEvents(client, "session/with spaces", {
        cursor: 2,
        kind: "agent_action",
        limit: 100,
        order: "asc",
      }),
    ).resolves.toEqual([event]);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/sessions/session%2Fwith%20spaces/events?cursor=2&kind=agent_action&limit=100&order=asc",
      {},
    );
  });

  it("lists structurally matched claims with the exact service filter vocabulary", async () => {
    const client = stubClient([memoryClaim]);

    await expect(
      listMemoryClaims(
        client,
        {
          asOf: "2026-08-01T00:00:00Z",
          category: "ownership",
          limit: 50,
          minConfidence: 0.5,
          namespacePrefix: "platform.identity",
          persona: "architect",
          predicate: "owned_by_team",
          subjectEntityId: memoryClaim.subject_entity_id,
        },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual([memoryClaim]);
    expect(client.request).toHaveBeenCalledWith(
      `/v1/memory/claims?subject_entity_id=${memoryClaim.subject_entity_id}&predicate=owned_by_team&category=ownership&namespace_prefix=platform.identity&min_confidence=0.5&as_of=2026-08-01T00%3A00%3A00Z&persona=architect&limit=50`,
      { tenantId: "tenant-real" },
    );
  });

  it("searches claims separately from structural lookup and loads encoded claim provenance", async () => {
    const searchClient = stubClient([memoryClaim]);
    await expect(
      searchMemoryClaims(searchClient, {
        category: "ownership",
        minConfidence: 0.8,
        namespacePrefix: "platform.identity",
        persona: "l3_engineer",
        query: "who owns identity",
        topK: 50,
      }),
    ).resolves.toEqual([memoryClaim]);
    expect(searchClient.request).toHaveBeenCalledWith(
      "/v1/memory/claims/search?q=who+owns+identity&namespace_prefix=platform.identity&category=ownership&min_confidence=0.8&persona=l3_engineer&top_k=50",
      {},
    );

    const detailClient = stubClient(memoryClaim);
    await expect(getMemoryClaim(detailClient, "claim/with spaces", "agent")).resolves.toEqual(
      memoryClaim,
    );
    expect(detailClient.request).toHaveBeenCalledWith(
      "/v1/memory/claims/claim%2Fwith%20spaces?persona=agent",
      {},
    );

    const historyClient = stubClient({ items: [memoryHistoryItem] });
    await expect(getMemoryClaimHistory(historyClient, "claim/with spaces")).resolves.toEqual({
      items: [memoryHistoryItem],
    });
    expect(historyClient.request).toHaveBeenCalledWith(
      "/v1/memory/claims/claim%2Fwith%20spaces/history",
      {},
    );
  });

  it("loads whole-queue curation counts separately from an opaque cursor page", async () => {
    const pageClient = stubClient({ items: [curationItem], next_cursor: "opaque-next" });
    await expect(
      listMemoryCurationQueue(
        pageClient,
        { cursor: "opaque-current", pageSize: 100 },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual({ items: [curationItem], next_cursor: "opaque-next" });
    expect(pageClient.request).toHaveBeenCalledWith(
      "/v1/memory/curation-queue?cursor=opaque-current&page_size=100",
      { tenantId: "tenant-real" },
    );

    const countsClient = stubClient({ counts: { contested: 2, unlinked: 3 } });
    await expect(getMemoryCurationCounts(countsClient)).resolves.toEqual({
      counts: { contested: 2, unlinked: 3 },
    });
    expect(countsClient.request).toHaveBeenCalledWith("/v1/memory/curation-queue?counts=true", {});
  });

  it("asserts a claim under a caller-owned idempotency key and omits unset optional fields", async () => {
    const client = stubClient(assertionReceipt);

    await expect(
      assertMemoryClaim(
        client,
        {
          evidence: [
            {
              excerpt: "Confirmed in the August ownership review.",
              kind: "curator",
              ref: "review-114",
            },
            { kind: "commit", ref: "9f2c1ab" },
          ],
          idempotencyKey: "assert-1",
          predicate: "owned_by_team",
          subjectReference: "system:github/identity-service",
          value: "trust-engineering",
        },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual(assertionReceipt);
    expect(client.request).toHaveBeenCalledWith("/v1/memory/claims", {
      body: {
        evidence: [
          {
            excerpt: "Confirmed in the August ownership review.",
            kind: "curator",
            ref: "review-114",
          },
          { kind: "commit", ref: "9f2c1ab" },
        ],
        predicate: "owned_by_team",
        subject_reference: "system:github/identity-service",
        value: "trust-engineering",
      },
      headers: { "Idempotency-Key": "assert-1" },
      method: "POST",
      tenantId: "tenant-real",
    });
  });

  it("keeps an explicitly cleared claim scope distinct from an unset one", async () => {
    const client = stubClient(assertionReceipt);

    await assertMemoryClaim(client, {
      assertedValidFrom: "2026-08-01T00:00:00.000Z",
      assertedValidTo: null,
      evidence: [{ kind: "incident", ref: "INC-9" }],
      idempotencyKey: "assert-2",
      namespace: "platform.identity",
      predicate: "owned_by_team",
      subjectReference: "system:github/identity-service",
      value: { team: "trust-engineering" },
      visibility: "tenant-shared",
    });
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/claims",
      expect.objectContaining({
        body: {
          asserted_valid_from: "2026-08-01T00:00:00.000Z",
          asserted_valid_to: null,
          evidence: [{ kind: "incident", ref: "INC-9" }],
          namespace: "platform.identity",
          predicate: "owned_by_team",
          subject_reference: "system:github/identity-service",
          value: { team: "trust-engineering" },
          visibility: "tenant-shared",
        },
      }),
    );
  });

  it("reports an assertion the service stored without resolving its subject", async () => {
    const client = stubClient({ ...assertionReceipt, status: "unlinked", subject_entity_id: null });

    await expect(
      assertMemoryClaim(client, {
        evidence: [{ kind: "curator", ref: "review-114" }],
        idempotencyKey: "assert-3",
        predicate: "owned_by_team",
        subjectReference: "system:github/unknown-service",
        value: "trust-engineering",
      }),
    ).resolves.toMatchObject({ status: "unlinked", subject_entity_id: null });
  });

  it("lists every organization predicate including deprecated ones", async () => {
    const client = stubClient([claimPredicate, deprecatedClaimPredicate]);

    await expect(listClaimPredicates(client, { tenantId: "tenant-real" })).resolves.toEqual([
      claimPredicate,
      deprecatedClaimPredicate,
    ]);
    expect(client.request).toHaveBeenCalledWith("/v1/operator/claim-predicates", {
      tenantId: "tenant-real",
    });
  });

  it("walks dependencies without sending filters the endpoint does not accept", async () => {
    const client = stubClient(dependencyTraversal);

    await expect(
      getRelationshipDependencies(
        client,
        "capability/with spaces",
        { asOf: dependencyTraversal.as_of, depth: 2 },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual(dependencyTraversal);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities/capability%2Fwith%20spaces/dependencies?depth=2&as_of=2026-08-12T10%3A00%3A00Z",
      { tenantId: "tenant-real" },
    );
  });

  it("walks dependents with one comma-separated relationship filter", async () => {
    const client = stubClient(relationshipTraversal);

    await expect(
      getRelationshipDependents(client, relationshipEdge.src_entity_id, {
        asOf: dependencyTraversal.as_of,
        asOfVersion: "2.4.0",
        depth: 3,
        edgeTypes: ["depends_on", "integrates_with"],
      }),
    ).resolves.toEqual(relationshipTraversal);
    expect(client.request).toHaveBeenCalledWith(
      `/v1/capabilities/${relationshipEdge.src_entity_id}/dependents?depth=3&edge_types=depends_on%2Cintegrates_with&as_of=2026-08-12T10%3A00%3A00Z&as_of_version=2.4.0`,
      {},
    );
  });

  it("walks a directional blast radius and omits an empty edge filter", async () => {
    const client = stubClient({ ...relationshipTraversal, direction: "forward" });

    await getRelationshipBlastRadius(client, relationshipEdge.src_entity_id, {
      asOfVersion: "2.4.0",
      depth: 5,
      direction: "forward",
      edgeTypes: [],
    });

    expect(client.request).toHaveBeenCalledWith(
      `/v1/capabilities/${relationshipEdge.src_entity_id}/blast-radius?direction=forward&depth=5&as_of_version=2.4.0`,
      {},
    );
  });

  it("pages provider and consumer projections without decoding opaque cursors", async () => {
    const payload = {
      edges: [relationshipEdge],
      next_cursor: "opaque/next cursor",
      nodes: [relationshipEntity],
    };
    const providerClient = stubClient(payload);
    await expect(
      getProviderRelationshipProjection(
        providerClient,
        {
          asOf: "2026-08-12T10:00:00Z",
          cursor: "opaque/current cursor",
          pageSize: 100,
        },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual(payload);
    expect(providerClient.request).toHaveBeenCalledWith(
      "/v1/graph/provider?cursor=opaque%2Fcurrent+cursor&page_size=100&as_of=2026-08-12T10%3A00%3A00Z",
      { tenantId: "tenant-real" },
    );

    const consumerClient = stubClient({ ...payload, next_cursor: null });
    await getConsumerRelationshipProjection(consumerClient, { pageSize: 20 });
    expect(consumerClient.request).toHaveBeenCalledWith("/v1/graph/consumer?page_size=20", {});
  });

  it("retains the aggregate usage semantics published by the service", async () => {
    const payload = {
      days: 30,
      end: "2026-08-12",
      start: "2026-07-14",
      surfaces: [
        {
          actor_days: 12,
          calls: 44,
          distinct_actors: null,
          distinct_actors_unavailable_reason: "outside retention",
          error_calls: 2,
          ok_calls: 42,
          payload_bytes: 1200,
          payload_tokens: null,
          surface: "mcp",
          worst_daily_p95_ms: 310,
        },
      ],
    };
    const client = stubClient(payload);

    await expect(
      getUsageSummary(client, { from: "2026-07-14", to: "2026-08-12" }),
    ).resolves.toEqual(payload);
  });

  it("loads the maximum service-ranked tool list and validates nullable latency", async () => {
    const payload = {
      end: "2026-08-12",
      start: "2026-07-14",
      tools: [
        {
          actor_days: 4,
          calls: 10,
          error_calls: 1,
          ok_calls: 9,
          tool: "record_session_event",
          worst_daily_p95_ms: null,
        },
      ],
    };
    const client = stubClient(payload);

    await expect(getToolUsage(client, { from: payload.start, to: payload.end })).resolves.toEqual(
      payload,
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/usage/tools?from=2026-07-14&limit=200&to=2026-08-12",
      {},
    );
  });

  it("loads capability rankings and exact daily usage points", async () => {
    const capabilityPayload = {
      capabilities: [{ actor_days: 4, calls: 9, capability_id: "capability-a" }],
      end: "2026-08-12",
      start: "2026-07-14",
    };
    const capabilityClient = stubClient(capabilityPayload);
    await expect(
      getCapabilityUsage(capabilityClient, {
        from: capabilityPayload.start,
        to: capabilityPayload.end,
      }),
    ).resolves.toEqual(capabilityPayload);
    expect(capabilityClient.request).toHaveBeenCalledWith(
      "/v1/admin/usage/capabilities?from=2026-07-14&limit=200&to=2026-08-12",
      {},
    );

    const seriesPayload = {
      end: "2026-08-12",
      points: [
        {
          calls: 5,
          day: "2026-08-12",
          distinct_actors: 2,
          error_calls: 1,
          ok_calls: 4,
          p50_ms: 40,
          p95_ms: 90,
          p99_ms: null,
          surface: "rest",
        },
      ],
      start: "2026-07-14",
    };
    const seriesClient = stubClient(seriesPayload);
    await expect(
      getDailyUsageSeries(seriesClient, { from: seriesPayload.start, to: seriesPayload.end }),
    ).resolves.toEqual(seriesPayload);
  });

  it("creates and loads ARC artifact families through the versioned authoring surface", async () => {
    const createClient = stubClient(arcArtifact);
    await expect(
      createArcArtifactFamily(
        createClient,
        {
          idempotencyKey: "arc-create-1",
          kind: "policy",
          owningScope: "tenant",
          slug: arcArtifact.slug,
          targetTenantId: identity.tenant_id,
          title: arcArtifact.title,
        },
        { tenantId: identity.tenant_id },
      ),
    ).resolves.toEqual(arcArtifact);
    expect(createClient.request).toHaveBeenCalledWith("/v1/arc/artifacts", {
      body: {
        kind: "policy",
        owning_scope: "tenant",
        slug: arcArtifact.slug,
        target_tenant_id: identity.tenant_id,
        title: arcArtifact.title,
      },
      headers: { "Idempotency-Key": "arc-create-1" },
      method: "POST",
      tenantId: identity.tenant_id,
    });

    const detailClient = stubClient(arcArtifact);
    await expect(getArcArtifactFamily(detailClient, "artifact/with spaces")).resolves.toEqual(
      arcArtifact,
    );
    expect(detailClient.request).toHaveBeenCalledWith(
      "/v1/arc/artifacts/artifact%2Fwith%20spaces",
      {},
    );
  });

  it("lists ARC artifact families with opaque cursors and server-side filters", async () => {
    const page = { items: [arcArtifact], next_cursor: "opaque-next" };
    const client = stubClient(page);

    await expect(
      listArcArtifactFamilies(
        client,
        {
          cursor: "opaque current",
          kind: "policy",
          owningScope: "tenant",
          pageSize: 25,
          query: "production safeguards",
        },
        { tenantId: identity.tenant_id },
      ),
    ).resolves.toEqual(page);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/arc/artifacts?cursor=opaque+current&kind=policy&owning_scope=tenant&page_size=25&q=production+safeguards",
      { tenantId: identity.tenant_id },
    );
  });

  it("opens and inspects ARC proposal, review, activation, and receipt evidence", async () => {
    const openClient = stubClient(arcProposalVersion);
    await expect(
      openArcProposal(openClient, arcArtifact.artifact_id, {
        idempotencyKey: "arc-proposal-1",
        sourceEvidenceId: arcProposalVersion.source_evidence_id,
      }),
    ).resolves.toEqual(arcProposalVersion);
    expect(openClient.request).toHaveBeenCalledWith(
      `/v1/arc/artifacts/${arcArtifact.artifact_id}/proposals`,
      {
        body: { source_evidence_id: arcProposalVersion.source_evidence_id },
        headers: { "Idempotency-Key": "arc-proposal-1" },
        method: "POST",
      },
    );

    await expect(
      getArcProposalThread(stubClient(arcProposalThread), arcProposalThread.proposal_id),
    ).resolves.toEqual(arcProposalThread);
    await expect(
      getArcProposalVersion(stubClient(arcProposalVersion), arcProposalThread.proposal_id, 1),
    ).resolves.toEqual(arcProposalVersion);
    const patchClient = stubClient(arcProposalVersion);
    const patch = {
      field_provenance: [],
      semantics: {
        applicability: [],
        applicability_baseline_version: "v1",
        approved_retention_floor_days: 30,
        artifact_id: arcArtifact.artifact_id,
        content_classification: "internal" as const,
        detail_audience: "agent_and_human" as const,
        directives: [],
        initial_freshness_basis: "revision_pinned_only" as const,
        kind: "directive_bundle" as const,
        materialiser_profile: "arc-default",
        materialiser_version: "1",
        owning_scope: "tenant" as const,
        owning_tenant_id: identity.tenant_id,
        profile: "arc_artifact_semantics_v2" as const,
        projection_schema_version: 2,
        review_expires_at: "2026-09-12T10:00:00Z",
        reviewed_baseline_revision_id: null,
        revision_id: "ad000000-0000-4000-8000-000000000001",
        source_approval_evidence_digest: "a".repeat(64),
        source_content_digest: "b".repeat(64),
        source_revision_locator: "policy-v1",
        source_system: "policy-repository",
        visibility: "standard" as const,
      },
    };
    await expect(
      editArcProposalVersion(patchClient, arcProposalThread.proposal_id, 1, patch),
    ).resolves.toEqual(arcProposalVersion);
    expect(patchClient.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${arcProposalThread.proposal_id}/versions/1`,
      { body: patch, method: "PATCH" },
    );
    await expect(
      validateArcProposalVersion(
        stubClient({ errors: [], valid: true }),
        arcProposalThread.proposal_id,
        1,
      ),
    ).resolves.toEqual({ errors: [], valid: true });

    const structuredPayload = { eligible: false, predicates: [] };
    await expect(
      getArcReviewPackage(stubClient(structuredPayload), arcProposalThread.proposal_id, 1),
    ).resolves.toEqual(structuredPayload);
    await expect(
      getArcObservationStatus(stubClient(structuredPayload), arcProposalThread.proposal_id, 1),
    ).resolves.toEqual(structuredPayload);
    await expect(
      getArcActivationEligibility(stubClient(structuredPayload), "revision/with spaces"),
    ).resolves.toEqual(structuredPayload);
    await expect(
      getArcResolutionReceipt(stubClient(structuredPayload), "receipt/with spaces"),
    ).resolves.toEqual(structuredPayload);
    await expect(
      explainArcResolutionReceipt(stubClient(structuredPayload), "receipt/with spaces"),
    ).resolves.toEqual(structuredPayload);
  });

  it("lists tenant-owned promotion proposals with state and opaque cursor filters", async () => {
    const client = stubClient({ items: [proposal], next_cursor: "opaque-next" });

    await expect(
      listPromotionProposals(
        client,
        { cursor: "opaque-current", pageSize: 25, state: "open" },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual({ items: [proposal], next_cursor: "opaque-next" });
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/promotion-proposals?state=open&cursor=opaque-current&page_size=25",
      { tenantId: "tenant-real" },
    );
  });

  it("loads encoded proposal detail and submits exact accept or reject decisions", async () => {
    const detailClient = stubClient(proposal);
    await expect(getPromotionProposal(detailClient, "proposal/with spaces")).resolves.toEqual(
      proposal,
    );
    expect(detailClient.request).toHaveBeenCalledWith(
      "/v1/memory/promotion-proposals/proposal%2Fwith%20spaces",
      {},
    );

    const acceptClient = stubClient({
      promotion_id: "promotion-1",
      proposal: { ...proposal, state: "accepted" },
    });
    await reviewPromotionProposal(acceptClient, proposal.proposal_id, { state: "accepted" });
    expect(acceptClient.request).toHaveBeenCalledWith(
      `/v1/memory/promotion-proposals/${proposal.proposal_id}`,
      { body: { state: "accepted" }, method: "PATCH" },
    );

    const rejectClient = stubClient({
      promotion_id: null,
      proposal: { ...proposal, state: "rejected" },
    });
    await reviewPromotionProposal(rejectClient, proposal.proposal_id, {
      reason: "incorrect owner",
      state: "rejected",
    });
    expect(rejectClient.request).toHaveBeenCalledWith(
      `/v1/memory/promotion-proposals/${proposal.proposal_id}`,
      { body: { reason: "incorrect owner", state: "rejected" }, method: "PATCH" },
    );
  });

  it("preserves an explicit null amendment separately from an omitted amendment", async () => {
    const client = stubClient({
      promotion_id: "promotion-1",
      proposal: { ...proposal, state: "amended" },
    });

    await reviewPromotionProposal(client, proposal.proposal_id, {
      amendedValue: null,
      state: "accepted",
    });

    expect(client.request).toHaveBeenCalledWith(expect.any(String), {
      body: { amended_value: null, state: "accepted" },
      method: "PATCH",
    });
  });

  it("lists, loads, creates, and archives workspaces with opaque cursor state", async () => {
    const listClient = stubClient({ items: [workspacePayload], next_cursor: "opaque-next" });
    await expect(
      listWorkspaces(
        listClient,
        { cursor: "opaque-current", includeArchived: true },
        { tenantId: "tenant-real" },
      ),
    ).resolves.toEqual({ items: [normalizedWorkspace], next_cursor: "opaque-next" });
    expect(listClient.request).toHaveBeenCalledWith(
      "/v1/workspaces?include_archived=true&cursor=opaque-current",
      { tenantId: "tenant-real" },
    );

    const detailClient = stubClient(workspacePayload);
    await expect(getWorkspace(detailClient, "workspace/with spaces")).resolves.toEqual(
      normalizedWorkspace,
    );
    expect(detailClient.request).toHaveBeenCalledWith(
      "/v1/workspaces/workspace%2Fwith%20spaces",
      {},
    );

    const createClient = stubClient(workspacePayload);
    await createWorkspace(createClient, {
      description: null,
      name: "Identity migration",
      ownerKind: "actor",
    });
    expect(createClient.request).toHaveBeenCalledWith("/v1/workspaces", {
      body: {
        description: null,
        name: "Identity migration",
        owner_kind: "actor",
      },
      method: "POST",
    });

    const updateClient = stubClient({
      ...workspacePayload,
      archived_at: "2026-08-12T12:00:00Z",
    });
    await updateWorkspace(updateClient, workspacePayload.workspace_id, {
      archivedAt: "2026-08-12T12:00:00Z",
    });
    expect(updateClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}`,
      { body: { archived_at: "2026-08-12T12:00:00Z" }, method: "PATCH" },
    );

    const deleteClient = stubClient(null);
    await expect(
      deleteWorkspace(deleteClient, workspacePayload.workspace_id),
    ).resolves.toBeUndefined();
    expect(deleteClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}`,
      { method: "DELETE" },
    );
  });

  it("lists and searches workspace entries without decoding service cursors", async () => {
    const listClient = stubClient({ items: [entryPayload], next_cursor: "entry-next" });
    await expect(
      listWorkspaceEntries(listClient, workspacePayload.workspace_id, {
        cursor: "entry-current",
        kind: "decision",
      }),
    ).resolves.toEqual({ items: [normalizedEntry], next_cursor: "entry-next" });
    expect(listClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}/entries?kind=decision&cursor=entry-current`,
      {},
    );

    const searchClient = stubClient({
      items: [entryPayload],
      next_cursor: null,
      total_count: null,
    });
    await expect(
      searchWorkspaceEntries(searchClient, {
        kind: "decision",
        ownerActorId: identity.actor_id,
        query: "policy decision",
        referenceIds: [
          "f0000000-0000-4000-8000-000000000001",
          "f0000000-0000-4000-8000-000000000002",
        ],
      }),
    ).resolves.toEqual({ items: [normalizedEntry], next_cursor: null, total_count: null });
    expect(searchClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/search?q=policy+decision&kind=decision&owner_actor_id=${identity.actor_id}&reference_ids=f0000000-0000-4000-8000-000000000001%2Cf0000000-0000-4000-8000-000000000002`,
      {},
    );
  });

  it("creates, updates, and removes workspace entries while normalizing absent warnings", async () => {
    const warnedEntry = {
      ...entryPayload,
      warnings: [{ categories: ["PII_EMAIL"], field: "body_md" }],
    };
    const createClient = stubClient(warnedEntry);
    await expect(
      createWorkspaceEntry(createClient, workspacePayload.workspace_id, {
        bodyMarkdown: entryPayload.body_md,
        expiresAt: null,
        kind: "decision",
        referenceIds: entryPayload.reference_ids,
      }),
    ).resolves.toMatchObject({ warnings: warnedEntry.warnings });
    expect(createClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}/entries`,
      {
        body: {
          body_md: entryPayload.body_md,
          expires_at: null,
          kind: "decision",
          reference_ids: entryPayload.reference_ids,
        },
        method: "POST",
      },
    );

    const updateClient = stubClient({ ...entryPayload, body_md: "Updated decision." });
    await updateWorkspaceEntry(updateClient, workspacePayload.workspace_id, entryPayload.entry_id, {
      bodyMarkdown: "Updated decision.",
      referenceIds: [],
    });
    expect(updateClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}/entries/${entryPayload.entry_id}`,
      {
        body: { body_md: "Updated decision.", reference_ids: [] },
        method: "PATCH",
      },
    );

    const deleteClient = stubClient(null);
    await deleteWorkspaceEntry(deleteClient, workspacePayload.workspace_id, entryPayload.entry_id);
    expect(deleteClient.request).toHaveBeenCalledWith(
      `/v1/workspaces/${workspacePayload.workspace_id}/entries/${entryPayload.entry_id}`,
      { method: "DELETE" },
    );
  });

  it("refuses malformed network data before it enters feature models", async () => {
    await expect(
      listSessions(stubClient([{ ...session, event_count: "three" }]), {}),
    ).rejects.toThrow(/event_count is not a number/i);
    await expect(getWhoAmI(stubClient({ ...identity, roles: [7] }))).rejects.toThrow(
      /role is not text/i,
    );
    await expect(
      getUsageSummary(
        stubClient({
          days: 1,
          end: "2026-08-12",
          start: "2026-08-12",
          surfaces: [{ surface: "other" }],
        }),
        {
          from: "2026-08-12",
          to: "2026-08-12",
        },
      ),
    ).rejects.toThrow(/unknown usage surface/i);
    await expect(
      listPromotionProposals(
        stubClient({ items: [{ ...proposal, high_impact: "yes" }], next_cursor: null }),
      ),
    ).rejects.toThrow(/high_impact is not a boolean/i);
    await expect(
      getPromotionProposal(stubClient({ ...proposal, state: "pending" }), proposal.proposal_id),
    ).rejects.toThrow(/unknown proposal state/i);
    await expect(
      listWorkspaces(
        stubClient({
          items: [{ ...workspacePayload, owner_kind: "organization" }],
          next_cursor: null,
        }),
      ),
    ).rejects.toThrow(/unknown workspace owner kind/i);
    await expect(
      listWorkspaceEntries(
        stubClient({ items: [{ ...entryPayload, warnings: "warn" }], next_cursor: null }),
        workspacePayload.workspace_id,
      ),
    ).rejects.toThrow(/warnings is not an array/i);
    await expect(
      listMemoryClaims(stubClient([{ ...memoryClaim, citations: [{ kind: "artifact" }] }])),
    ).rejects.toThrow(/ref is not a string/i);
    await expect(
      getMemoryCurationCounts(stubClient({ counts: { unlinked: 1.5 } })),
    ).rejects.toThrow(/count for unlinked is not an integer/i);
    await expect(
      getRelationshipDependencies(stubClient({ ...dependencyTraversal, depth: 2.5 }), "identity"),
    ).rejects.toThrow(/depth is not an integer/i);
    await expect(
      getRelationshipDependents(
        stubClient({
          ...relationshipTraversal,
          version_satisfied: { [relationshipEdge.edge_id]: "unknown" },
        }),
        "identity",
      ),
    ).rejects.toThrow(/version agreement.*is not a boolean/i);
    await expect(
      getRelationshipBlastRadius(
        stubClient({ ...relationshipTraversal, direction: "sideways" }),
        "identity",
      ),
    ).rejects.toThrow(/unknown relationship direction/i);
    await expect(
      getRelationshipDependencies(
        stubClient({
          ...dependencyTraversal,
          edges: [{ ...relationshipEdge, properties: [] }],
        }),
        "identity",
      ),
    ).rejects.toThrow(/edge properties are not an object or null/i);
    await expect(
      getRelationshipDependents(
        stubClient({
          ...relationshipTraversal,
          nodes: [{ ...relationshipEntity, name: 7 }],
        }),
        "identity",
      ),
    ).rejects.toThrow(/name is not a string/i);
    await expect(
      getProviderRelationshipProjection(stubClient({ edges: [], next_cursor: 42, nodes: [] })),
    ).rejects.toThrow(/next_cursor is not nullable text/i);
    await expect(
      resolveContext(
        stubClient({ ...contextEnvelope, blocks: [...contextEnvelope.blocks].reverse() }),
        {
          query: "identity",
        },
      ),
    ).rejects.toThrow(/not in contract order/i);
    await expect(
      resolveContext(
        stubClient({
          ...contextEnvelope,
          blocks: contextEnvelope.blocks.map((block, index) =>
            index === 0 ? { ...block, state: "unknown" } : block,
          ),
        }),
        { query: "identity" },
      ),
    ).rejects.toThrow(/unknown context block state/i);
  });
});
