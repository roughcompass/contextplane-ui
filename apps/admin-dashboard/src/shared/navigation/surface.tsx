import { createContext, use, type ReactNode } from "react";

import { PageHeader as BasePageHeader, type PageHeaderProps } from "@repo/ui/layouts";

/**
 * Which of the five surfaces the reader is standing in, and the header that
 * says so.
 *
 * ## Why the eyebrow is not a per-page string any more
 *
 * There were 21 of them across three vocabularies — "Govern", "Observed
 * context", "Scoped working memory", "Agent readiness", "Platform usage" — and
 * every one described what its page was *about*, which the page's own title
 * already says. Three pages under one nav group carried three different
 * eyebrows; two pages in different groups shared one. Nothing kept any of them
 * agreeing with the navigation, because nothing connected them to it.
 *
 * What a reader cannot get from a page title is which surface they are in, and
 * that is exactly what the eyebrow slot is positioned to say. A regrouping is
 * when it becomes answerable, so it is answered here.
 *
 * ## Context rather than a prop, and a wrapper rather than a hook
 *
 * A prop would mean threading one value through 20-odd page signatures and 20-odd
 * call sites, and a page that forgot it would silently render no eyebrow. A hook
 * would mean a call in every page, including the several that render a header in
 * three branches.
 *
 * The wrapper makes it structural: a page renders a header and the header knows
 * where it is. The value has exactly one source — `routeDefinitions[route].surface`
 * — so the navigation and the eyebrow cannot disagree, which is the failure the
 * 21 strings were.
 *
 * ## `@repo/ui`'s `PageHeader` stays app-agnostic
 *
 * The surface vocabulary is this application's information architecture, not a
 * fact about page headers, so it does not go in the kit. This is the seam: the
 * kit renders an eyebrow it is given, and the app decides what the eyebrow says.
 */
const SurfaceContext = createContext<string>("");

export function SurfaceProvider({ children, surface }: { children: ReactNode; surface: string }) {
  return <SurfaceContext value={surface}>{children}</SurfaceContext>;
}

/**
 * A page header whose eyebrow is the surface, unless the page overrides it.
 *
 * The override exists for one case and is not a general escape hatch: a page
 * rendered outside the shell has no surface, and passing an empty string is how
 * it says so rather than inheriting whatever the last route set.
 */
export function PageHeader({ eyebrow, ...props }: PageHeaderProps) {
  const surface = use(SurfaceContext);
  const resolved = eyebrow ?? surface;
  return <BasePageHeader {...props} {...(resolved === "" ? {} : { eyebrow: resolved })} />;
}
