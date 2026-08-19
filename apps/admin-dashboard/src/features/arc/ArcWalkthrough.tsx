import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  FileCheck2,
  FilePenLine,
  Fingerprint,
  ListChecks,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button, Notice } from "@repo/ui/primitives";

interface ArcWalkthroughProps {
  onClose: () => void;
  onStartAuthoring: () => void;
}

interface WalkthroughStep {
  description: string;
  icon: LucideIcon;
  result: string;
  title: string;
}

const walkthroughSteps: readonly WalkthroughStep[] = [
  {
    description: "Name the durable policy record that will hold every revision.",
    icon: Fingerprint,
    result: "Policy record",
    title: "Choose policy",
  },
  {
    description: "Attach an immutable, approved source revision and its verification proof.",
    icon: FileCheck2,
    result: "Trusted source",
    title: "Bind evidence",
  },
  {
    description: "Open a draft revision tied to that exact policy and source revision.",
    icon: FilePenLine,
    result: "Bound draft",
    title: "Open draft",
  },
  {
    description: "Write the instructions agents receive and define where they apply.",
    icon: ListChecks,
    result: "Policy content",
    title: "Write policy",
  },
  {
    description: "Validate, review, approve, qualify when required, and activate.",
    icon: ShieldCheck,
    result: "Active revision",
    title: "Activate",
  },
];

export function ArcWalkthrough({ onClose, onStartAuthoring }: ArcWalkthroughProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const lifecycleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    closeButtonRef.current?.focus();
  }, []);

  function closeDialog() {
    dialogRef.current?.close();
  }

  function startAuthoring() {
    dialogRef.current?.close();
    onStartAuthoring();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-0 flex h-dvh max-h-none w-dvw max-w-none flex-col overflow-hidden border-0 bg-surface p-0 text-foreground backdrop:bg-overlay sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:w-[min(64rem,calc(100dvw-2rem))] sm:rounded-xl sm:border sm:border-border sm:shadow-2xl"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={onClose}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.04em] text-accent uppercase">
            Governed policy guide
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground" id={titleId}>
            How governed policies work
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            Follow approved source material from a policy record to an active revision—and
            understand the evidence recorded when an agent uses it.
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          aria-label="Close governed policy guide"
          className="shrink-0"
          onClick={closeDialog}
          size="icon"
          title="Close governed policy guide"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <section aria-labelledby={lifecycleId}>
          <div className="rounded-lg bg-accent-subtle px-4 py-4 sm:flex sm:items-center sm:gap-4 sm:px-5">
            <ShieldCheck aria-hidden="true" className="size-7 shrink-0 text-accent-strong" />
            <div className="mt-3 sm:mt-0">
              <h3 className="text-sm font-semibold text-foreground">The outcome</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                One active, source-backed revision that agents can receive and operators can later
                explain from a frozen resolution receipt.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted">Authoring lifecycle</p>
              <h3 className="mt-1 text-base font-semibold text-foreground" id={lifecycleId}>
                From approved source to active policy
              </h3>
            </div>
            <p className="hidden text-xs text-muted sm:block">Each stage preserves the prior one</p>
          </div>

          <ol aria-label="Governed policy lifecycle" className="mt-5 grid gap-5 md:grid-cols-5">
            {walkthroughSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 md:block"
                  key={step.title}
                >
                  {index < walkthroughSteps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-[-1.25rem] left-[1.125rem] top-9 w-px bg-border md:bottom-auto md:left-9 md:right-[-1.25rem] md:top-[1.125rem] md:h-px md:w-auto"
                    />
                  ) : null}
                  <span className="relative z-10 inline-flex size-9 items-center justify-center rounded-full border border-accent bg-surface text-accent-strong">
                    <Icon aria-hidden="true" className="size-4" />
                    <span className="sr-only">Step {index + 1}</span>
                  </span>
                  <div className="min-w-0 md:mt-3 md:pr-2">
                    <p className="text-xs font-medium text-accent-strong">{step.result}</p>
                    <h4 className="mt-1 text-sm font-semibold text-foreground">{step.title}</h4>
                    <p className="mt-1 text-sm leading-5 text-muted">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-6 border-t border-border pt-6" aria-labelledby="evidence-flow-title">
          <h3 className="text-base font-semibold text-foreground" id="evidence-flow-title">
            What the other views tell you
          </h3>
          <div className="mt-4 grid gap-0 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="pb-5 sm:pb-0 sm:pr-5">
              <Fingerprint aria-hidden="true" className="size-5 text-accent-strong" />
              <h4 className="mt-3 text-sm font-semibold text-foreground">
                A policy holds revisions
              </h4>
              <p className="mt-1 text-sm leading-6 text-muted">
                Creating the policy record does not add content or make a revision active.
              </p>
            </div>
            <div className="py-5 sm:px-5 sm:py-0">
              <FileCheck2 aria-hidden="true" className="size-5 text-accent-strong" />
              <h4 className="mt-3 text-sm font-semibold text-foreground">
                Runtime is per decision
              </h4>
              <p className="mt-1 text-sm leading-6 text-muted">
                A receipt explains what was selected, omitted, or redacted for one resolution and
                why.
              </p>
            </div>
            <div className="pt-5 sm:pl-5 sm:pt-0">
              <ChartNoAxesColumnIncreasing
                aria-hidden="true"
                className="size-5 text-accent-strong"
              />
              <h4 className="mt-3 text-sm font-semibold text-foreground">Usage is aggregate</h4>
              <p className="mt-1 text-sm leading-6 text-muted">
                Tool totals show service activity, not how often a specific policy instruction ran.
              </p>
            </div>
          </div>
        </section>

        <Notice className="mt-6" title="Signing stays outside the browser" variant="warning">
          External systems create signatures and attestations. The browser only carries canonical
          bytes and proof for service verification.
        </Notice>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <Button className="w-full sm:w-auto" onClick={closeDialog} variant="ghost">
          Close guide
        </Button>
        <Button className="w-full sm:w-auto" onClick={startAuthoring}>
          Start authoring
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </footer>
    </dialog>
  );
}
