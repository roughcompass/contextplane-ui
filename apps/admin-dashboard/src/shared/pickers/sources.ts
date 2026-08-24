import type { ResourceOption, ResourcePage, ResourceQuery } from "@repo/ui/primitives";

import {
  listArcGovernanceOptions,
  listArcRevisions,
  listCapabilities,
  listIntents,
  listMemorySources,
  listPrincipals,
  listReceipts,
  listTenants,
  type ArcGovernanceCollection,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type ReachableTenant,
} from "../api";

/**
 * One picker source per collection a server-assigned identifier can come from.
 *
 * ## Why they are together
 *
 * ADR 0018 says such a field is chosen from a list and never typed. Sixty-odd
 * fields across fifteen files name one of nine collections, and a source written
 * per screen would be nine adapters written six times each — with the search,
 * the paging and the "what does a row look like to a chooser" decision made
 * differently every time.
 *
 * What a row looks like is the part worth deciding once. A picker's label is the
 * thing a reader recognises and its description is what tells two similar rows
 * apart, so those choices are per *collection* and not per screen: an actor is
 * its display name and its kind wherever it is being chosen.
 *
 * ## Two paging shapes, because the service has two
 *
 * The ARC governance collections are unpaginated — one request returns
 * everything — so filtering their result client-side narrows something the
 * caller holds, and a "no match" is true about the whole set. Everything else is
 * cursor-paginated, and there the cursor goes back untouched and the picker's
 * own warning applies as written: filtering a page reports "no match" about a
 * collection it never asked.
 *
 * ## The nine, and what is deliberately not here
 *
 * There is no source for a checkpoint, a qualification, a provider, an admission
 * policy or a draft. Each of those is reachable only by an id the caller must
 * already hold, and a picker over a collection that does not exist would be a
 * dropdown that is always empty — which reads as "there are none" rather than as
 * "nothing can list these". Those fields stay text boxes and say why.
 */

export type PickerSource = (query: ResourceQuery) => Promise<ResourcePage>;

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/**
 * A principal, shown by name with its kind.
 *
 * An undeclared principal says so rather than showing a blank kind: choosing an
 * actor is often a decision about accountability, and *"nobody has said what
 * this is"* is a fact the chooser needs.
 */
export function principalSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => {
    const page = await listPrincipals(
      client,
      { ...(query.cursor ? { cursor: query.cursor } : {}), pageSize: 50 },
      context,
    );
    return {
      items: page.items
        .filter((entry) => contains(entry.display_name, query.search) || contains(entry.actor_id, query.search))
        .map(
          (entry): ResourceOption => ({
            description: entry.is_declared
              ? entry.actor_kind
              : `${entry.actor_kind} — nobody has declared this principal`,
            label: entry.display_name,
            value: entry.actor_id,
          }),
        ),
      next_cursor: page.next_cursor,
    };
  };
}

/**
 * A registered memory source, shown by its id with its authority tier.
 *
 * A source has no display name — it *is* its id, which the ingest contract
 * treats as the caller's own chosen handle. So the label is the id and the
 * description is the tier, which is what tells two apart: an ingest attributed
 * to a `derived` source and one attributed to a `declared` source are weighed
 * differently downstream.
 */
export function memorySourceSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => {
    const sources = await listMemorySources(client, context);
    return {
      items: sources
        .filter((entry) => contains(entry.source_id, query.search))
        .map(
          (entry): ResourceOption => ({
            description: `${entry.authority_tier}${entry.breaker_open_until ? " — breaker open" : ""}`,
            label: entry.source_id,
            value: entry.source_id,
          }),
        ),
      next_cursor: null,
    };
  };
}

/** A catalog entity, shown by name with its type. */
export function capabilitySource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => {
    const page = await listCapabilities(
      client,
      { ...(query.cursor ? { cursor: query.cursor } : {}), pageSize: 50 },
      context,
    );
    return {
      items: page.items
        .filter((entry) => contains(entry.name, query.search))
        .map((entry): ResourceOption => ({ description: entry.entityType, label: entry.name, value: entry.entityId })),
      next_cursor: page.nextCursor,
    };
  };
}

/**
 * A tenant this credential reaches, the current one first.
 *
 * A tenant with no row here is offered with its slug and a note rather than
 * dropped: a credential can name a tenant this deployment has not materialised,
 * and hiding it would report no access to one the caller does have.
 */
export function tenantSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => ({
    items: filterOptions(tenantOptions(await listTenants(client, context)), query.search),
    // Bounded by the credential's own memberships, so there is nothing to page.
    next_cursor: null,
  });
}

