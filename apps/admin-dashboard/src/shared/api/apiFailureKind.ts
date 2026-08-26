import { ContextplaneApiError } from "./client";

/**
 * Which kind of answer a failed request was.
 *
 * Split from `ApiFailure.tsx` because a module that exports both a component and
 * a function loses fast refresh, and because this is the part another surface
 * might reasonably want without the rendering — a page that hides an action for
 * a caller who cannot use it needs the classification, not a notice.
 *
 * Branching on `code` is the repository's rule: failures parse as
 * `errors: [{path, code, message}]` and callers branch on `code`, never on
 * display-text `message`. `status` is read alongside it because the two disagree
 * usefully — a `401` carries `unauthenticated` while a `403` carries several
 * codes depending on which guard refused, and both are refusals to a reader.
 */
export type ApiFailureKind = "failed" | "not-built" | "refused";

/** What kind of answer this was, for a caller that needs to branch further. */
export function apiFailureKind(error: unknown): ApiFailureKind {
  if (!(error instanceof ContextplaneApiError)) return "failed";
  if (error.status === 401 || error.status === 403) return "refused";
  if (error.code === "unauthenticated" || error.code === "forbidden") return "refused";
  if (error.code === "permission_denied") return "refused";
  if (error.status === 501 || error.code === "not_implemented") return "not-built";
  return "failed";
}
