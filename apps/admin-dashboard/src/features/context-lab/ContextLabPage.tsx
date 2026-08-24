import {
  AlertTriangle,
  BookOpenCheck,
  Braces,
  Check,
  ChevronRight,
  Copy,
  Database,
  FlaskConical,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type RefObject } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  DetailLayout,
  PageContainer,
  PageSkeleton,
  SectionSurface,
  SummaryStrip,
  type SummaryItem,
} from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";
import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  Skeleton,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  getContextReceipt,
  getContextReceiptExclusions,
  getContextReceiptReferences,
  getWhoAmI,
  recordContextFeedback,
  resolveContext,
  type ContextBlock,
  type ContextEnvelope,
  type ContextFeedback,
  type ContextFeedbackRating,
  type ContextItem,
  type ContextReceipt,
  type ContextReference,
  type ContextTrust,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type ResolveContextInput,
  type WhoAmI,
} from "../../shared/api";
import {
  contextBlockDescription,
  contextBlockLabel,
  contextBlockStateLabel,
  contextBlockStateTone,
  contextEnvelopeStateLabel,
  contextEnvelopeStateTone,
  contextFreshnessOptions,
  contextItemSummary,
  contextItemTitle,
  contextLimitSelectOptions,
  displayContextValue,
  formatContextTimestamp,
  humanizeContextField,
  identityDisplayName,
  mayReportContextFeedback,
  returnedContextBlocks,
  shortContextIdentifier,
  totalContextItems,
  trustSummary,
  validateScope,
  type ContextLimit,
} from "./contextLabModel";

interface ContextLabPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

interface FeedbackVariables {
  idempotencyKey: string;
  itemId: string;
  rating: ContextFeedbackRating;
  receiptId: string;
}

const inputControlClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const inputClassName = `mt-2 ${inputControlClassName}`;
const invalidInputControlClassName =
  "min-h-11 w-full rounded-md border border-danger bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:outline-2 focus:outline-offset-2 focus:outline-danger";
const invalidInputClassName = `mt-2 ${invalidInputControlClassName}`;

const examplePrompts = [
  "Which capability owns customer identity resolution?",
  "What context applies to deploying the payments API?",
  "What prior decisions affect the identity migration?",
] as const;

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function queryTenantKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function queryErrorPresentation(error: unknown) {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "Connect through the deployment gateway or runtime token provider. Access tokens must not be placed in browser-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning" as const,
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential spans multiple tenants. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning" as const,
      };
    }
    if (error.status === 403) {
      return {
        body: "The service did not authorize context resolution for the current actor and tenant.",
        title: "Context access is restricted",
        variant: "warning" as const,
      };
    }
    if (error.status === 422) {
      return {
        body: "The service rejected this resolution scope. Review the prompt and optional identifiers before running it again.",
        title: "Context request is not valid",
        variant: "warning" as const,
      };
    }
  }
  return {
    body: "The service could not resolve this prompt. The previous result remains visible; retry when the service is available.",
    title: "Context could not be resolved",
    variant: "danger" as const,
  };
}

function QueryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = queryErrorPresentation(error);
  const requestId = error instanceof ContextplaneApiError ? error.requestId : null;
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={requestId}
      title={presentation.title}
      variant={presentation.variant}
    >
      {presentation.body}
    </RequestFailure>
  );
}

function ContextLabHeader({ identity }: { identity: WhoAmI }) {
  return (
    <PageHeader
      breadcrumbs={[{ href: "/", label: identity.tenant_display_name }, { label: "Context Lab" }]}
      description="Test a prompt against the context resolver, inspect the four source layers it returns, and leave item-level relevance feedback without mistaking an observation for canonical truth."
      metadata={
        <>
          <StatusBadge tone="info">Evaluation workspace</StatusBadge>
          <StatusBadge>{identityDisplayName(identity)}</StatusBadge>
          <StatusBadge>{identity.tenant_display_name}</StatusBadge>
        </>
      }
      title="Context Lab"
    />
  );
}