/**
 * The tenant rows as options, without the fetching.
 *
 * Separate from `tenantSource` for the one screen that needs the same list
 * twice — a picker to choose from and a name for each chip it has already
 * added. Deriving both from one read beats two requests for one collection, and
 * beats a second copy of "what does a tenant look like to a chooser".
 */
export function tenantOptions(tenants: readonly ReachableTenant[]): readonly ResourceOption[] {
  return tenants.map(
    (entry): ResourceOption => ({
      description: entry.is_provisioned
        ? entry.tenant_slug
        : `${entry.tenant_slug} — not provisioned on this deployment`,
      label: entry.display_name ?? entry.tenant_slug,
      value: entry.tenant_id,
    }),
  );
}

/** Narrow an already-held option list. Matches label or description. */
export function filterOptions(
  options: readonly ResourceOption[],
  search: string,
): readonly ResourceOption[] {
  return options.filter(
    (option) => contains(option.label, search) || contains(option.description ?? "", search),
  );
}

/**
 * An intent this caller participates in, shown by its latest goal.
 *
 * An intent with no checkpoint says so rather than rendering the UUID: a grant
 * is written before the first checkpoint, so that is a real state and the UUID
 * is the value the picker exists to stop showing.
 */
export function intentSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => {
    const page = await listIntents(client, context);
    return {
      items: page
        .filter((entry) => contains(entry.goal ?? entry.intent_id, query.search))
        .map(
          (entry): ResourceOption => ({
            description:
              entry.goal === null
                ? `${entry.role} — no checkpoint yet`
                : `${entry.role} · ${entry.checkpoint_count} checkpoint${entry.checkpoint_count === 1 ? "" : "s"}`,
            label: entry.goal ?? entry.intent_id,
            value: entry.intent_id,
          }),
        ),
      next_cursor: null,
    };
  };
}

/**
 * A recent resolution, shown by when it happened and what it served.
 *
 * The list carries no query text, so the label is the timestamp and the state.
 * That is thin, and it is what a receipt listing may say: the request is on the
 * detail read, behind the servability check a list must not route around.
 */
export function receiptSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
): PickerSource {
  return async (query) => {
    const page = await listReceipts(
      client,
      { ...(query.cursor ? { before: query.cursor } : {}), limit: 50 },
      context,
    );
    return {
      items: page.items
        .filter((entry) => contains(entry.receipt_id, query.search))
        .map(
          (entry): ResourceOption => ({
            description: `${entry.state} · ${entry.item_count} item${entry.item_count === 1 ? "" : "s"}${
              entry.exclusion_count > 0 ? ` · ${entry.exclusion_count} withheld` : ""
            }`,
            label: entry.resolved_at,
            value: entry.receipt_id,
          }),
        ),
      // The cursor is a `resolved_at`, which `ResourcePicker` carries opaquely
      // like any other. It is not decoded here and must not be elsewhere.
      next_cursor: page.next_before,
    };
  };
}

/** A governed revision, shown by the artifact it belongs to. */
export function revisionSource(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
  options: { lifecycleState?: string } = {},
): PickerSource {
  return async (query) => {
    const page = await listArcRevisions(
      client,
      {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(options.lifecycleState ? { lifecycleState: options.lifecycleState } : {}),
      },
      context,
    );
    return {
      items: page.items
        .filter((entry) => contains(entry.artifact_slug ?? entry.artifact_id, query.search))
        .map(
          (entry): ResourceOption => ({
            description: `${entry.artifact_kind} · ${entry.lifecycle_state}`,
            label: entry.artifact_slug ?? entry.artifact_id,
            value: entry.revision_id,
          }),
        ),
      next_cursor: page.next_cursor,
    };
  };
}

/**
 * One ARC governance collection, offering only what is in force.
 *
 * A list is a record of what happened; a picker is a set of things you may
 * choose, and offering a revoked verifier would let somebody grant approval
 * authority to a credential that no longer exists.
 */
export function governanceSource(
  client: ContextplaneClient,
  collection: ArcGovernanceCollection,
  context: ContextplaneRequestOptions,
): PickerSource {
  let pending: Promise<readonly { description?: string; label: string; value: string }[]> | null = null;

  function options() {
    // Held after the first fetch: these collections are unpaginated, so
    // re-requesting per keystroke would be a request per letter for a list that
    // cannot have changed in 200ms. A rejected fetch is not cached — a caller
    // retrying after an outage should get a request, not the failure again.
    pending ??= listArcGovernanceOptions(client, collection, context).catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  }

  return async (query) => {
    const all = await options();
    return {
      items: all.filter(
        (option) => contains(option.label, query.search) || contains(option.description ?? "", query.search),
      ),
      // These have no cursor. Fabricating one would invent a bookmark the
      // service never issued.
      next_cursor: null,
    };
  };
}
