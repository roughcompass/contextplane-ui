import {
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  FileCheck2,
  GitBranch,
  Library,
  MessagesSquare,
  NotebookTabs,
  Route,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { BRAND } from "@repo/ui/brand";
import { Button, DetailsLink, Notice } from "@repo/ui/primitives";

interface GettingStartedDialogProps {
  activeTenantName: string;
  onClose: () => void;
}

type WalkthroughStepId =
  "problem" | "audience" | "context-plane" | "agent-access" | "workflow" | "start";

interface WalkthroughStep {
  eyebrow: string;
  id: WalkthroughStepId;
  label: string;
  title: string;
}

const firstWalkthroughStep: WalkthroughStep = {
  eyebrow: "The vision",
  id: "problem",
  label: "Why context matters",
  title: "Autonomous delivery needs more than code generation.",
};

const walkthroughSteps: readonly WalkthroughStep[] = [
  firstWalkthroughStep,
  {
    eyebrow: "Who it enables",
    id: "audience",
    label: "Who it enables",
    title: "Agents and people need the same operating context.",
  },
  {
    eyebrow: "Role in the stack",
    id: "context-plane",
    label: `${BRAND.name}'s role`,
    title: `${BRAND.name} supplies context. The delivery stack acts.`,
  },
  {
    eyebrow: "Into the agent loop",
    id: "agent-access",
    label: "Agent access",
    title: "Agents retrieve governed context in their tool loop.",
  },
  {
    eyebrow: "Across the lifecycle",
    id: "workflow",
    label: "Delivery workflow",
    title: `${BRAND.name} grounds delivery. Connected systems execute it.`,
  },
  {
    eyebrow: "Choose a starting point",
    id: "start",
    label: "Ground a task",
    title: "Ground the next delivery task.",
  },
];

interface FeatureCardProps {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}

function FeatureCard({ children, icon: Icon, title }: FeatureCardProps) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-strong"
        >
          <Icon className="size-4" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <div className="mt-1 text-sm leading-6 text-muted">{children}</div>
        </div>
      </div>
    </article>
  );
}

function ProblemStep() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-base leading-7 text-muted">
        Autonomous agents promise to carry software from intent through implementation, validation,
        deployment, and operation. That work becomes unsafe when agents cannot find current
        ownership, contracts, dependencies, policy, or evidence.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <FeatureCard icon={Search} title="Understand the system">
          What capability exists, which interface applies, and who owns the outcome?
        </FeatureCard>
        <FeatureCard icon={ShieldCheck} title="Act within constraints">
          Which policies, dependencies, and approvals shape the change?
        </FeatureCard>
        <FeatureCard icon={GitBranch} title="Explain every decision">
          Which source supports an action, what changed, and what remains uncertain?
        </FeatureCard>
      </div>
      <Notice title="Context is the foundation, not the whole delivery system">
        {BRAND.name} grounds agents in the organization they change. Agent runtimes, coding tools,
        source control, delivery pipelines, deployment platforms, and observability tools perform
        the work.
      </Notice>
    </div>
  );
}

const audienceRows = [
  {
    detail:
      "Connect agents through the Model Context Protocol and compose model, code, test, deployment, and operations tools around governed context.",
    label: "Agent platform teams",
  },
  {
    detail:
      "Give agents clear capabilities, interfaces, ownership, policy, and evidence for each delivery task.",
    label: "Software delivery teams",
  },
  {
    detail:
      "Maintain canonical records, map dependencies, review observations, and govern proposed changes.",
    label: "Platform and capability owners",
  },
  {
    detail:
      "Trace claims, citations, decisions, actors, timestamps, and the history behind automated work.",
    label: "Governance and audit teams",
  },
] as const;

function AudienceStep() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-base leading-7 text-muted">
        {BRAND.name} serves the teams building autonomous delivery and the people accountable for
        its outcomes. Service permissions determine which records and actions each caller can use.
      </p>
      <ul className="overflow-hidden rounded-lg border border-border bg-surface">
        {audienceRows.map((row) => (
          <li
            key={row.label}
            className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
          >
            <span className="text-sm font-semibold text-foreground">{row.label}</span>
            <span className="text-sm leading-6 text-muted">{row.detail}</span>
          </li>
        ))}
      </ul>
      <FeatureCard icon={Bot} title="Agents are callers, not trusted bypasses">
        Agents use the Model Context Protocol server, and applications use the REST API. Both
        surfaces enforce the identity, tenant, and permissions resolved from the caller&apos;s
        credential.
      </FeatureCard>
    </div>
  );
}

const contextLayers = [
  {
    detail: "Approved capabilities, interfaces, components, versions, facts, and relationships.",
    label: "Canonical catalog",
  },
  {
    detail: "Policy directives selected through a named, attested receipt.",
    label: "Policy directives",
  },
  {
    detail: "Recalled claims with citations, confidence, validity, and human-review state.",
    label: "Living Memory",
  },
  {
    detail: "Mutable notes, decisions, questions, and saved retrieval context.",
    label: "Workspace recall",
  },
] as const;