function PromptComposer({
  isPending,
  onSubmit,
  prompt,
  searchRef,
  setPrompt,
}: {
  isPending: boolean;
  onSubmit: (input: ResolveContextInput) => void;
  prompt: string;
  searchRef: RefObject<HTMLInputElement | null>;
  setPrompt: (value: string) => void;
}) {
  const promptId = useId();
  const subjectId = useId();
  const intentIdsId = useId();
  const workspaceTermId = useId();
  const arcReceiptId = useId();
  const [promptError, setPromptError] = useState("");
  const [subjectEntityId, setSubjectEntityId] = useState("");
  const [intentIds, setIntentIds] = useState("");
  const [workspaceTerm, setWorkspaceTerm] = useState("");
  const [arcReceipt, setArcReceipt] = useState("");
  const [limit, setLimit] = useState<ContextLimit>(25);
  const [maxAgeSeconds, setMaxAgeSeconds] = useState("");
  const [scopeErrors, setScopeErrors] = useState<{
    arcReceiptId?: string;
    intentIds?: string;
    subjectEntityId?: string;
  }>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = prompt.trim();
    const nextPromptError = query ? "" : "Enter a prompt to resolve.";
    const validation = validateScope({
      arcReceiptId: arcReceipt,
      intentIds,
      limit,
      maxAgeSeconds,
      subjectEntityId,
      workspaceTerm,
    });
    setPromptError(nextPromptError);
    setScopeErrors(validation.errors);
    if (nextPromptError || Object.keys(validation.errors).length > 0) return;

    onSubmit({
      ...(validation.scope.arcReceiptId ? { arcReceiptId: validation.scope.arcReceiptId } : {}),
      ...(validation.scope.intentIds.length > 0 ? { intentIds: validation.scope.intentIds } : {}),
      limit: validation.scope.limit,
      ...(validation.scope.maxAgeSeconds === null
        ? {}
        : { maxAgeSeconds: validation.scope.maxAgeSeconds }),
      query,
      ...(validation.scope.subjectEntityId
        ? { subjectEntityId: validation.scope.subjectEntityId }
        : {}),
      ...(validation.scope.workspaceTerm ? { workspaceTerm: validation.scope.workspaceTerm } : {}),
    });
  }

  return (
    <SectionSurface
      description="The resolver retrieves context only. It does not call a language model, generate an answer, or invent an evaluation score."
      title="Run a prompt"
    >
      <form aria-busy={isPending} className="space-y-5" noValidate onSubmit={submit}>
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor={promptId}>
            Prompt
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                />
                <input
                  ref={searchRef}
                  aria-describedby={promptError ? `${promptId}-error` : `${promptId}-help`}
                  aria-invalid={promptError ? "true" : undefined}
                  className={`${promptError ? invalidInputControlClassName : inputControlClassName} pl-10`}
                  disabled={isPending}
                  id={promptId}
                  onChange={(event) => {
                    setPrompt(event.currentTarget.value);
                    if (promptError) setPromptError("");
                  }}
                  placeholder="Ask what context an agent should receive…"
                  value={prompt}
                />
              </div>
              {promptError ? (
                <p className="mt-2 text-xs text-danger" id={`${promptId}-error`} role="alert">
                  {promptError}
                </p>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted" id={`${promptId}-help`}>
                  The same prompt searches the canonical catalog and, unless refined below,
                  workspace recall.
                </p>
              )}
            </div>
            <Button className="shrink-0" disabled={isPending} type="submit">
              {isPending ? (
                <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <FlaskConical aria-hidden="true" className="size-4" />
              )}
              {isPending ? "Resolving context" : "Resolve context"}
            </Button>
          </div>
        </div>

        <details className="group border-t border-border-subtle pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform duration-150 group-open:rotate-90"
            />
            Refine resolution scope
            <span className="font-normal text-muted">(optional)</span>
          </summary>
          <div className="grid gap-4 pb-1 pt-4 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor={subjectId}>
              Subject entity UUID
              <input
                aria-describedby={scopeErrors.subjectEntityId ? `${subjectId}-error` : undefined}
                aria-invalid={scopeErrors.subjectEntityId ? "true" : undefined}
                className={scopeErrors.subjectEntityId ? invalidInputClassName : inputClassName}
                id={subjectId}
                onChange={(event) => setSubjectEntityId(event.currentTarget.value)}
                placeholder="Center observed claims on one entity"
                value={subjectEntityId}
              />
              {scopeErrors.subjectEntityId ? (
                <span className="mt-2 block text-danger" id={`${subjectId}-error`} role="alert">
                  {scopeErrors.subjectEntityId}
                </span>
              ) : null}
            </label>
            <label className="text-xs font-medium text-muted" htmlFor={workspaceTermId}>
              Workspace term
              <input
                className={inputClassName}
                id={workspaceTermId}
                onChange={(event) => setWorkspaceTerm(event.currentTarget.value)}
                placeholder="Use a narrower workspace search term"
                value={workspaceTerm}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor={intentIdsId}>
              Intent UUIDs
              <textarea
                aria-describedby={scopeErrors.intentIds ? `${intentIdsId}-error` : undefined}
                aria-invalid={scopeErrors.intentIds ? "true" : undefined}
                className={`${scopeErrors.intentIds ? invalidInputClassName : inputClassName} min-h-20 resize-y font-mono text-xs`}
                id={intentIdsId}
                onChange={(event) => setIntentIds(event.currentTarget.value)}
                placeholder="Comma or space separated"
                value={intentIds}
              />
              {scopeErrors.intentIds ? (
                <span className="mt-2 block text-danger" id={`${intentIdsId}-error`} role="alert">
                  {scopeErrors.intentIds}
                </span>
              ) : null}
            </label>
            <label className="text-xs font-medium text-muted" htmlFor={arcReceiptId}>
              ARC receipt UUID
              <input
                aria-describedby={scopeErrors.arcReceiptId ? `${arcReceiptId}-error` : undefined}
                aria-invalid={scopeErrors.arcReceiptId ? "true" : undefined}
                className={scopeErrors.arcReceiptId ? invalidInputClassName : inputClassName}
                id={arcReceiptId}
                onChange={(event) => setArcReceipt(event.currentTarget.value)}
                placeholder="Include an attested policy resolution"
                value={arcReceipt}
              />
              {scopeErrors.arcReceiptId ? (
                <span className="mt-2 block text-danger" id={`${arcReceiptId}-error`} role="alert">
                  {scopeErrors.arcReceiptId}
                </span>
              ) : null}
            </label>
            <SearchableSelect
              allowEmpty={false}
              label="Maximum items per source"
              onValueChange={(value) => setLimit(Number(value) as ContextLimit)}
              options={contextLimitSelectOptions}
              value={String(limit)}
            />
            <SearchableSelect
              allowEmpty={false}
              label="Evidence freshness"
              onValueChange={setMaxAgeSeconds}
              options={contextFreshnessOptions}
              value={maxAgeSeconds}
            />
          </div>
        </details>
      </form>
    </SectionSurface>
  );
}

