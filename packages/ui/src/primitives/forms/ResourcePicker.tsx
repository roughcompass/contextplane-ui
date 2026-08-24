import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import {
  useCallback,
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

export interface ResourceOption {
  /** What the reader sees. A name, never the identifier. */
  label: string;
  /** The identifier the field is actually for. */
  value: string;
  /** One line of disambiguation, where two records can share a name. */
  description?: string;
}

export interface ResourcePage {
  items: readonly ResourceOption[];
  /**
   * Returned to the service unchanged and never decoded. A cursor is the
   * service's own bookmark; treating it as data is how a client starts
   * depending on an ordering nobody promised it.
   */
  next_cursor: string | null;
}

export interface ResourceQuery {
  search: string;
  cursor: string | null;
}

export interface ResourcePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  disabled?: boolean;
  /** Shown when the service returns nothing for the current search. */
  emptyMessage?: string;
  hideLabel?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  ref?: Ref<HTMLDivElement>;
  /** One page of candidates. Called on open, on search, and on "load more". */
  load: (query: ResourceQuery) => Promise<ResourcePage>;
  /**
   * One record by identifier. Two jobs, and both are about honesty rather than
   * convenience:
   *
   * - a `value` that arrived from elsewhere — a URL, a previous session — is
   *   shown by name rather than as the identifier the reader cannot read;
   * - a **pasted** identifier resolves to a named record instead of being
   *   rejected as "not in list", which is what ADR 0018's dissent requires. An
   *   operator with the UUID already on their clipboard keeps their fast path
   *   and gains a check: they see which record they pasted before they act.
   */
  resolve?: (value: string) => Promise<ResourceOption | null>;
  searchPlaceholder?: string;
  /** The identifier currently chosen, or `""`. */
  value: string;
}

interface PopoverPosition extends CSSProperties {
  left: number;
  top: number;
  width: number;
}

/** Long enough that typing does not issue a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * A field whose value is a server-assigned identifier, populated from a read.
 *
 * ADR 0018 decides that such a field is selected from a list and never typed,
 * because a text box asking for a UUID presumes the reader arrived carrying the
 * answer when the reason they are here is to find out what the answer is.
 *
 * Extends the pattern `SearchableSelect` already established across 28 files
 * rather than inventing a second control: the keyboard behaviour, the portal
 * and the option semantics are settled there. What this adds is the four things
 * a remote collection needs — search at the service, pagination over an opaque
 * cursor, a name for a value that was already set, and the paste path.
 */
export function ResourcePicker({
  className,
  disabled = false,
  emptyMessage = "No match. Try a different search.",
  hideLabel = false,
  label,
  load,
  onValueChange,
  ref,
  resolve,
  searchPlaceholder = "Search by name",
  value,
  ...props
}: ResourcePickerProps) {
  const generatedId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<readonly ResourceOption[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only the *asynchronously* resolved record is state. What is displayed is
  // derived below, because a value already present in the loaded options needs
  // no effect to notice — and setting state synchronously in one is what
  // triggers the cascading render this project's lint refuses.
  const [resolved, setResolved] = useState<ResourceOption | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const listboxId = `resource-picker-${generatedId}`;

  const fetchPage = useCallback(
    async (query: ResourceQuery, append: boolean) => {
      setLoading(true);
      setFailed(false);
      try {
        const page = await load(query);
        setOptions((current) => (append ? [...current, ...page.items] : page.items));
        setCursor(page.next_cursor);
      } catch {
        // A failed load is reported rather than rendered as an empty list: a
        // reader shown "no match" for a request that never arrived would
        // conclude the record does not exist.
        setFailed(true);
        if (!append) setOptions([]);
        setCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [load],
  );

  // What the trigger shows, derived rather than stored. A value that arrived
  // from a URL or a previous session would otherwise render as the identifier
  // this control exists to stop showing people.
  const selected =
    (value ? options.find((option) => option.value === value) : undefined) ??
    (resolved?.value === value ? resolved : null);

  // The one thing that genuinely needs an effect: asking the service to name a
  // value nothing loaded has. Synchronising with an external system is what an
  // effect is for; deciding what to display is not.
  useEffect(() => {
    if (!value || !resolve || selected) return;
    let cancelled = false;
    void resolve(value).then((record) => {
      if (!cancelled && record) setResolved(record);
    });
    return () => {
      cancelled = true;
    };
  }, [resolve, selected, value]);

  // Search at the service, debounced. Filtering a page client-side would search
  // only what happened to be loaded, which is worse than not searching: it
  // reports "no match" about a collection it never asked.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void fetchPage({ cursor: null, search }, false);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [fetchPage, open, search]);

  function reposition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPosition({ left: rect.left, top: rect.bottom + 4, width: rect.width });
  }

  function openPopover() {
    if (disabled) return;
    reposition();
    setOpen(true);
  }

  function choose(option: ResourceOption) {
    setResolved(option);
    onValueChange(option.value);
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  }

  async function acceptPastedIdentifier() {
    const pasted = search.trim();
    if (!pasted || !resolve) return;
    const resolved = await resolve(pasted);
    if (resolved) choose(resolved);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPopover();
    }
  }

  return (
    <div className={cn("relative", className)} ref={ref} {...props}>
      <span className={cn("mb-1.5 block text-xs font-medium text-muted", hideLabel && "sr-only")}>
        {label}
      </span>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPopover())}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className={cn("truncate", !selected && "text-subtle")}>
          {selected ? selected.label : "Choose…"}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
      </button>

      {open && position
        ? createPortal(
            <div
              className="z-50 rounded-md border border-border bg-surface shadow-lg"
              style={{
                left: position.left,
                position: "fixed",
                top: position.top,
                width: position.width,
              }}
            >
              <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
                <input
                  aria-label={`${label} search`}
                  autoFocus
                  className="min-h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      triggerRef.current?.focus();
                    }
                    if (event.key === "Enter" && options.length === 0) {
                      // The paste path. Nothing matched the search, so the most
                      // likely thing the reader typed is an identifier they
                      // already had — resolve it and show them what it names.
                      event.preventDefault();
                      void acceptPastedIdentifier();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  type="text"
                  value={search}
                />
                {loading ? (
                  <Loader2
                    aria-label="Loading options"
                    className="size-4 shrink-0 animate-spin text-muted"
                    role="status"
                  />
                ) : null}
              </div>

              <ul
                aria-label={label}
                className="max-h-64 overflow-y-auto py-1"
                id={listboxId}
                role="listbox"
              >
                {options.map((option) => (
                  <li key={option.value}>
                    <button
                      aria-selected={option.value === value}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                      onClick={() => choose(option)}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.description ? (
                          <span className="block truncate text-xs text-muted">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      {option.value === value ? (
                        <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />
                      ) : null}
                    </button>
                  </li>
                ))}

                {options.length === 0 && !loading ? (
                  <li className="px-3 py-3 text-xs text-muted">
                    {failed
                      ? "The list could not be loaded. Nothing has been chosen; retry, or paste an identifier and press Enter."
                      : emptyMessage}
                  </li>
                ) : null}
              </ul>

              {cursor ? (
                <div className="border-t border-border-subtle p-2">
                  <button
                    className="min-h-9 w-full rounded-md text-xs font-medium text-accent hover:bg-surface-muted"
                    disabled={loading}
                    onClick={() => void fetchPage({ cursor, search }, true)}
                    type="button"
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