function ContextPlaneStep() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-base leading-7 text-muted">
        {BRAND.name} is the shared context layer between organizational sources and delivery agents.
        It resolves each request across four layers while preserving authority, provenance, and time
        scope.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {contextLayers.map((layer, index) => (
          <li key={layer.label} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent-subtle text-xs font-semibold text-accent-strong"
              >
                {index + 1}
              </span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{layer.label}</h4>
                <p className="mt-1 text-sm leading-6 text-muted">{layer.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Notice title={`${BRAND.name} is not the delivery engine`}>
        {BRAND.name} retrieves structured context and records a receipt. It does not plan work, edit
        code, run builds or tests, deploy software, or operate services. Connected agent and
        delivery systems own those actions.
      </Notice>
    </div>
  );
}

const representativeMcpTools = [
  "search_capabilities",
  "get_capability",
  "traverse_dependencies",
  "search_claims",
  "add_workspace_entry",
] as const;

function AgentAccessStep() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-base leading-7 text-muted">
        The Model Context Protocol (MCP) server gives agents tenant-aware tools for discovery,
        dependency traversal, observed claims, working memory, session continuity, and governed
        review.
      </p>
      <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <FeatureCard icon={Bot} title="Agent runtime">
          Requests context as part of a broader delivery plan and supplies its host credential.
        </FeatureCard>
        <ArrowRight
          aria-hidden="true"
          className="mx-auto size-5 self-center rotate-90 text-subtle md:rotate-0"
        />
        <FeatureCard icon={Route} title={`${BRAND.name} MCP server`}>
          Resolves actor and tenant, enforces permissions, and returns typed context with
          provenance.
        </FeatureCard>
      </div>
      <section aria-labelledby="representative-tools-title">
        <h4 id="representative-tools-title" className="text-sm font-semibold text-foreground">
          Representative tools reported by {BRAND.name} usage data
        </h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {representativeMcpTools.map((tool) => (
            <code
              key={tool}
              className="rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs text-foreground"
            >
              {tool}
            </code>
          ))}
        </div>
      </section>
      <p className="text-sm leading-6 text-muted">
        The host combines these results with model, repository, issue, build, test, deployment, and
        observability tools. {BRAND.name} remains the governed context provider rather than the
        execution orchestrator.
      </p>
    </div>
  );
}

const workflowStages = [
  {
    detail:
      "Resolve a task into canonical capabilities, policy, observed claims, workspace context, exclusions, and a receipt.",
    icon: MessagesSquare,
    label: "Ground the intent",
  },
  {
    detail: "Find owners and versions, then inspect dependencies, dependents, and blast radius.",
    icon: GitBranch,
    label: "Assess change impact",
  },
  {
    detail: `The agent plans and edits code, then invokes source control, builds, tests, and deployment outside ${BRAND.name}.`,
    icon: Bot,
    label: "Execute through delivery systems",
  },
  {
    detail: "Inspect claims beside citations, confidence, validity, and curator attention.",
    icon: Braces,
    label: "Review evidence",
  },
  {
    detail: "Compare current and proposed context, decide through policy, and preserve the audit.",
    icon: FileCheck2,
    label: "Govern shared context",
  },
  {
    detail: "Resume actor-private sessions or team workspaces without making notes canonical.",
    icon: NotebookTabs,
    label: "Preserve continuity",
  },
] as const;

