import type { ArcOwningScope } from "./arcVerifiers";
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { requiredInteger, requiredRecord, requiredString, stringArray } from "./parse";

/**
 * What ARC is allowed to read, and what its observations are replayed against.
 *
 * ## Why these three sit together
 *
 * None of them governs a single change. Each is a **standing grant** that every
 * later admission inherits:
 *
 * - A **connector** decides which schemes, hosts, media types and sizes ARC may
 *   fetch — and, in `allowed_verifier_ids`, *who may approve what it fetches*.
 * - An **upload policy** does the same for material pushed in rather than
 *   fetched.
 * - A **replay corpus** decides what "the change behaved correctly" is measured
 *   against, for every qualification that cites that digest.
 *
 * So the blast radius of a registration is every future admission through it,
 * which is what makes these the least obviously consequential controls in the
 * governance surface: nothing about registering a connector looks like it
 * changes what governance concludes, and it does.
 *
 * Like every other ARC admin object, none of these can be read back — see
 * E14-T1. A registration is invisible from the moment it is made.
 */

export interface ArcSourceConnector {
  allowed_hosts: readonly string[];
  allowed_media_types: readonly string[];
  allowed_schemes: readonly string[];
  /** Who may approve material this connector fetches. The widest field here. */
  allowed_verifier_ids: readonly string[];
  connector_id: string;
  max_bytes: number;
  owning_scope: ArcOwningScope;
  registered_at: string;
}

export interface ArcSourceUploadPolicy {
  allowed_media_types: readonly string[];
  allowed_verifier_ids: readonly string[];
  max_bytes: number;
  owning_scope: ArcOwningScope;
  policy_id: string;
  registered_at: string;
}

export interface ArcReplayCorpus {
  approved_at: string;
  corpus_digest: string;
  generator_version: string;
  owning_scope: ArcOwningScope;
}

export interface ArcSourceConnectorInput {
  allowed_hosts: readonly string[];
  allowed_media_types: readonly string[];
  allowed_schemes: readonly string[];
  allowed_verifier_ids: readonly string[];
  connector_id: string;
  credential_ref?: string;
  max_bytes: number;
  owning_scope: ArcOwningScope;
  target_tenant_id?: string;
}

export interface ArcSourceUploadPolicyInput {
  allowed_media_types: readonly string[];
  allowed_verifier_ids: readonly string[];
  max_bytes: number;
  owning_scope: ArcOwningScope;
  policy_id: string;
  target_tenant_id?: string;
}

export interface ArcReplayCorpusInput {
  corpus_digest: string;
  generator_version: string;
  owning_scope: ArcOwningScope;
  target_tenant_id?: string;
}

/** Register what one connector may fetch, and who may approve it. */
export async function registerArcSourceConnector(
  client: ContextplaneClient,
  input: ArcSourceConnectorInput,
  context: ContextplaneRequestOptions = {},
): Promise<ArcSourceConnector> {
  const payload = await client.request("/v1/arc/admin/source-connectors", {
    ...context,
    body: input,
    method: "POST",
  });
  const item = requiredRecord(payload, "Source connector");
  return {
    allowed_hosts: stringArray(item.allowed_hosts, "Source connector allowed_hosts"),
    allowed_media_types: stringArray(
      item.allowed_media_types,
      "Source connector allowed_media_types",
    ),
    allowed_schemes: stringArray(item.allowed_schemes, "Source connector allowed_schemes"),
    allowed_verifier_ids: stringArray(
      item.allowed_verifier_ids,
      "Source connector allowed_verifier_ids",
    ),
    connector_id: requiredString(item, "connector_id", "Source connector connector_id"),
    max_bytes: requiredInteger(item, "max_bytes"),
    owning_scope: requiredString(
      item,
      "owning_scope",
      "Source connector owning_scope",
    ) as ArcOwningScope,
    registered_at: requiredString(item, "registered_at", "Source connector registered_at"),
  };
}

/** Register what may be uploaded rather than fetched, and who may approve it. */
export async function registerArcSourceUploadPolicy(
  client: ContextplaneClient,
  input: ArcSourceUploadPolicyInput,
  context: ContextplaneRequestOptions = {},
): Promise<ArcSourceUploadPolicy> {
  const payload = await client.request("/v1/arc/admin/source-upload-policies", {
    ...context,
    body: input,
    method: "POST",
  });
  const item = requiredRecord(payload, "Upload policy");
  return {
    allowed_media_types: stringArray(item.allowed_media_types, "Upload policy allowed_media_types"),
    allowed_verifier_ids: stringArray(
      item.allowed_verifier_ids,
      "Upload policy allowed_verifier_ids",
    ),
    max_bytes: requiredInteger(item, "max_bytes"),
    owning_scope: requiredString(item, "owning_scope", "Upload policy owning_scope") as ArcOwningScope,
    policy_id: requiredString(item, "policy_id", "Upload policy policy_id"),
    registered_at: requiredString(item, "registered_at", "Upload policy registered_at"),
  };
}

/**
 * Approve a replay corpus by digest.
 *
 * The digest is the corpus. Approving one decides what every later
 * qualification citing it is measured against, and a different corpus with the
 * same generator version is a different digest and a separate approval — which
 * is the property that keeps "it behaved correctly" meaning one thing.
 */
export async function approveArcReplayCorpus(
  client: ContextplaneClient,
  input: ArcReplayCorpusInput,
  context: ContextplaneRequestOptions = {},
): Promise<ArcReplayCorpus> {
  const payload = await client.request("/v1/arc/admin/observation-replay-corpora", {
    ...context,
    body: input,
    method: "POST",
  });
  const item = requiredRecord(payload, "Replay corpus");
  return {
    approved_at: requiredString(item, "approved_at", "Replay corpus approved_at"),
    corpus_digest: requiredString(item, "corpus_digest", "Replay corpus corpus_digest"),
    generator_version: requiredString(item, "generator_version", "Replay corpus generator_version"),
    owning_scope: requiredString(item, "owning_scope", "Replay corpus owning_scope") as ArcOwningScope,
  };
}
