import type { ResourceOption, ResourcePage, ResourceQuery } from "@repo/ui/primitives";

import {
  listCapabilities,
  listPrincipals,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

/**
 * The two collections this screen's identifier fields can be chosen from.
 *
 * ## Which of the nine fields these cover, and why the rest are not here
 *
 * `OwnershipPanel` asks for nine identifiers. Two are a principal and two are an
 * owned target, and both have a read — so those four become pickers. The other
 * five do not, and the reason differs per field rather than being one gap:
 *
 * - **`Profile revision UUID` ×2 and `Target core revision UUID`.** The plan
 *   entry says these resolve against `/v1/profiles/revisions`, "which exists".
 *   It exists as a **`POST`**: there is no way to list profile revisions. That
 *   is a service read nobody has cut, not a UI decision, and the fields say so
 *   rather than being quietly left as text boxes among pickers.
 * - **`Assignment UUID` and `Binding UUID`.** Reachable only as
 *   `GET /v1/ownership/assignments/{assignment_id}` — no collection. The entry
 *   already knew this; what it asked for is that the disposition be recorded,
 *   which it now is on the fields themselves.
 *
 * ## Both sources page, and neither decodes a cursor
 *
 * Unlike the ARC governance collections, these are genuinely paginated, so the
 * cursor is carried through untouched and search happens at the service where
 * the service supports it. `ResourcePicker`'s warning applies here as written:
 * filtering a page client-side reports "no match" about a collection it never
 * asked.
 */

export function principalPickerSource(
  client: ContextplaneClient,
  requestContext: ContextplaneRequestOptions,
): (query: ResourceQuery) => Promise<ResourcePage> {
  return async (query) => {
    const page = await listPrincipals(
      client,
      { ...(query.cursor ? { cursor: query.cursor } : {}), pageSize: 50 },
      requestContext,
    );
    const needle = query.search.trim().toLowerCase();
    const items = page.items
      .filter(
        (principal) =>
          needle === "" ||
          principal.display_name.toLowerCase().includes(needle) ||
          principal.actor_id.toLowerCase().includes(needle),
      )
      .map(
        (principal): ResourceOption => ({
          // The kind, and whether anybody chose it. Choosing an owner is a
          // decision about accountability, and "nobody has said what this is" is
          // a fact the chooser needs — not a blank the picker should smooth over.
          description: principal.is_declared
            ? principal.actor_kind
            : `${principal.actor_kind} — nobody has declared this principal`,
          label: principal.display_name,
          value: principal.actor_id,
        }),
      );
    return { items, next_cursor: page.next_cursor };
  };
}

export function capabilityPickerSource(
  client: ContextplaneClient,
  requestContext: ContextplaneRequestOptions,
): (query: ResourceQuery) => Promise<ResourcePage> {
  return async (query) => {
    const page = await listCapabilities(
      client,
      { ...(query.cursor ? { cursor: query.cursor } : {}), pageSize: 50 },
      requestContext,
    );
    const needle = query.search.trim().toLowerCase();
    const items = page.items
      .filter((entity) => needle === "" || entity.name.toLowerCase().includes(needle))
      .map(
        (entity): ResourceOption => ({
          description: entity.entityType,
          label: entity.name,
          value: entity.entityId,
        }),
      );
    return { items, next_cursor: page.nextCursor };
  };
}
