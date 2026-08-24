import { ExternalLink } from "lucide-react";
import { useId, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { cn } from "../styles/cn";
import type { NavigationSection } from "./types";

export interface AppSidebarProps extends HTMLAttributes<HTMLElement> {
  activeHref: string;
  footer?: ReactNode;
  navigation: readonly NavigationSection[];
  onNavigate?: () => void;
  ref?: Ref<HTMLElement>;
}

function matches(activeHref: string, itemHref: string) {
  return activeHref === itemHref || (itemHref !== "/" && activeHref.startsWith(`${itemHref}/`));
}

/**
 * The one item that is current, or none.
 *
 * Prefix matching is what makes a detail page mark its list — `/catalog/abc`
 * lights up "Catalog", which is right. It stops being right the moment two
 * destinations sit in a parent/child path relationship: `/memory/review` matched
 * both "Needs review" and "Claims", so two items claimed `aria-current="page"`
 * in two different sections and a screen reader announced the reader as being
 * in two places.
 *
 * The longest match wins, which keeps the detail-page behaviour and makes the
 * exact address beat the ancestor it happens to sit under. Computed across every
 * section rather than within one, because the pair that collided was split
 * across two.
 */
function currentHref(activeHref: string, navigation: readonly NavigationSection[]): string | null {
  let best: string | null = null;
  for (const section of navigation) {
    for (const item of section.items) {
      if (!matches(activeHref, item.href)) continue;
      if (best === null || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

export function AppSidebar({
  activeHref,
  className,
  footer,
  navigation,
  onNavigate,
  ref,
  ...props
}: AppSidebarProps) {
  const navigationId = useId();
  const current = currentHref(activeHref, navigation);

  return (
    <aside
      ref={ref}
      className={cn("flex h-full min-h-0 flex-col bg-surface", className)}
      {...props}
    >
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-6">
          {navigation.map((section) => (
            // A section with no label is not a landmark. It renders its list and
            // nothing else, because an unnamed `region` is one a screen reader
            // announces and cannot name.
            <section
              key={section.id}
              {...(section.label ? { "aria-labelledby": `${navigationId}-${section.id}` } : {})}
            >
              {section.label ? (
                <h2
                  id={`${navigationId}-${section.id}`}
                  className="mb-2 px-3 text-xs font-medium text-muted"
                >
                  {section.label}
                </h2>
              ) : null}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = item.href === current;
                  const external = item.href.startsWith("http");

                  return (
                    <li key={item.href}>
                      <a
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                          active
                            ? "bg-accent-subtle text-accent-strong"
                            : "text-muted hover:bg-surface-muted hover:text-foreground",
                        )}
                        href={item.href}
                        onClick={onNavigate}
                        rel={external ? "noreferrer" : undefined}
                        target={external ? "_blank" : undefined}
                      >
                        {item.icon ? (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "grid size-5 shrink-0 place-items-center",
                              active ? "text-accent" : "text-subtle group-hover:text-muted",
                            )}
                          >
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-muted">
                            {item.badge}
                          </span>
                        ) : null}
                        {external ? (
                          <>
                            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                            <span className="sr-only">(opens in a new tab)</span>
                          </>
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </nav>
      {footer ? <div className="shrink-0 border-t border-border px-6 py-4">{footer}</div> : null}
    </aside>
  );
}
