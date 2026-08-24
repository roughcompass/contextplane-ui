import {
  CheckCircle2,
  CircleHelp,
  Copy,
  FileCheck2,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent, type RefObject } from "react";

import {
  EmptyState,
  PageContainer,
  SectionSurface,
  SummaryStrip,
  TableSection,
} from "@repo/ui/layouts";
import { PageHeader } from "../../shared/navigation/surface";
import {
  Button,
  Notice,
  RequestFailure,
  ResourcePicker,
  SearchableSelect,
  Skeleton,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  admitArcConnectorFetch,
  admitArcGraphPromotion,
  admitArcSourceUpload,
  getArcReceiptDetail,
  getArcSourceEvidence,
  type AdmitArcConnectorFetchInput,
  type AdmitArcGraphPromotionInput,
  type AdmitArcSourceUploadInput,
  type ArcReceiptDetail,
  type ArcSourceEvidence,
} from "../../shared/api/arcAuthoring";
import type { ContextplaneRequestOptions } from "../../shared/api/client";
import { ContextplaneApiError, type ContextplaneClient } from "../../shared/api/client";
import {
  createArcArtifactFamily,
  editArcProposalVersion,
  explainArcResolutionReceipt,
  getArcArtifactFamily,
  getArcProposalVersion,
  getArcResolutionReceipt,
  getToolUsage,
  getWhoAmI,
  openArcProposal,
  type ArcArtifactFamily,
  type ArcProposalPatchRequest,
  type ArcProposalVersion,
  type ArcStructuredResponse,
  type CreateArcArtifactFamilyInput,
  type WhoAmI,
} from "../../shared/api/contextplane";
import { receiptSource, tenantSource } from "../../shared/pickers/sources";
import { ArcArtifactDialog } from "./ArcArtifactDialog";
import { ArcAuthoringContext } from "./ArcAuthoringContext";
import { ArcDirectiveEditor } from "./ArcDirectiveEditor";
import { ArcLifecyclePanel } from "./ArcLifecyclePanel";
import { ArcPolicyIndex } from "./ArcPolicyIndex";
import { ArcSourceEvidenceSection } from "./ArcSourceEvidenceSection";
import { ArcWalkthrough } from "./ArcWalkthrough";
import {
  arcDetailRequestKindOptions,
  formatArcCount,
  formatArcDate,
  formatArcLabel,
  getArcToolUsage,
  getArcUsageWindow,
  toArcReceiptView,
} from "./arcModel";

interface ArcPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
  searchRef: RefObject<HTMLInputElement | null>;
}

interface ArcPageContentProps {
  client: ContextplaneClient;
  identity: WhoAmI;
  requestContext: ContextplaneRequestOptions;
  searchRef: RefObject<HTMLInputElement | null>;
}

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";
const tableHeaderClassName =
  "border-b border-border bg-surface-muted px-4 py-3 text-left text-xs font-semibold tracking-[0.04em] text-muted uppercase";
const tableCellClassName =
  "border-b border-border-subtle px-4 py-3 align-top text-sm text-foreground";

function queryTenantKey(requestContext: ContextplaneRequestOptions): string {
  return requestContext.tenantId ?? "credential-default";
}

type ArcView = "authoring" | "runtime" | "usage";
type ArcAuthoringStep = "activation" | "candidate" | "draft" | "evidence" | "identity";
type ArcLocationKey = "artifact" | "proposal" | "receipt" | "source" | "step" | "version" | "view";

const arcViews: readonly { description: string; id: ArcView; label: string }[] = [
  { description: "Create and advance a policy revision", id: "authoring", label: "Author policy" },
  { description: "Explain what an agent received", id: "runtime", label: "Runtime evidence" },
  { description: "Inspect aggregate policy-tool calls", id: "usage", label: "Usage" },
];

const authoringStepLabels: Readonly<Record<ArcAuthoringStep, string>> = {
  activation: "Review and activate",
  candidate: "Write policy",
  draft: "Open draft",
  evidence: "Bind evidence",
  identity: "Choose policy",
};

const authoringStepOrder: readonly ArcAuthoringStep[] = [
  "identity",
  "evidence",
  "draft",
  "candidate",
  "activation",
];

function isArcView(value: string | null): value is ArcView {
  return arcViews.some((view) => view.id === value);
}

function isArcAuthoringStep(value: string | null): value is ArcAuthoringStep {
  return authoringStepOrder.some((step) => step === value);
}

function readArcView(search: string): ArcView {
  const parameters = new URLSearchParams(search);
  const requested = parameters.get("view");
  if (isArcView(requested)) return requested;
  return parameters.has("receipt") ? "runtime" : "authoring";
}

function readArcAuthoringStep(search: string): ArcAuthoringStep {
  const parameters = new URLSearchParams(search);
  const requested = parameters.get("step");
  if (isArcAuthoringStep(requested)) return requested;
  if (parameters.has("proposal")) return "candidate";
  if (parameters.has("source")) return "draft";
  if (parameters.has("artifact")) return "evidence";
  return "identity";
}

function arcLocationValue(key: ArcLocationKey): string {
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function replaceArcLocation(updates: Partial<Record<ArcLocationKey, string | null>>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, "", url);
}

function pushArcLocation(updates: Partial<Record<ArcLocationKey, string | null>>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.pushState(window.history.state, "", url);
}

function requestId(error: unknown): string | null {
  return error instanceof ContextplaneApiError ? error.requestId : null;
}

function errorDescription(error: unknown, noun: string): string {
  if (error instanceof ContextplaneApiError) {
    if (error.status === 404) {
      return `This ${noun} could not be found, or you do not have access to it.`;
    }
    if (error.status === 403) {
      return `You do not have permission to access this ${noun} for the selected tenant.`;
    }
    if (error.code === "tenant_required") {
      return "Choose a tenant from the application header, then retry.";
    }
    if (error.status === 412) {
      return `This ${noun} changed since it was loaded. Refresh it before continuing; entered work remains available.`;
    }
    if (error.status === 429) {
      return `Too many requests were made. Wait a moment, then retry this ${noun}.`;
    }
    if (error.status >= 500) {
      return `The ${noun} service is temporarily unavailable. Existing context remains unchanged.`;
    }
    return `The ${noun} request could not be completed. Review the entered values and retry.`;
  }
  return `The ${noun} could not be loaded. Existing context remains unchanged.`;
}

