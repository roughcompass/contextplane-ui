import type { ResourceOption, ResourcePage, ResourceQuery } from "@repo/ui/primitives";

import {
  listArcGovernanceOptions,
  type ArcGovernanceCollection,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../api";

/**
 * Adapting an ARC governance collection to what `ResourcePicker` asks for.
 *
 * ## Why the search is client-side here, and why that is not the thing the
 * picker warns about
 *
 * `ResourcePicker` searches at the service, and its own note says why: filtering
 * a *page* client-side reports "no match" about a collection it never asked,
 * which is worse than not searching. That argument turns on holding a page.
 *
 * These five endpoints are unpaginated and unsearchable — one request returns
 * the whole collection, and there is no cursor to return or search parameter to
 * send. So filtering here narrows something the caller *has*, and a "no match"
 * is a true statement about the whole set rather than about a window onto it.
 * The moment one of these grows a cursor, this becomes the failure the picker
 * describes, and the fix is to send the search rather than to keep this.
 *
 * ## The collection is fetched once per open, not once per keystroke
 *
 * The picker debounces and calls `load` again on each search. Re-fetching an
 * unpaginated collection per keystroke would be a request per letter for a list
 * that cannot have changed in 200ms, so the first response is held for the life
 * of the source and every later query filters it.
 */
export interface GovernancePickerSource {
  load: (query: ResourceQuery) => Promise<ResourcePage>;
  resolve: (value: string) => Promise<ResourceOption | null>;
}

function matches(option: ResourceOption, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    (option.description ?? "").toLowerCase().includes(needle)
  );
}

export function governancePickerSource(
  client: ContextplaneClient,
  collection: ArcGovernanceCollection,
  requestContext: ContextplaneRequestOptions,
): GovernancePickerSource {
  // Held rather than re-requested. A rejected fetch is not cached: a caller who
  // retries after an outage should get a request, not the failure again.
  let pending: Promise<readonly ResourceOption[]> | null = null;

  function options(): Promise<readonly ResourceOption[]> {
    pending ??= listArcGovernanceOptions(client, collection, requestContext).catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  }

  return {
    async load(query: ResourceQuery): Promise<ResourcePage> {
      const all = await options();
      // `next_cursor` is always null because these collections have no cursor.
      // Returning a fabricated one would be inventing a bookmark the service
      // never issued, which is the one thing a client must not do with a cursor.
      return { items: all.filter((option) => matches(option, query.search)), next_cursor: null };
    },

    async resolve(value: string): Promise<ResourceOption | null> {
      // ADR 0018's dissent, answered without a by-id endpoint: an operator who
      // pasted an identifier gets it checked against the collection rather than
      // accepted blindly. A paste that names nothing in force resolves to
      // `null`, and the picker leaves the field unset — which is the honest
      // outcome for an identifier that would be refused at the service anyway.
      const all = await options();
      return all.find((option) => option.value === value) ?? null;
    },
  };
}
