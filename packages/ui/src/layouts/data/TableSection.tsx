import { SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "../../primitives/actions/Button";
import { SectionSurface, type SectionSurfaceProps } from "../surfaces/SectionSurface";

export interface TableSectionProps extends Omit<SectionSurfaceProps, "action" | "children"> {
  action?: ReactNode;
  children: ReactNode;
  defaultFiltersVisible?: boolean;
  filters?: ReactNode;
  filtersId?: string;
  filtersVisible?: boolean;
  onFiltersVisibleChange?: (visible: boolean) => void;
}

export function TableSection({
  action,
  children,
  defaultFiltersVisible = false,
  filters,
  filtersId,
  filtersVisible,
  flush = true,
  onFiltersVisibleChange,
  ...props
}: TableSectionProps) {
  const generatedFiltersId = useId();
  const [uncontrolledFiltersVisible, setUncontrolledFiltersVisible] =
    useState(defaultFiltersVisible);
  const hasFilters = filters !== undefined && filters !== null;
  const resolvedFiltersId = filtersId ?? `table-filters-${generatedFiltersId}`;
  const resolvedFiltersVisible = filtersVisible ?? uncontrolledFiltersVisible;

  function toggleFilters() {
    const nextVisible = !resolvedFiltersVisible;
    if (filtersVisible === undefined) setUncontrolledFiltersVisible(nextVisible);
    onFiltersVisibleChange?.(nextVisible);
  }

  return (
    <SectionSurface
      {...props}
      action={
        action || hasFilters ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {action}
            {hasFilters ? (
              <Button
                aria-controls={resolvedFiltersId}
                aria-expanded={resolvedFiltersVisible}
                onClick={toggleFilters}
                size="compact"
                variant="ghost"
              >
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                {resolvedFiltersVisible ? "Hide filters" : "Show filters"}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
      flush={flush}
    >
      {hasFilters ? (
        <div id={resolvedFiltersId} data-table-filters="true" hidden={!resolvedFiltersVisible}>
          {filters}
        </div>
      ) : null}
      {children}
    </SectionSurface>
  );
}