function EmptyLab({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
  const layers = [
    {
      description: "Approved entities and matching facts",
      icon: Database,
      label: "Canonical catalog",
    },
    { description: "Attested policy selections", icon: ShieldCheck, label: "Governed policies" },
    { description: "Unpromoted claims with trust", icon: Sparkles, label: "Observed claims" },
    { description: "Participant-scoped checkpoints", icon: Braces, label: "Workspace recall" },
  ] as const;

  return (
    <SectionSurface
      description="One run keeps the four source layers separate, records a receipt, and exposes what was withheld."
      title="See what the resolver would supply"
    >
      <div className="grid border-y border-border-subtle sm:grid-cols-2 xl:grid-cols-4">
        {layers.map(({ description, icon: Icon, label }, index) => (
          <div
            key={label}
            className={
              index === 0
                ? "px-4 py-5"
                : index === 2
                  ? "border-t border-border-subtle px-4 py-5 sm:border-t-0 xl:border-l"
                  : "border-t border-border-subtle px-4 py-5 sm:border-t-0 sm:border-l"
            }
          >
            <Icon aria-hidden="true" className="size-5 text-accent" />
            <p className="mt-3 text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
          </div>
        ))}
      </div>
      <div className="pt-6">
        <p className="text-xs font-medium text-muted">Try an example</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {examplePrompts.map((example) => (
            <Button
              key={example}
              onClick={() => onUsePrompt(example)}
              size="compact"
              variant="secondary"
            >
              <MessageSquareText aria-hidden="true" className="size-4" />
              {example}
            </Button>
          ))}
        </div>
      </div>
    </SectionSurface>
  );
}

function TrustDetails({ trust }: { trust: ContextTrust | null }) {
  if (!trust) {
    return (
      <Notice title="Canonical source" variant="info">
        The catalog is the registry&apos;s approved state. The service deliberately does not attach
        a confidence or non-canonical trust label to this item.
      </Notice>
    );
  }

  const fields = [
    ["Trust", trust.trust],
    ["Assertion kind", trust.assertion_kind],
    ["Source", trust.source],
    ["Authority", trust.authority],
    ["Freshness", formatContextTimestamp(trust.freshness)],
    ["Mutability", trust.mutability],
    ["Attribution", trust.attribution ?? "Not reported"],
    ["Classification", trust.classification],
  ] as const;

  return (
    <section aria-label="Trust metadata">
      <h4 className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
        Trust metadata
      </h4>
      <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PayloadDetails({ item }: { item: ContextItem }) {
  return (
    <section aria-label="Returned context fields">
      <h4 className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
        Returned fields
      </h4>
      <dl className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {Object.entries(item.payload).map(([key, value]) => (
          <div className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4" key={key}>
            <dt className="text-xs font-medium text-muted">{humanizeContextField(key)}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground">
              {displayContextValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FeedbackControls({
  error,
  feedback,
  isPending,
  onRate,
}: {
  error: unknown;
  feedback: ContextFeedback | undefined;
  isPending: boolean;
  onRate: (rating: ContextFeedbackRating) => void;
}) {
  const selectedRating = feedback?.rating;
  return (
    <section aria-label="Context evaluation" className="border-t border-border-subtle pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Evaluate this item</h4>
          <p className="mt-1 text-xs leading-5 text-muted">
            This records human feedback against the exact receipt item. It does not promote the item
            or change canonical state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-pressed={selectedRating === "relevant"}
            disabled={isPending}
            onClick={() => onRate("relevant")}
            size="compact"
            variant={selectedRating === "relevant" ? "secondary" : "ghost"}
          >
            <ThumbsUp aria-hidden="true" className="size-4" />
            Relevant
          </Button>
          <Button
            aria-pressed={selectedRating === "irrelevant"}
            disabled={isPending}
            onClick={() => onRate("irrelevant")}
            size="compact"
            variant={selectedRating === "irrelevant" ? "secondary" : "ghost"}
          >
            <ThumbsDown aria-hidden="true" className="size-4" />
            Not relevant
          </Button>
          <Button
            aria-pressed={selectedRating === "needs_human_review"}
            disabled={isPending}
            onClick={() => onRate("needs_human_review")}
            size="compact"
            variant={selectedRating === "needs_human_review" ? "secondary" : "ghost"}
          >
            <AlertTriangle aria-hidden="true" className="size-4" />
            Needs review
          </Button>
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-xs leading-5 text-danger" role="alert">
          Feedback was not recorded. The context result is unchanged; retry this evaluation when the
          service is available.
        </p>
      ) : null}
    </section>
  );
}

function ContextItemRow({
  block,
  feedback,
  feedbackError,
  feedbackPending,
  mayReportFeedback,
  onRate,
  item,
}: {
  block: ContextBlock;
  feedback: ContextFeedback | undefined;
  feedbackError: unknown;
  feedbackPending: boolean;
  mayReportFeedback: boolean;
  onRate: (rating: ContextFeedbackRating) => void;
  item: ContextItem;
}) {
  return (
    <details className="group border-t border-border-subtle first:border-t-0">
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-6 py-4 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-strong">
          <BookOpenCheck aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {contextItemTitle(block, item)}
          </p>
          <p className="mt-1 truncate text-xs text-muted">{contextItemSummary(block, item)}</p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium text-foreground">{trustSummary(item.trust)}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            {shortContextIdentifier(item.receipt_item_id.item_key)}
          </p>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted transition-transform duration-150 group-open:rotate-90"
        />
      </summary>
      <div className="space-y-6 border-t border-border-subtle bg-surface-muted/40 px-6 py-5">
        <PayloadDetails item={item} />
        <TrustDetails trust={item.trust} />
        <section aria-label="Receipt item identity">
          <h4 className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
            Receipt identity
          </h4>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Source</dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">
                {item.receipt_item_id.source}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Item key</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                {item.receipt_item_id.item_key}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Receipt item digest</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
                {item.receipt_item_id.value}
              </dd>
            </div>
          </dl>
        </section>
        {mayReportFeedback ? (
          <FeedbackControls
            error={feedbackError}
            feedback={feedback}
            isPending={feedbackPending}
            onRate={onRate}
          />
        ) : (
          <p className="border-t border-border-subtle pt-4 text-xs leading-5 text-muted">
            This actor can inspect evaluation state but cannot write context feedback.
          </p>
        )}
      </div>
    </details>
  );
}

function emptyBlockMessage(block: ContextBlock, arcBlockNote: string | null): string {
  if (block.name === "arc" && arcBlockNote) return arcBlockNote;
  if (block.name === "canonical") return "No canonical catalog records matched this prompt.";
  if (block.name === "observed_claims") {
    return "No observed claims were available for the selected subject and time scope.";
  }
  if (block.name === "workspace") {
    return "No participant-visible task checkpoints matched this prompt and scope.";
  }
  return "No governed policies were requested or selected for this run.";
}

function ContextBlockSection({
  arcBlockNote,
  block,
  feedbackByItem,
  feedbackError,
  feedbackMutation,
  identity,
  receiptId,
}: {
  arcBlockNote: string | null;
  block: ContextBlock;
  feedbackByItem: Readonly<Record<string, ContextFeedback>>;
  feedbackError: { error: unknown; itemId: string } | null;
  feedbackMutation: {
    isPending: boolean;
    variables: FeedbackVariables | undefined;
    mutate: (variables: FeedbackVariables) => void;
  };
  identity: WhoAmI;
  receiptId: string;
}) {
  return (
    <SectionSurface
      action={
        <StatusBadge tone={contextBlockStateTone(block.state)}>
          {contextBlockStateLabel(block.state)}
        </StatusBadge>
      }
      description={contextBlockDescription(block.name)}
      flush
      title={contextBlockLabel(block.name)}
    >
      {block.reason ? (
        <div className="flex gap-3 border-y border-warning/25 bg-warning-subtle px-6 py-4 text-sm text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>{block.reason}</p>
        </div>
      ) : null}
      {block.items.length > 0 ? (
        <div>
          {block.items.map((item) => {
            const itemId = item.receipt_item_id.value;
            return (
              <ContextItemRow
                key={itemId}
                block={block}
                feedback={feedbackByItem[itemId]}
                feedbackError={feedbackError?.itemId === itemId ? feedbackError.error : null}
                feedbackPending={
                  feedbackMutation.isPending && feedbackMutation.variables?.itemId === itemId
                }
                item={item}
                mayReportFeedback={mayReportContextFeedback(identity)}
                onRate={(rating) =>
                  feedbackMutation.mutate({
                    idempotencyKey: `context-lab-${globalThis.crypto.randomUUID()}`,
                    itemId,
                    rating,
                    receiptId,
                  })
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {emptyBlockMessage(block, arcBlockNote)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Empty, failed, and withheld context remain distinct in the run trace.
          </p>
        </div>
      )}
    </SectionSurface>
  );
}

function ReceiptMetadata({ receipt }: { receipt: ContextReceipt }) {
  return (
    <dl className="space-y-3">
      <div>
        <dt className="text-xs text-muted">Resolved</dt>
        <dd className="mt-0.5 text-sm text-foreground">
          {formatContextTimestamp(receipt.resolved_at)}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Requested by</dt>
        <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
          {receipt.requested_by}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Request digest</dt>
        <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
          {receipt.request_digest ?? "Not reported"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Intent</dt>
        <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
          {receipt.intent_id ?? "No intent recorded"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Cacheable</dt>
        <dd className="mt-0.5 text-sm text-foreground">{receipt.cacheable ? "Yes" : "No"}</dd>
      </div>
    </dl>
  );
}

function RunTrace({
  envelope,
  exclusions,
  references,
  receipt,
  traceFailure,
  traceLoading,
  onRetryTrace,
}: {
  envelope: ContextEnvelope;
  exclusions: readonly { block: string; item_key: string; reason: string }[] | undefined;
  references: readonly ContextReference[] | undefined;
  receipt: ContextReceipt | undefined;
  traceFailure: unknown;
  traceLoading: boolean;
  onRetryTrace: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(envelope.receipt_id);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        action={
          <StatusBadge tone={contextEnvelopeStateTone(envelope.state)}>
            {contextEnvelopeStateLabel(envelope.state)}
          </StatusBadge>
        }
        description="The service's own record of this exact resolution: what it returned, and what it withheld."
        title="Run trace"
      >
        <div className="space-y-5">
          <div>
            <p className="text-xs text-muted">Receipt ID</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all text-xs leading-5 text-foreground">
                {envelope.receipt_id}
              </code>
              <Button
                aria-label="Copy receipt ID"
                onClick={() => void copyReceipt()}
                size="icon"
                variant="ghost"
              >
                {copyState === "copied" ? (
                  <Check aria-hidden="true" className="size-4 text-success" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
              </Button>
            </div>
            <p aria-live="polite" className="mt-1 text-xs text-muted">
              {copyState === "copied"
                ? "Receipt ID copied."
                : copyState === "failed"
                  ? "Receipt ID could not be copied."
                  : "Use this ID to audit the resolution later."}
            </p>
          </div>

          {traceFailure ? (
            <Notice
              action={
                <Button onClick={onRetryTrace} size="compact" variant="inset">
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Retry trace
                </Button>
              }
              title="Some trace details are unavailable"
              variant="warning"
            >
              Context items remain visible. Retry only the failed receipt reads.
            </Notice>
          ) : null}

          {receipt ? (
            <ReceiptMetadata receipt={receipt} />
          ) : traceLoading ? (
            <div aria-label="Loading receipt metadata" className="space-y-3" role="status">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : null}

          <div className="border-t border-border-subtle pt-5">
            <h3 className="text-sm font-semibold text-foreground">Quality</h3>
            {envelope.quality.reasons.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {envelope.quality.reasons.map((reason) => (
                  <li className="flex gap-2 text-xs leading-5 text-muted" key={reason}>
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0 text-warning"
                    />
                    {reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted">
                The service reported no degraded source blocks for this run.
              </p>
            )}
          </div>

          <div className="border-t border-border-subtle pt-5">
            <h3 className="text-sm font-semibold text-foreground">Withheld context</h3>
            {exclusions ? (
              exclusions.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {exclusions.map((exclusion) => (
                    <li key={`${exclusion.block}-${exclusion.item_key}`}>
                      <p className="text-xs font-medium text-foreground">
                        {humanizeContextField(exclusion.block)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">{exclusion.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted">
                  This receipt records no withheld items.
                </p>
              )
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted">
                Exclusion details are unavailable.
              </p>
            )}
          </div>

          <div className="border-t border-border-subtle pt-5">
            <h3 className="text-sm font-semibold text-foreground">External references</h3>
            {references ? (
              references.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {references.map((reference) => (
                    <li
                      key={`${reference.source_system}-${reference.kind}-${reference.external_id}`}
                    >
                      <p className="break-all font-mono text-xs text-foreground">
                        {reference.source_system}/{reference.source_namespace}/{reference.kind}/
                        {reference.external_id}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {humanizeContextField(reference.classification)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted">
                  This receipt records no external references.
                </p>
              )
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted">
                Reference details are unavailable.
              </p>
            )}
          </div>
        </div>
      </SectionSurface>

      <Notice title="How to read this evaluation" variant="info">
        Relevance feedback is evidence about one served item, not a model score or governance
        decision. Canonical, observed, and workspace context retain their original source status.
      </Notice>
    </div>
  );
}

function ContextResult({
  envelope,
  exclusions,
  feedbackByItem,
  feedbackError,
  feedbackMutation,
  identity,
  onRetryTrace,
  prompt,
  receipt,
  references,
  traceFailure,
  traceLoading,
}: {
  envelope: ContextEnvelope;
  exclusions: readonly { block: string; item_key: string; reason: string }[] | undefined;
  feedbackByItem: Readonly<Record<string, ContextFeedback>>;
  feedbackError: { error: unknown; itemId: string } | null;
  feedbackMutation: {
    isPending: boolean;
    variables: FeedbackVariables | undefined;
    mutate: (variables: FeedbackVariables) => void;
  };
  identity: WhoAmI;
  onRetryTrace: () => void;
  prompt: string;
  receipt: ContextReceipt | undefined;
  references: readonly ContextReference[] | undefined;
  traceFailure: unknown;
  traceLoading: boolean;
}) {
  const items: readonly SummaryItem[] = [
    {
      detail: "Service-reported envelope state",
      id: "state",
      label: "Resolution",
      value: contextEnvelopeStateLabel(envelope.state),
    },
    {
      detail: "Across all four source blocks",
      id: "items",
      label: "Context items",
      value: totalContextItems(envelope),
    },
    {
      detail: "Sources that returned at least one item",
      id: "sources",
      label: "Sources represented",
      value: `${returnedContextBlocks(envelope)} of 4`,
    },
    {
      detail: exclusions ? "Recorded on this receipt" : "Trace read incomplete",
      id: "withheld",
      label: "Withheld items",
      value: exclusions ? exclusions.length : "Unavailable",
    },
  ];

  return (
    <section aria-labelledby="context-result-title" className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.04em] text-accent uppercase">Latest run</p>
        <h2
          className="mt-2 text-xl font-semibold tracking-tight text-foreground"
          id="context-result-title"
        >
          Context returned for “{prompt}”
        </h2>
      </div>

      {envelope.state === "blocked" ? (
        <Notice title="Do not rely on this context" variant="danger">
          The canonical source failed, so the service marked the envelope blocked. Other source
          blocks remain visible for diagnosis, not as a complete answer.
        </Notice>
      ) : envelope.state === "degraded" ? (
        <Notice title="This context is incomplete" variant="warning">
          One or more sources failed, withheld items, or reached a result bound. Review the source
          status and run trace before using the result.
        </Notice>
      ) : totalContextItems(envelope) === 0 ? (
        <Notice title="No context matched this prompt" variant="info">
          All source reads completed, but none returned an item. Adjust the prompt or optional
          scope; this is not presented as a failed request.
        </Notice>
      ) : null}

      <SummaryStrip items={items} label="Context resolution summary" />

      <DetailLayout
        aside={
          <RunTrace
            envelope={envelope}
            exclusions={exclusions}
            onRetryTrace={onRetryTrace}
            receipt={receipt}
            references={references}
            traceFailure={traceFailure}
            traceLoading={traceLoading}
          />
        }
      >
        <div className="space-y-6">
          {envelope.blocks.map((block) => (
            <ContextBlockSection
              key={block.name}
              arcBlockNote={envelope.arc_block_note}
              block={block}
              feedbackByItem={feedbackByItem}
              feedbackError={feedbackError}
              feedbackMutation={feedbackMutation}
              identity={identity}
              receiptId={envelope.receipt_id}
            />
          ))}
        </div>
      </DetailLayout>
    </section>
  );
}

function ContextLab({
  apiTenantId,
  client,
  identity,
  searchRef,
}: {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const [prompt, setPrompt] = useState("");
  const [successfulPrompt, setSuccessfulPrompt] = useState("");
  const [feedbackByItem, setFeedbackByItem] = useState<Record<string, ContextFeedback>>({});
  const [feedbackError, setFeedbackError] = useState<{ error: unknown; itemId: string } | null>(
    null,
  );
  const { showToast } = useToast();
  const tenantKey = queryTenantKey(apiTenantId);
  const context = requestContext(apiTenantId);

  const resolveMutation = useMutation({
    mutationFn: (input: ResolveContextInput) => resolveContext(client, input, context),
    onSuccess(_envelope, input) {
      setSuccessfulPrompt(input.query);
      setFeedbackByItem({});
      setFeedbackError(null);
    },
  });

  const receiptId = resolveMutation.data?.receipt_id ?? "";
  const receiptQuery = useQuery({
    enabled: Boolean(receiptId),
    queryFn: ({ signal }) => getContextReceipt(client, receiptId, context, signal),
    queryKey: ["context-lab", tenantKey, receiptId, "receipt"],
  });
  const exclusionsQuery = useQuery({
    enabled: Boolean(receiptId),
    queryFn: ({ signal }) => getContextReceiptExclusions(client, receiptId, context, signal),
    queryKey: ["context-lab", tenantKey, receiptId, "exclusions"],
  });
  const referencesQuery = useQuery({
    enabled: Boolean(receiptId),
    queryFn: ({ signal }) => getContextReceiptReferences(client, receiptId, context, signal),
    queryKey: ["context-lab", tenantKey, receiptId, "references"],
  });

  const feedbackMutation = useMutation({
    mutationFn: (variables: FeedbackVariables) =>
      recordContextFeedback(
        client,
        {
          idempotencyKey: variables.idempotencyKey,
          rating: variables.rating,
          receiptId: variables.receiptId,
          receiptItemId: variables.itemId,
          reporterId: identity.actor_id,
        },
        context,
      ),
    onError(error, variables) {
      setFeedbackError({ error, itemId: variables.itemId });
    },
    onMutate(variables) {
      setFeedbackError((current) => (current?.itemId === variables.itemId ? null : current));
    },
    onSuccess(feedback, variables) {
      setFeedbackByItem((current) => ({ ...current, [variables.itemId]: feedback }));
      setFeedbackError(null);
      showToast({
        message: `Feedback recorded as ${humanizeContextField(feedback.rating)}.`,
        title: "Context evaluation updated",
        variant: "success",
      });
    },
  });

  const failedTraceQueries = [receiptQuery, exclusionsQuery, referencesQuery].filter(
    (query) => query.isError,
  );
  const firstTraceFailure = failedTraceQueries[0]?.error;
  const traceLoading = [receiptQuery, exclusionsQuery, referencesQuery].some(
    (query) => query.isLoading,
  );

  function retryTrace() {
    for (const query of failedTraceQueries) void query.refetch();
  }

  return (
    <PageContainer className="space-y-8">
      <ContextLabHeader identity={identity} />
      <PromptComposer
        isPending={resolveMutation.isPending}
        onSubmit={(input) => resolveMutation.mutate(input)}
        prompt={prompt}
        searchRef={searchRef}
        setPrompt={setPrompt}
      />

      {resolveMutation.isError ? (
        <QueryFailure
          error={resolveMutation.error}
          onRetry={() => {
            if (resolveMutation.variables) resolveMutation.mutate(resolveMutation.variables);
          }}
        />
      ) : null}

      {resolveMutation.data ? (
        <ContextResult
          envelope={resolveMutation.data}
          exclusions={exclusionsQuery.data}
          feedbackByItem={feedbackByItem}
          feedbackError={feedbackError}
          feedbackMutation={feedbackMutation}
          identity={identity}
          onRetryTrace={retryTrace}
          prompt={successfulPrompt}
          receipt={receiptQuery.data}
          references={referencesQuery.data}
          traceFailure={firstTraceFailure}
          traceLoading={traceLoading}
        />
      ) : (
        <EmptyLab
          onUsePrompt={(example) => {
            setPrompt(example);
            window.requestAnimationFrame(() => searchRef.current?.focus());
          }}
        />
      )}
    </PageContainer>
  );
}

export function ContextLabPage({
  activeTenantName,
  apiTenantId,
  client,
  searchRef,
}: ContextLabPageProps) {
  const context = requestContext(apiTenantId);
  const identityQuery = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", queryTenantKey(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identityQuery.isLoading) return <PageSkeleton controls={2} />;
  if (identityQuery.isError) {
    return (
      <PageContainer className="space-y-8">
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Context Lab" }]}
          description="Context Lab becomes available after the service resolves the current bearer credential to an actor and tenant."
          title="Context Lab"
        />
        <QueryFailure error={identityQuery.error} onRetry={() => void identityQuery.refetch()} />
      </PageContainer>
    );
  }
  if (!identityQuery.data) return null;

  return (
    <ContextLab
      {...(apiTenantId ? { apiTenantId } : {})}
      client={client}
      identity={identityQuery.data}
      searchRef={searchRef}
    />
  );
}
