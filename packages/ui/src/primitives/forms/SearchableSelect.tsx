import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "../../styles/cn";

export interface SearchableSelectOption {
  label: string;
  value: string;
}

export interface SearchableSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  allowEmpty?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  emptyMessage?: string;
  hideLabel?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  ref?: Ref<HTMLDivElement>;
  searchPlaceholder?: string;
  value: string;
}

interface PopoverPosition extends CSSProperties {
  left: number;
  top: number;
  width: number;
}

export function SearchableSelect({
  allowEmpty = true,
  className,
  disabled = false,
  emptyLabel = "Select an option",
  emptyMessage = "No options match",
  hideLabel = false,
  label,
  onValueChange,
  options,
  ref,
  searchPlaceholder = "Search options",
  value,
  ...props
}: SearchableSelectProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listboxId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedValueId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const allOptions: readonly SearchableSelectOption[] = allowEmpty
    ? [{ label: emptyLabel, value: "" }, ...options]
    : options;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? allOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : allOptions;
  const selectedOption = allOptions.find((option) => option.value === value) ?? allOptions[0];
  const visible = open && !disabled;

  function positionPopover() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.max(bounds.width, 256);
    const left = Math.min(Math.max(8, bounds.left), Math.max(8, window.innerWidth - width - 8));
    const roomBelow = window.innerHeight - bounds.bottom;
    const top = roomBelow >= 300 ? bounds.bottom + 8 : Math.max(8, bounds.top - 328);
    setPopoverPosition({ left, top, width });
  }

  useEffect(() => {
    if (!visible) return;
    positionPopover();
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function reposition() {
      positionPopover();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listboxId, visible]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, visibleOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(visibleOptions.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) {
        onValueChange(option.value);
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  return (
    <div ref={ref} className={cn("min-w-0", className)} {...props}>
      <span
        id={labelId}
        className={cn("block text-xs font-medium text-muted", hideLabel && "sr-only")}
      >
        {label}
      </span>
      <div ref={containerRef} className={cn(!hideLabel && "mt-1.5")}>
        <button
          ref={triggerRef}
          aria-controls={listboxId}
          aria-expanded={visible}
          aria-haspopup="listbox"
          aria-labelledby={`${labelId} ${selectedValueId}`}
          className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-foreground hover:border-border-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={(event) => {
            setPortalContainer(event.currentTarget.closest("dialog") ?? document.body);
            setActiveIndex(
              Math.max(
                allOptions.findIndex((option) => option.value === value),
                0,
              ),
            );
            setQuery("");
            setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !visible) {
              event.preventDefault();
              setPortalContainer(event.currentTarget.closest("dialog") ?? document.body);
              setActiveIndex(0);
              setQuery("");
              setOpen(true);
            }
          }}
          role="combobox"
          type="button"
          value={value}
        >
          <span id={selectedValueId} className="min-w-0 truncate">
            {selectedOption?.label ?? emptyLabel}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 shrink-0 text-subtle", visible && "rotate-180")}
          />
        </button>
      </div>

      {visible && popoverPosition && portalContainer
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-lg"
              style={popoverPosition}
            >
              <label className="flex h-11 items-center gap-2 border-b border-border-subtle px-3">
                <Search aria-hidden="true" className="size-4 shrink-0 text-subtle" />
                <span className="sr-only">Search {label}</span>
                <input
                  ref={searchRef}
                  aria-activedescendant={
                    visibleOptions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined
                  }
                  aria-controls={listboxId}
                  aria-expanded="true"
                  aria-label={`Search ${label}`}
                  aria-multiline="false"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
                  onChange={(event) => {
                    setActiveIndex(0);
                    setQuery(event.currentTarget.value);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  role="combobox"
                  value={query}
                />
              </label>
              <ul
                id={listboxId}
                aria-label={`${label} options`}
                className="max-h-64 overflow-y-auto p-1.5"
                role="listbox"
              >
                {visibleOptions.length > 0 ? (
                  visibleOptions.map((option, index) => (
                    <li
                      id={`${listboxId}-option-${index}`}
                      key={option.value || "all"}
                      aria-selected={option.value === value}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-sm",
                        index === activeIndex
                          ? "bg-accent-subtle text-accent-strong"
                          : "text-foreground hover:bg-surface-muted",
                      )}
                      onClick={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      {option.value === value ? (
                        <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-4 text-sm text-muted">{emptyMessage}</li>
                )}
              </ul>
            </div>,
            portalContainer,
          )
        : null}
    </div>
  );
}