function WorkflowStep() {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-base leading-7 text-muted">
        End-to-end delivery emerges from connected systems. {BRAND.name} grounds the stages below;
        the agent runtime and delivery tools execute the software change.
      </p>
      <ol className="space-y-3">
        {workflowStages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <li
              key={stage.label}
              className="flex gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-strong"
              >
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {index + 1}. {stage.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const startingPoints = [
  {
    detail: "Run an agent task against the four context layers and inspect its receipt.",
    href: "/context-lab",
    icon: MessagesSquare,
    label: "Ground a task in Context Lab",
  },
  {
    detail: "Find approved capabilities, interfaces, components, owners, and versions.",
    href: "/catalog",
    icon: Library,
    label: "Explore the Context Graph",
  },
  {
    detail: "Trace dependencies, dependents, or blast radius before a change.",
    href: "/relationships",
    icon: GitBranch,
    label: "Inspect relationships",
  },
  {
    detail: "Review observed claims, citations, confidence, and curation state.",
    href: "/memory",
    icon: Braces,
    label: "Review Living Memory",
  },
  {
    detail: "Keep mutable notes, decisions, questions, and saved retrieval context.",
    href: "/workspaces",
    icon: Boxes,
    label: "Open workspaces",
  },
  {
    detail: "Compare proposed changes with current values, evidence, and impact.",
    href: "/proposals",
    icon: FileCheck2,
    label: "Review proposals",
  },
] as const;

function StartStep({
  activeTenantName,
  onNavigate,
}: {
  activeTenantName: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-5">
      <Notice title={`You are exploring ${activeTenantName}`}>
        The active tenant and resolved identity determine which records and actions are available.
        Missing access is omitted or explained instead of being represented as missing data.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        {startingPoints.map((point) => {
          const Icon = point.icon;
          return (
            <article key={point.href} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent-strong"
                >
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm leading-6 text-muted">{point.detail}</p>
                  <DetailsLink className="mt-2" href={point.href} onClick={onNavigate}>
                    {point.label}
                  </DetailsLink>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function WalkthroughContent({
  activeTenantName,
  onNavigate,
  step,
}: {
  activeTenantName: string;
  onNavigate: () => void;
  step: WalkthroughStepId;
}) {
  if (step === "problem") return <ProblemStep />;
  if (step === "audience") return <AudienceStep />;
  if (step === "context-plane") return <ContextPlaneStep />;
  if (step === "agent-access") return <AgentAccessStep />;
  if (step === "workflow") return <WorkflowStep />;
  return <StartStep activeTenantName={activeTenantName} onNavigate={onNavigate} />;
}

export function GettingStartedDialog({ activeTenantName, onClose }: GettingStartedDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = walkthroughSteps[activeIndex] ?? firstWalkthroughStep;
  const lastStepIndex = walkthroughSteps.length - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    titleRef.current?.focus();
  }, []);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function goToStep(index: number) {
    setActiveIndex(Math.max(0, Math.min(lastStepIndex, index)));
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto h-[min(48rem,calc(100dvh-1rem))] w-[min(68rem,calc(100dvw-1rem))] max-w-none overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-overlay max-sm:h-dvh max-sm:max-h-none max-sm:w-dvw max-sm:rounded-none max-sm:border-0"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
              Interactive walkthrough
            </p>
            <h2
              ref={titleRef}
              className="mt-1 text-lg font-semibold outline-none"
              id={titleId}
              tabIndex={-1}
            >
              Getting started with {BRAND.name}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted" id={descriptionId}>
              See why autonomous delivery needs governed context, what {BRAND.name} supplies, and
              where its responsibility ends.
            </p>
          </div>
          <Button
            aria-label="Close getting started walkthrough"
            onClick={closeDialog}
            size="icon"
            title="Close getting started walkthrough"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </header>

        <div className="border-b border-border px-5 py-3 md:hidden">
          <label className="block text-xs font-medium text-muted" htmlFor={`${titleId}-step`}>
            Walkthrough section
          </label>
          <select
            className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            id={`${titleId}-step`}
            onChange={(event) => goToStep(Number(event.currentTarget.value))}
            value={activeIndex}
          >
            {walkthroughSteps.map((step, index) => (
              <option key={step.id} value={index}>
                {index + 1}. {step.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[14rem_minmax(0,1fr)]">
          <nav
            aria-label="Getting started steps"
            className="hidden border-r border-border md:block"
          >
            <ol className="space-y-1 p-4">
              {walkthroughSteps.map((step, index) => {
                const active = index === activeIndex;
                return (
                  <li key={step.id}>
                    <button
                      aria-current={active ? "step" : undefined}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        active
                          ? "bg-accent-subtle text-accent-strong"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                      onClick={() => goToStep(index)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${
                          active
                            ? "border-accent/30 bg-surface text-accent-strong"
                            : "border-border text-subtle"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span>{step.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div ref={contentRef} className="min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-accent uppercase">
                    {activeStep.eyebrow}
                  </p>
                  <p className="shrink-0 text-xs tabular-nums text-muted">
                    Step {activeIndex + 1} of {walkthroughSteps.length}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-6 gap-1" aria-hidden="true">
                  {walkthroughSteps.map((step, index) => (
                    <span
                      key={step.id}
                      className={`h-1 rounded-full ${index <= activeIndex ? "bg-accent" : "bg-surface-muted"}`}
                    />
                  ))}
                </div>
                <h3 className="mt-5 max-w-3xl text-2xl font-light tracking-tight text-foreground">
                  {activeStep.title}
                </h3>
              </div>

              <WalkthroughContent
                activeTenantName={activeTenantName}
                onNavigate={closeDialog}
                step={activeStep.id}
              />
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3 sm:px-6">
          <Button
            disabled={activeIndex === 0}
            onClick={() => goToStep(activeIndex - 1)}
            variant="secondary"
          >
            Back
          </Button>
          {activeIndex < lastStepIndex ? (
            <Button onClick={() => goToStep(activeIndex + 1)}>
              Next
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          ) : (
            <Button onClick={closeDialog}>Finish walkthrough</Button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