function ShortId({ value }: { value: string }) {
  return (
    <code className="break-all text-xs text-muted" title={value}>
      {value}
    </code>
  );
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const { showToast } = useToast();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ShortId value={value} />
      <Button
        aria-label={`Copy ${label}`}
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          showToast({ message: value, title: `${label} copied`, variant: "success" });
        }}
        size="icon"
        title={`Copy ${label}`}
        variant="ghost"
      >
        <Copy aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div aria-label={label} className="space-y-3" role="status">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function QueryError({
  error,
  noun,
  onRetry,
}: {
  error: unknown;
  noun: string;
  onRetry: () => void;
}) {
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={requestId(error)}
      title={`${formatArcLabel(noun)} unavailable`}
    >
      {errorDescription(error, noun)}
    </RequestFailure>
  );
}

function StructuredInspector({ label, value }: { label: string; value: ArcStructuredResponse }) {
  const scalarEntries = Object.entries(value).filter(([, candidate]) =>
    ["boolean", "number", "string"].includes(typeof candidate),
  );
  return (
    <div className="space-y-4">
      {scalarEntries.length ? (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scalarEntries.map(([key, candidate]) => (
            <div key={key} className="rounded-md border border-border-subtle bg-surface-muted p-3">
              <dt className="text-xs font-medium text-muted">{formatArcLabel(key)}</dt>
              <dd className="mt-1 break-words text-sm font-medium text-foreground">
                {String(candidate)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <details className="rounded-md border border-border-subtle">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
          View complete {label.toLocaleLowerCase()}
        </summary>
        <pre className="max-h-96 overflow-auto border-t border-border-subtle bg-surface-muted p-4 text-xs leading-5 text-muted">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ArcSubmenu({
  activeView,
  onChange,
}: {
  activeView: ArcView;
  onChange: (view: ArcView) => void;
}) {
  return (
    <nav aria-label="Governed policy areas" className="lg:sticky lg:top-24">
      <p className="mb-2 px-3 text-xs font-medium text-muted">Policy workspace</p>
      <ul className="grid grid-cols-3 gap-1 lg:block lg:space-y-1">
        {arcViews.map((view) => {
          const url = new URL(window.location.href);
          url.searchParams.set("view", view.id);
          return (
            <li key={view.id}>
              <a
                aria-current={activeView === view.id ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center rounded-md border-b-2 px-2 py-2 text-center text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:justify-start lg:border-b-0 lg:border-l-2 lg:px-3 lg:text-left ${
                  activeView === view.id
                    ? "border-accent bg-accent-subtle font-semibold text-accent-strong"
                    : "border-transparent text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
                href={`${url.pathname}${url.search}`}
                id={`arc-view-${view.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  onChange(view.id);
                }}
                title={view.description}
              >
                {view.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AuthoringProgress({
  activeStep,
  availableSteps,
  canAuthor,
  completedSteps,
  onChange,
}: {
  activeStep: ArcAuthoringStep;
  availableSteps: Readonly<Record<ArcAuthoringStep, boolean>>;
  canAuthor: boolean;
  completedSteps: Readonly<Record<ArcAuthoringStep, boolean>>;
  onChange: (step: ArcAuthoringStep) => void;
}) {
  return (
    <nav aria-label="Policy authoring progress">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {authoringStepOrder.map((step, index) => {
          const active = activeStep === step;
          const available = availableSteps[step];
          const complete = completedSteps[step];
          return (
            <li
              className={
                index === authoringStepOrder.length - 1 ? "col-span-2 sm:col-span-1" : undefined
              }
              key={step}
            >
              <button
                aria-current={active ? "step" : undefined}
                className={`flex min-h-14 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? "border-accent bg-accent-subtle text-foreground"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
                }`}
                disabled={!available}
                onClick={() => onChange(step)}
                title={
                  available
                    ? `Open step ${index + 1}: ${authoringStepLabels[step]}`
                    : canAuthor
                      ? "Complete the previous step first"
                      : "Policy authoring requires the administrator role"
                }
                type="button"
              >
                {complete ? (
                  <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-[0.6875rem]"
                  >
                    {index + 1}
                  </span>
                )}
                <span>{authoringStepLabels[step]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ArcPage({ activeTenantName, apiTenantId, client, searchRef }: ArcPageProps) {
  const requestContext = apiTenantId ? { tenantId: apiTenantId } : {};
  const tenantKey = queryTenantKey(requestContext);
  const identityQuery = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "identity"],
    staleTime: 5 * 60 * 1000,
  });

  if (identityQuery.isPending) {
    return (
      <PageContainer width="standard">
        <PageHeader
          description={`Loading policy governance context for ${activeTenantName}.`}
          title="Policies"
        />
        <SectionSurface title="Resolving authorization">
          <LoadingBlock label="Loading policy authorization" />
        </SectionSurface>
      </PageContainer>
    );
  }

  if (identityQuery.isError) {
    return (
      <PageContainer width="standard">
        <PageHeader
          description="Author versioned, source-backed policy and inspect what agents received at runtime."
          title="Policies"
        />
        <RequestFailure
          onRetry={() => void identityQuery.refetch()}
          requestId={requestId(identityQuery.error)}
          title="Policy authorization could not be resolved"
        >
          {errorDescription(identityQuery.error, "policy")}
        </RequestFailure>
      </PageContainer>
    );
  }

  return (
    <ArcPageContent
      client={client}
      identity={identityQuery.data}
      requestContext={requestContext}
      searchRef={searchRef}
    />
  );
}

function ArcPageContent({ client, identity, requestContext, searchRef }: ArcPageContentProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const tenantKey = queryTenantKey(requestContext);
  const isAdmin = identity.roles.includes("admin");
  const [activeView, setActiveView] = useState(() => readArcView(window.location.search));
  const [activeStep, setActiveStep] = useState(() => readArcAuthoringStep(window.location.search));
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(
    () => new URLSearchParams(window.location.search).get("view") === "walkthrough",
  );
  const [artifactInput, setArtifactInput] = useState(() => arcLocationValue("artifact"));
  const [artifactLookupId, setArtifactLookupId] = useState(() => arcLocationValue("artifact"));
  const [selectedSource, setSelectedSource] = useState<ArcSourceEvidence | null>(null);
  const [baselineRevisionId, setBaselineRevisionId] = useState("");
  const [proposalInput, setProposalInput] = useState(() => arcLocationValue("proposal"));
  const [proposalLookupId, setProposalLookupId] = useState(() => arcLocationValue("proposal"));
  const [proposalVersion, setProposalVersion] = useState(() => {
    const value = Number(arcLocationValue("version"));
    return Number.isInteger(value) && value > 0 ? value : 1;
  });
  const [receiptInput, setReceiptInput] = useState(() => arcLocationValue("receipt"));
  const [receiptLookupId, setReceiptLookupId] = useState(() => arcLocationValue("receipt"));
  const [receipt, setReceipt] = useState<ArcStructuredResponse | null>(null);
  const [receiptExplanation, setReceiptExplanation] = useState<ArcStructuredResponse | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<ArcReceiptDetail | null>(null);
  const [receiptPending, setReceiptPending] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<unknown>(null);
  const [detailContextHandle, setDetailContextHandle] = useState("");
  const [detailRequestKind, setDetailRequestKind] = useState<
    "directive" | "query" | "source_anchor"
  >("directive");
  const [detailSelector, setDetailSelector] = useState("{}");
  const [detailContextError, setDetailContextError] = useState("");
  const [detailSelectorError, setDetailSelectorError] = useState("");
  const [detailRequestError, setDetailRequestError] = useState<unknown>(null);
  const usageWindow = useMemo(() => getArcUsageWindow(), []);

  // Rebuilt from the tenant rather than from `requestContext`, which this page
  // constructs fresh each render: depending on the object would change the
  // identity of the `load` a picker's effect watches and re-request per
  // keystroke.
  const tenants = useMemo(
    () => tenantSource(client, requestContext.tenantId ? { tenantId: requestContext.tenantId } : {}),
    [client, requestContext.tenantId],
  );
  const receipts = useMemo(
    () => receiptSource(client, requestContext.tenantId ? { tenantId: requestContext.tenantId } : {}),
    [client, requestContext.tenantId],
  );

  useEffect(() => {
    function restoreArcLocation() {
      setActiveView(readArcView(window.location.search));
      setActiveStep(readArcAuthoringStep(window.location.search));
      setWalkthroughOpen(new URLSearchParams(window.location.search).get("view") === "walkthrough");
    }
    window.addEventListener("popstate", restoreArcLocation);
    return () => window.removeEventListener("popstate", restoreArcLocation);
  }, []);

  function changeView(view: ArcView) {
    pushArcLocation({ view });
    setActiveView(view);
  }

  function changeStep(step: ArcAuthoringStep) {
    pushArcLocation({ step, view: "authoring" });
    setActiveView("authoring");
    setActiveStep(step);
  }

  function closeWalkthrough() {
    setWalkthroughOpen(false);
    if (new URLSearchParams(window.location.search).get("view") === "walkthrough") {
      replaceArcLocation({ view: "authoring" });
      setActiveView("authoring");
    }
  }

  function startAuthoringFromWalkthrough() {
    closeWalkthrough();
    if (activeView !== "authoring") changeView("authoring");
  }

  const artifactQuery = useQuery({
    enabled: Boolean(artifactLookupId),
    queryFn: ({ signal }) => getArcArtifactFamily(client, artifactLookupId, requestContext, signal),
    queryKey: ["arc", tenantKey, "artifact", artifactLookupId],
    retry: false,
  });

  const proposalQuery = useQuery({
    enabled: Boolean(proposalLookupId && proposalVersion > 0),
    queryFn: ({ signal }) =>
      getArcProposalVersion(client, proposalLookupId, proposalVersion, requestContext, signal),
    queryKey: ["arc", tenantKey, "proposal-version", proposalLookupId, proposalVersion],
    retry: false,
  });
  const activeProposal = proposalQuery.data ?? null;

  const proposalArtifactQuery = useQuery({
    enabled: Boolean(
      activeProposal?.artifact_id && activeProposal.artifact_id !== artifactLookupId,
    ),
    queryFn: ({ signal }) =>
      getArcArtifactFamily(client, activeProposal?.artifact_id ?? "", requestContext, signal),
    queryKey: ["arc", tenantKey, "artifact", activeProposal?.artifact_id ?? ""],
    retry: false,
  });
  const activeArtifact = activeProposal
    ? activeProposal.artifact_id === artifactQuery.data?.artifact_id
      ? artifactQuery.data
      : activeProposal.artifact_id === proposalArtifactQuery.data?.artifact_id
        ? proposalArtifactQuery.data
        : null
    : (artifactQuery.data ?? null);

  const resumedSourceId = activeProposal?.source_evidence_id ?? arcLocationValue("source");
  const resumedSourceQuery = useQuery({
    enabled: Boolean(!selectedSource && resumedSourceId),
    queryFn: ({ signal }) => getArcSourceEvidence(client, resumedSourceId, requestContext, signal),
    queryKey: ["arc", tenantKey, "source-evidence", resumedSourceId],
    retry: false,
  });
  const activeSource = activeProposal
    ? activeProposal.source_evidence_id === selectedSource?.source_evidence_id
      ? selectedSource
      : activeProposal.source_evidence_id === resumedSourceQuery.data?.source_evidence_id
        ? resumedSourceQuery.data
        : null
    : (selectedSource ?? resumedSourceQuery.data ?? null);

  const usageQuery = useQuery({
    enabled: isAdmin && activeView === "usage",
    queryFn: ({ signal }) => getToolUsage(client, usageWindow, requestContext, signal),
    queryKey: ["arc", tenantKey, "usage", usageWindow.from, usageWindow.to],
    staleTime: 60_000,
  });
  const arcUsage = usageQuery.data ? getArcToolUsage(usageQuery.data) : [];

  function updateProposal(nextProposal: ArcProposalVersion) {
    queryClient.setQueryData(
      [
        "arc",
        tenantKey,
        "proposal-version",
        nextProposal.proposal_id,
        nextProposal.proposal_version,
      ],
      nextProposal,
    );
    setProposalInput(nextProposal.proposal_id);
    setProposalLookupId(nextProposal.proposal_id);
    setProposalVersion(nextProposal.proposal_version);
    replaceArcLocation({
      artifact: nextProposal.artifact_id,
      proposal: nextProposal.proposal_id,
      source: nextProposal.source_evidence_id,
      version: String(nextProposal.proposal_version),
    });
  }

  function selectArtifact(artifact: ArcArtifactFamily) {
    queryClient.setQueryData(["arc", tenantKey, "artifact", artifact.artifact_id], artifact);
    setArtifactInput(artifact.artifact_id);
    setArtifactLookupId(artifact.artifact_id);
    setSelectedSource(null);
    setBaselineRevisionId("");
    setProposalInput("");
    setProposalLookupId("");
    setProposalVersion(1);
    replaceArcLocation({
      artifact: artifact.artifact_id,
      proposal: null,
      source: null,
      version: null,
    });
    changeStep("evidence");
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateArcArtifactFamilyInput) =>
      createArcArtifactFamily(client, input, requestContext),
    onSuccess: (artifact) => {
      void queryClient.invalidateQueries({ queryKey: ["arc", tenantKey, "artifact-families"] });
      selectArtifact(artifact);
      showToast({
        message: "Now bind approved source evidence before opening a draft.",
        title: "Policy created",
        variant: "success",
      });
    },
  });

  const openProposalMutation = useMutation({
    mutationFn: ({
      artifact,
      source,
    }: {
      artifact: ArcArtifactFamily;
      source: ArcSourceEvidence;
    }) =>
      openArcProposal(
        client,
        artifact.artifact_id,
        {
          idempotencyKey: crypto.randomUUID(),
          ...(baselineRevisionId.trim()
            ? { reviewedBaselineRevisionId: baselineRevisionId.trim() }
            : {}),
          sourceEvidenceId: source.source_evidence_id,
        },
        requestContext,
      ),
    onSuccess: (proposal) => {
      updateProposal(proposal);
      changeStep("candidate");
      showToast({
        message: "The draft is bound to immutable source evidence and ready for policy content.",
        title: "Draft version opened",
        variant: "success",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: (patch: ArcProposalPatchRequest) =>
      editArcProposalVersion(
        client,
        activeProposal?.proposal_id ?? "",
        activeProposal?.proposal_version ?? 0,
        patch,
        requestContext,
      ),
    onSuccess: (proposal) => {
      updateProposal(proposal);
      changeStep("activation");
      showToast({
        message: "The service persisted structured semantics and field provenance together.",
        title: "Candidate saved",
        variant: "success",
      });
    },
  });

  function lookUpArtifact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = artifactInput.trim();
    if (!value) return;
    setArtifactLookupId(value);
    setSelectedSource(null);
    setBaselineRevisionId("");
    setProposalInput("");
    setProposalLookupId("");
    setProposalVersion(1);
    replaceArcLocation({ artifact: value, proposal: null, source: null, version: null });
  }

  function resumeProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = proposalInput.trim();
    if (!value || proposalVersion < 1) return;
    setSelectedSource(null);
    setProposalLookupId(value);
    replaceArcLocation({ proposal: value, version: String(proposalVersion) });
    changeStep("candidate");
  }

  async function lookupSource(sourceEvidenceId: string): Promise<ArcSourceEvidence> {
    return getArcSourceEvidence(client, sourceEvidenceId, requestContext);
  }

  async function admitUpload(input: AdmitArcSourceUploadInput): Promise<ArcSourceEvidence> {
    return admitArcSourceUpload(client, input, requestContext);
  }

  async function admitConnector(input: AdmitArcConnectorFetchInput): Promise<ArcSourceEvidence> {
    return admitArcConnectorFetch(client, input, requestContext);
  }

  async function admitGraphPromotion(
    input: AdmitArcGraphPromotionInput,
  ): Promise<ArcSourceEvidence> {
    return admitArcGraphPromotion(client, input, requestContext);
  }

  async function loadReceipt() {
    const value = receiptInput.trim();
    if (!value) return;
    setReceiptPending("receipt");
    setReceiptError(null);
    setReceiptLookupId(value);
    replaceArcLocation({ receipt: value });
    try {
      setReceipt(await getArcResolutionReceipt(client, value, requestContext));
    } catch (error) {
      setReceiptError(error);
    } finally {
      setReceiptPending(null);
    }
  }

  async function explainReceipt() {
    if (!receiptLookupId) return;
    setReceiptPending("explanation");
    setReceiptError(null);
    try {
      setReceiptExplanation(
        await explainArcResolutionReceipt(client, receiptLookupId, requestContext),
      );
    } catch (error) {
      setReceiptError(error);
    } finally {
      setReceiptPending(null);
    }
  }

  async function loadReceiptDetail() {
    if (!receiptLookupId) return;
    setDetailContextError("");
    setDetailSelectorError("");
    setDetailRequestError(null);
    if (!detailContextHandle.trim()) {
      setDetailContextError("Enter the context handle from the consuming workflow.");
      return;
    }
    let selector: Readonly<Record<string, unknown>>;
    try {
      const parsed: unknown = JSON.parse(detailSelector);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("selector must be an object");
      }
      selector = Object.fromEntries(Object.entries(parsed));
    } catch {
      setDetailSelectorError("Enter a valid JSON object, such as {}.");
      return;
    }
    setReceiptPending("detail");
    try {
      setReceiptDetail(
        await getArcReceiptDetail(
          client,
          receiptLookupId,
          {
            contextHandle: detailContextHandle.trim(),
            idempotencyKey: crypto.randomUUID(),
            requestKind: detailRequestKind,
            selector,
          },
          requestContext,
        ),
      );
    } catch (error) {
      setDetailRequestError(error);
    } finally {
      setReceiptPending(null);
    }
  }

  const receiptView = receipt ? toArcReceiptView(receipt) : null;
  const completedSteps: Readonly<Record<ArcAuthoringStep, boolean>> = {
    activation: activeProposal?.state === "activated",
    candidate: Boolean(
      activeProposal &&
      (activeProposal.available_actions.includes("validate") || activeProposal.state !== "open"),
    ),
    draft: Boolean(activeProposal),
    evidence: Boolean(activeSource),
    identity: Boolean(activeArtifact),
  };
  const availableSteps: Readonly<Record<ArcAuthoringStep, boolean>> = {
    activation: Boolean(isAdmin && activeProposal),
    candidate: Boolean(isAdmin && activeArtifact && activeSource && activeProposal),
    draft: Boolean(isAdmin && activeArtifact && activeSource),
    evidence: Boolean(isAdmin && activeArtifact),
    identity: true,
  };

  return (
    <PageContainer width="standard">
      <PageHeader
        actions={
          <>
            <Button onClick={() => setWalkthroughOpen(true)} variant="ghost">
              <CircleHelp aria-hidden="true" className="size-4" />
              How it works
            </Button>
            {isAdmin && activeView === "authoring" && activeStep === "identity" ? (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Create policy
              </Button>
            ) : null}
          </>
        }
        description="Turn approved source material into versioned policy that agents can receive, verify, and explain."
        title="Policies"
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <ArcSubmenu activeView={activeView} onChange={changeView} />

        <div
          aria-labelledby={`arc-view-${activeView}`}
          className="min-w-0"
          id={`arc-panel-${activeView}`}
        >
          {activeView === "authoring" ? (
            <div className="space-y-6">
              {!isAdmin ? (
                <Notice title="Policy authoring requires administrator access" variant="warning">
                  You can browse policy records and inspect runtime evidence. Ask a tenant
                  administrator to create policies, bind evidence, or manage revisions.
                </Notice>
              ) : null}

              <AuthoringProgress
                activeStep={activeStep}
                availableSteps={availableSteps}
                canAuthor={isAdmin}
                completedSteps={completedSteps}
                onChange={changeStep}
              />

              {isAdmin && activeArtifact && activeStep !== "identity" ? (
                <ArcAuthoringContext
                  artifact={activeArtifact}
                  onChangePolicy={() => changeStep("identity")}
                  proposal={activeProposal}
                  source={activeSource}
                />
              ) : null}

              {activeStep === "identity" ? (
                <div className="space-y-4" id="arc-step-identity">
                  <ArcPolicyIndex
                    client={client}
                    {...(isAdmin ? { onCreate: () => setCreateDialogOpen(true) } : {})}
                    {...(isAdmin ? { onSelect: selectArtifact } : {})}
                    requestContext={requestContext}
                    searchRef={searchRef}
                    {...(activeArtifact ? { selectedPolicyId: activeArtifact.artifact_id } : {})}
                    tenantKey={tenantKey}
                  />

                  <details className="rounded-lg border border-border bg-surface">
                    <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-foreground">
                      Open directly by policy ID
                    </summary>
                    <div className="border-t border-border px-6 py-5">
                      <p className="mb-4 text-sm text-muted">
                        Use this fallback for a known UUID that is outside the current page or
                        filter.
                      </p>
                      <form
                        className="flex flex-col gap-3 sm:flex-row sm:items-end"
                        onSubmit={lookUpArtifact}
                      >
                        <label
                          className={`${labelClassName} min-w-0 flex-1`}
                          htmlFor="arc-artifact-id"
                        >
                          Policy ID
                          <input
                            className={`${inputClassName} mt-1.5 font-mono`}
                            id="arc-artifact-id"
                            onChange={(event) => setArtifactInput(event.currentTarget.value)}
                            placeholder="UUID"
                            value={artifactInput}
                          />
                        </label>
                        <Button type="submit" variant="secondary">
                          <Search aria-hidden="true" className="size-4" />
                          Load policy
                        </Button>
                      </form>

                      {artifactQuery.isPending && artifactLookupId ? (
                        <div className="mt-5">
                          <LoadingBlock label="Loading policy" />
                        </div>
                      ) : artifactQuery.isError ? (
                        <div className="mt-5">
                          <QueryError
                            error={artifactQuery.error}
                            noun="policy"
                            onRetry={() => void artifactQuery.refetch()}
                          />
                        </div>
                      ) : activeArtifact ? (
                        <div className="mt-5 border-t border-border pt-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-base font-semibold text-foreground">
                                {activeArtifact.title}
                              </p>
                              <p className="mt-1 text-sm text-muted">
                                {formatArcLabel(activeArtifact.kind)} ·{" "}
                                {formatArcLabel(activeArtifact.owning_scope)}
                              </p>
                            </div>
                            <StatusBadge
                              tone={activeArtifact.active_revision_id ? "success" : "neutral"}
                            >
                              {activeArtifact.active_revision_id
                                ? "Active revision"
                                : "No active revision"}
                            </StatusBadge>
                          </div>
                          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <dt className="text-xs font-medium text-muted">Policy ID</dt>
                              <dd className="mt-1">
                                <CopyableId label="Policy ID" value={activeArtifact.artifact_id} />
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-muted">Stable slug</dt>
                              <dd className="mt-1 text-sm text-foreground">
                                {activeArtifact.slug}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-muted">Created</dt>
                              <dd className="mt-1 text-sm text-foreground">
                                {formatArcDate(activeArtifact.created_at)}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-4 flex justify-end">
                            <Button onClick={() => changeStep("evidence")}>Bind evidence</Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}

              {activeStep === "evidence" && isAdmin && activeArtifact ? (
                <ArcSourceEvidenceSection
                  onAdmitConnector={admitConnector}
                  onAdmitGraphPromotion={admitGraphPromotion}
                  onAdmitUpload={admitUpload}
                  onLookup={lookupSource}
                  onSelect={(source) => {
                    setSelectedSource(source);
                    setBaselineRevisionId("");
                    setProposalInput("");
                    setProposalLookupId("");
                    setProposalVersion(1);
                    replaceArcLocation({
                      proposal: null,
                      source: source.source_evidence_id,
                      version: null,
                    });
                    showToast({
                      message: `${source.source_system} · ${source.source_revision_locator}`,
                      title: "Source evidence selected",
                      variant: "success",
                    });
                    changeStep("draft");
                  }}
                  selectedSource={activeSource}
                />
              ) : null}

              {activeStep === "evidence" && artifactQuery.isPending && artifactLookupId ? (
                <LoadingBlock label="Loading policy" />
              ) : null}

              {activeStep === "evidence" && artifactQuery.isError ? (
                <QueryError
                  error={artifactQuery.error}
                  noun="policy"
                  onRetry={() => void artifactQuery.refetch()}
                />
              ) : null}

              {activeStep === "draft" && isAdmin && activeArtifact && activeSource ? (
                <SectionSurface
                  id="arc-step-draft"
                  description="Opening a draft binds this policy, exact source evidence, and any reviewed baseline into the first revision."
                  title="Open a draft revision"
                >
                  {!activeProposal ? (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Start the next revision
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                          The draft remains editable until it enters review. Opening it does not
                          activate policy content.
                        </p>
                        <label className={`${labelClassName} mt-4`} htmlFor="arc-baseline-revision">
                          Reviewed baseline revision ID (optional)
                          <input
                            className={`${inputClassName} mt-1.5 font-mono`}
                            id="arc-baseline-revision"
                            onChange={(event) => setBaselineRevisionId(event.currentTarget.value)}
                            placeholder="UUID"
                            value={baselineRevisionId}
                          />
                        </label>
                        {openProposalMutation.isError ? (
                          <p className="mt-3 text-sm text-danger" role="alert">
                            {errorDescription(openProposalMutation.error, "draft revision")}
                          </p>
                        ) : null}
                        <Button
                          className="mt-4 w-full sm:w-auto"
                          disabled={openProposalMutation.isPending}
                          onClick={() =>
                            openProposalMutation.mutate({
                              artifact: activeArtifact,
                              source: activeSource,
                            })
                          }
                        >
                          {openProposalMutation.isPending
                            ? "Opening draft…"
                            : "Open draft revision"}
                        </Button>
                      </div>

                      <details className="rounded-md border border-border bg-surface-muted">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
                          Resume an existing draft by ID
                        </summary>
                        <form
                          className="border-t border-border px-4 py-4"
                          onSubmit={resumeProposal}
                        >
                          <p className="mb-4 text-sm text-muted">
                            Use this recovery path when a draft revision is not already in the URL.
                          </p>
                          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                            <label className={labelClassName} htmlFor="arc-proposal-id">
                              Draft ID
                              <input
                                className={`${inputClassName} mt-1.5 font-mono`}
                                id="arc-proposal-id"
                                onChange={(event) => setProposalInput(event.currentTarget.value)}
                                placeholder="UUID"
                                value={proposalInput}
                              />
                            </label>
                            <label className={labelClassName} htmlFor="arc-proposal-version">
                              Revision
                              <input
                                className={`${inputClassName} mt-1.5`}
                                id="arc-proposal-version"
                                min={1}
                                onChange={(event) =>
                                  setProposalVersion(Number(event.currentTarget.value))
                                }
                                type="number"
                                value={proposalVersion}
                              />
                            </label>
                          </div>
                          <Button
                            className="mt-4 w-full sm:w-auto"
                            type="submit"
                            variant="secondary"
                          >
                            Resume draft
                          </Button>
                        </form>
                      </details>
                    </div>
                  ) : null}

                  {proposalQuery.isPending && proposalLookupId ? (
                    <div className="mt-5">
                      <LoadingBlock label="Loading draft version" />
                    </div>
                  ) : proposalQuery.isError ? (
                    <div className="mt-5">
                      <QueryError
                        error={proposalQuery.error}
                        noun="draft revision"
                        onRetry={() => void proposalQuery.refetch()}
                      />
                    </div>
                  ) : activeProposal ? (
                    <SummaryStrip
                      className="mt-5"
                      label="Draft revision summary"
                      items={[
                        {
                          id: "state",
                          label: "State",
                          value: formatArcLabel(activeProposal.state),
                        },
                        {
                          id: "version",
                          label: "Version",
                          value: String(activeProposal.proposal_version),
                        },
                        {
                          id: "risk",
                          label: "Risk",
                          value: activeProposal.risk_classification
                            ? formatArcLabel(activeProposal.risk_classification)
                            : "Not assessed",
                        },
                        {
                          id: "revision",
                          label: "Revision",
                          value: activeProposal.revision_id ? "Materialized" : "Not materialized",
                        },
                      ]}
                    />
                  ) : null}
                </SectionSurface>
              ) : null}

              {activeStep === "candidate" &&
              isAdmin &&
              activeArtifact &&
              activeSource &&
              activeProposal ? (
                <ArcDirectiveEditor
                  artifact={activeArtifact}
                  defaultTenantId={requestContext.tenantId ?? identity.tenant_id}
                  onSave={(patch) => editMutation.mutateAsync(patch).then(() => undefined)}
                  proposal={activeProposal}
                  source={activeSource}
                  tenants={tenants}
                />
              ) : null}

              {activeStep === "candidate" && proposalQuery.isPending && proposalLookupId ? (
                <LoadingBlock label="Loading draft version" />
              ) : null}

              {activeStep === "candidate" && proposalQuery.isError ? (
                <QueryError
                  error={proposalQuery.error}
                  noun="draft revision"
                  onRetry={() => void proposalQuery.refetch()}
                />
              ) : null}

              {activeStep === "activation" && isAdmin && activeProposal ? (
                <ArcLifecyclePanel
                  actorId={identity.actor_id}
                  client={client}
                  key={`${activeProposal.proposal_id}:${activeProposal.proposal_version}`}
                  onProposalChange={updateProposal}
                  proposal={activeProposal}
                  tenantId={requestContext.tenantId ?? identity.tenant_id}
                />
              ) : null}

              {activeStep === "activation" && proposalQuery.isPending && proposalLookupId ? (
                <LoadingBlock label="Loading draft lifecycle" />
              ) : null}
            </div>
          ) : null}

          {activeView === "runtime" ? (
            <TableSection
              description="Inspect the frozen receipt that explains which directives an agent received. Detail retrieval is just-in-time and remains audience-authorized."
              flush={false}
              title="Runtime receipt evidence"
            >
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  {/* The list is what the detail read would serve this caller,
                      so a withheld or unhydrated receipt is absent rather than
                      offered and refused. A resolution is shown by when it
                      happened and what it served, because a receipt list
                      carries no query text — the request is on the detail read,
                      behind the servability check a list must not route
                      around. */}
                  <div className="min-w-0 flex-1">
                    <ResourcePicker
                      emptyMessage="No resolution here is readable by this credential."
                      label="Resolution receipt"
                      load={receipts}
                      onValueChange={setReceiptInput}
                      searchPlaceholder="Search recent resolutions"
                      value={receiptInput}
                    />
                  </div>
                  <div className="grid gap-2 sm:flex sm:items-center">
                    <Button
                      className="w-full sm:w-auto"
                      disabled={receiptPending !== null}
                      onClick={loadReceipt}
                    >
                      <Search aria-hidden="true" className="size-4" />
                      Load receipt
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={receiptPending !== null || !receiptLookupId}
                      onClick={explainReceipt}
                      variant="secondary"
                    >
                      Explain selection
                    </Button>
                  </div>
                </div>

                {receiptError ? (
                  <QueryError error={receiptError} noun="receipt evidence" onRetry={loadReceipt} />
                ) : null}
                {receiptPending === "receipt" ? <LoadingBlock label="Loading receipt" /> : null}

                {receiptView ? (
                  <div className="space-y-4">
                    <SummaryStrip
                      label="Receipt summary"
                      items={[
                        {
                          id: "state",
                          label: "State",
                          value: formatArcLabel(receiptView.integrityState),
                        },
                        {
                          id: "selected",
                          label: "Selected",
                          value: formatArcCount(receiptView.selected.length),
                        },
                        {
                          id: "evaluated",
                          label: "Evaluated",
                          value: formatArcDate(receiptView.evaluatedAt),
                        },
                        {
                          id: "rendered",
                          label: "Rendered bytes",
                          value: `${formatArcCount(receiptView.renderedContentBytes)} / ${formatArcCount(receiptView.budgetLimitBytes)}`,
                        },
                      ]}
                    />
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[44rem] border-collapse">
                        <thead>
                          <tr>
                            <th className={tableHeaderClassName}>Directive</th>
                            <th className={tableHeaderClassName}>Requirement</th>
                            <th className={tableHeaderClassName}>Outcome</th>
                            <th className={tableHeaderClassName}>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiptView.selected.length ? (
                            receiptView.selected.map((directive) => (
                              <tr key={directive.directiveId}>
                                <td className={tableCellClassName}>
                                  <ShortId value={directive.directiveId} />
                                </td>
                                <td className={tableCellClassName}>
                                  {directive.isMandatory ? "Mandatory" : "Advisory"}
                                </td>
                                <td className={tableCellClassName}>
                                  <StatusBadge tone={directive.wasOmitted ? "warning" : "success"}>
                                    {directive.wasOmitted ? "Omitted" : "Selected"}
                                  </StatusBadge>
                                  {directive.omissionReason ? (
                                    <p className="mt-1 text-xs text-muted">
                                      {formatArcLabel(directive.omissionReason)}
                                    </p>
                                  ) : null}
                                </td>
                                <td className={tableCellClassName}>
                                  {directive.audienceRedacted
                                    ? "Redacted for this audience"
                                    : (directive.sourceLocator ?? "Not published")}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className={tableCellClassName} colSpan={4}>
                                No directives were selected for this resolution.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {receiptExplanation ? (
                  <StructuredInspector label="Receipt explanation" value={receiptExplanation} />
                ) : null}

                {receipt ? (
                  <details className="rounded-lg border border-border bg-surface-muted p-4 sm:p-5">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      Request authorized directive or source detail
                    </summary>
                    <Notice className="mt-4" title="Detail access is audited" variant="warning">
                      The context handle and selector come from the consuming workflow. The service
                      can redact or refuse detail without changing the frozen receipt.
                    </Notice>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void loadReceiptDetail();
                      }}
                    >
                      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <label className={labelClassName} htmlFor="arc-detail-context">
                          Context handle
                          {/* The caller's own name for the working context it is asking about, hashed
                              into the page binding. This service never assigned it and holds no list
                              of another agent's contexts.
                              identifier-exception: external-id */}
                          <input
                            aria-describedby={
                              detailContextError ? "arc-detail-context-error" : undefined
                            }
                            aria-invalid={Boolean(detailContextError)}
                            className={`${inputClassName} mt-1.5 font-mono`}
                            id="arc-detail-context"
                            onChange={(event) => {
                              setDetailContextHandle(event.currentTarget.value);
                              if (detailContextError) setDetailContextError("");
                            }}
                            value={detailContextHandle}
                          />
                          {detailContextError ? (
                            <span
                              className="mt-1.5 block text-xs text-danger"
                              id="arc-detail-context-error"
                            >
                              {detailContextError}
                            </span>
                          ) : null}
                        </label>
                        <SearchableSelect
                          allowEmpty={false}
                          label="Request kind"
                          onValueChange={(value) => {
                            if (
                              value === "directive" ||
                              value === "query" ||
                              value === "source_anchor"
                            ) {
                              setDetailRequestKind(value);
                            }
                          }}
                          options={arcDetailRequestKindOptions}
                          value={detailRequestKind}
                        />
                        <label
                          className={`${labelClassName} sm:col-span-2 lg:col-span-3`}
                          htmlFor="arc-detail-selector"
                        >
                          Selector (JSON object)
                          <textarea
                            aria-describedby={
                              detailSelectorError ? "arc-detail-selector-error" : undefined
                            }
                            aria-invalid={Boolean(detailSelectorError)}
                            className={`${inputClassName} mt-1.5 min-h-28 resize-y font-mono text-xs`}
                            id="arc-detail-selector"
                            onChange={(event) => {
                              setDetailSelector(event.currentTarget.value);
                              if (detailSelectorError) setDetailSelectorError("");
                            }}
                            spellCheck={false}
                            value={detailSelector}
                          />
                          {detailSelectorError ? (
                            <span
                              className="mt-1.5 block text-xs text-danger"
                              id="arc-detail-selector-error"
                            >
                              {detailSelectorError}
                            </span>
                          ) : null}
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button disabled={receiptPending !== null} type="submit">
                          Retrieve detail
                        </Button>
                      </div>
                    </form>
                    {detailRequestError ? (
                      <div className="mt-4">
                        <QueryError
                          error={detailRequestError}
                          noun="receipt detail"
                          onRetry={() => void loadReceiptDetail()}
                        />
                      </div>
                    ) : null}
                    {receiptDetail ? (
                      <div className="mt-4">
                        <SummaryStrip
                          label="Receipt detail summary"
                          items={[
                            { id: "page", label: "Page", value: String(receiptDetail.page_number) },
                            {
                              id: "bytes",
                              label: "Bytes",
                              value: formatArcCount(receiptDetail.returned_bytes),
                            },
                            {
                              id: "complete",
                              label: "Complete",
                              value: receiptDetail.complete ? "Yes" : "More available",
                            },
                            {
                              id: "items",
                              label: "Items",
                              value: formatArcCount(receiptDetail.items.length),
                            },
                          ]}
                        />
                        <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-surface p-4 text-xs leading-5 text-muted">
                          {JSON.stringify(receiptDetail.items, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </details>
                ) : null}
              </div>
            </TableSection>
          ) : null}

          {activeView === "usage" ? (
            <div className="space-y-6">
              <Notice title="How to read this usage view">
                These are aggregate calls to policy-related Model Context Protocol tools over the
                published 30-day window. Use them to understand service activity and errors—not to
                count how often one policy or directive affected an agent. Open Runtime evidence for
                a specific decision.
              </Notice>

              <TableSection
                description="Cumulative policy-tool call totals over the displayed window. Successful and error calls are service outcomes, not policy decisions."
                title="Policy tool usage"
              >
                {!isAdmin ? (
                  <EmptyState
                    description="The admin usage endpoint is not available to this role. Receipt inspection remains subject to policy audience authorization."
                    icon={ShieldCheck}
                    title="Usage is restricted"
                  />
                ) : usageQuery.isPending ? (
                  <LoadingBlock label="Loading policy tool usage" />
                ) : usageQuery.isError ? (
                  <QueryError
                    error={usageQuery.error}
                    noun="policy tool usage"
                    onRetry={() => void usageQuery.refetch()}
                  />
                ) : arcUsage.length === 0 ? (
                  <EmptyState
                    description="The usage service published no policy MCP calls in this window. This is different from a failed or unavailable query."
                    icon={FileCheck2}
                    title="No policy tool calls"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className={tableHeaderClassName}>MCP tool</th>
                          <th className={`${tableHeaderClassName} text-right`}>Calls</th>
                          <th className={`${tableHeaderClassName} text-right`}>Successful</th>
                          <th className={`${tableHeaderClassName} text-right`}>Errors</th>
                          <th className={`${tableHeaderClassName} text-right`}>Worst daily p95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arcUsage.map((usage) => (
                          <tr key={usage.tool}>
                            <td className={tableCellClassName}>{formatArcLabel(usage.tool)}</td>
                            <td className={`${tableCellClassName} text-right tabular-nums`}>
                              {formatArcCount(usage.calls)}
                            </td>
                            <td className={`${tableCellClassName} text-right tabular-nums`}>
                              {formatArcCount(usage.ok_calls)}
                            </td>
                            <td className={`${tableCellClassName} text-right tabular-nums`}>
                              {formatArcCount(usage.error_calls)}
                            </td>
                            <td className={`${tableCellClassName} text-right tabular-nums`}>
                              {usage.worst_daily_p95_ms === null
                                ? "Not published"
                                : `${formatArcCount(usage.worst_daily_p95_ms)} ms`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TableSection>

              <Notice title="Per-policy execution counts are not published" variant="warning">
                The service exposes aggregate tool calls and receipt-level selection evidence. This
                application does not derive a tenant-wide invocation count from partial receipts.
              </Notice>
            </div>
          ) : null}
        </div>
      </div>

      {createDialogOpen ? (
        <ArcArtifactDialog
          defaultTenantId={requestContext.tenantId ?? identity.tenant_id}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={(input) => createMutation.mutateAsync(input).then(() => undefined)}
          tenants={tenants}
        />
      ) : null}

      {walkthroughOpen ? (
        <ArcWalkthrough
          onClose={closeWalkthrough}
          onStartAuthoring={startAuthoringFromWalkthrough}
        />
      ) : null}
    </PageContainer>
  );
}
