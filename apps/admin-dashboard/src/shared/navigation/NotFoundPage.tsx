import { PageContainer, PageHeader } from "@repo/ui/layouts";
import { Notice } from "@repo/ui/primitives";

interface NotFoundPageProps {
  activeTenantName: string;
  pathname: string;
}

/**
 * The destination for a path no route claims.
 *
 * Before this existed the router fell through to the catalog, so a mistyped or
 * stale URL rendered a real page with no signal that it was not the one asked
 * for. A copied URL is supposed to reconstruct the same view; silently
 * reconstructing a different one is worse than saying nothing was found.
 */
export function NotFoundPage({ activeTenantName, pathname }: NotFoundPageProps) {
  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Not found" }]}
        description="No destination in this workspace answers to that address."
        eyebrow="Navigation"
        title="Page not found"
      />
      <Notice title="Nothing is here" variant="warning">
        <p>
          <code>{pathname}</code> did not match a destination. It may have been renamed, or the link
          may be from an older version of the dashboard.
        </p>
        <p className="mt-2">
          Use the primary navigation, or <a href="/">return to the overview</a>.
        </p>
      </Notice>
    </PageContainer>
  );
}
