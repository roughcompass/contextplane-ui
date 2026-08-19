import type { PromotionProposal, PromotionProposalState, WhoAmI } from "../../shared/api";

export const proposalStateOptions: readonly {
  label: string;
  value: PromotionProposalState;
}[] = [
  { label: "Open", value: "open" },
  { label: "Accepted", value: "accepted" },
  { label: "Amended", value: "amended" },
  { label: "Rejected", value: "rejected" },
];

export const proposalPageSizeOptions = [25, 50, 100] as const;
export type ProposalPageSize = (typeof proposalPageSizeOptions)[number];

export const defaultProposalState: PromotionProposalState = "open";
export const defaultProposalPageSize: ProposalPageSize = 50;

export function isPromotionProposalState(value: string | null): value is PromotionProposalState {
  return proposalStateOptions.some((option) => option.value === value);
}

export function parseProposalPageSize(value: string | null): ProposalPageSize | null {
  if (!value) return null;
  const parsed = Number(value);
  return proposalPageSizeOptions.find((pageSize) => pageSize === parsed) ?? null;
}

export function shortProposalIdentifier(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function proposalListIdentifier(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-8)}`;
}

export function proposalStateLabel(state: PromotionProposalState): string {
  return proposalStateOptions.find((option) => option.value === state)?.label ?? state;
}

export function proposalStateTone(
  state: PromotionProposalState,
): "danger" | "info" | "success" | "warning" {
  if (state === "accepted") return "success";
  if (state === "amended") return "info";
  if (state === "rejected") return "danger";
  return "warning";
}

export function humanizeProposalField(value: string): string {
  const words = value.replaceAll("_", " ").trim();
  return words ? `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}` : "Unspecified";
}

export function formatProposalTimestamp(value: string | null): string {
  if (value === null) return "Not published";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function proposalValueDocument(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  return serialized ?? String(value);
}

export type ProposalValueDiffStatus = "added" | "changed" | "removed" | "unchanged";

export interface ProposalValueDiff {
  current: string;
  path: string;
  proposed: string;
  status: ProposalValueDiffStatus;
}
export function proposalValueSummary(value: unknown): string {
  const serialized = JSON.stringify(value);
  const text = serialized ?? String(value);
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValueSummary(value: unknown, present: boolean): string {
  return present ? proposalValueSummary(value) : "Not present";
}

function compareProposalValues(
  current: unknown,
  proposed: unknown,
  path: string,
  currentPresent: boolean,
  proposedPresent: boolean,
): ProposalValueDiff[] {
  if (!currentPresent || !proposedPresent) {
    return [
      {
        current: diffValueSummary(current, currentPresent),
        path,
        proposed: diffValueSummary(proposed, proposedPresent),
        status: currentPresent ? "removed" : "added",
      },
    ];
  }

  if (Array.isArray(current) && Array.isArray(proposed)) {
    if (current.length === 0 && proposed.length === 0) {
      return [{ current: "[]", path, proposed: "[]", status: "unchanged" }];
    }
    return Array.from({ length: Math.max(current.length, proposed.length) }, (_, index) =>
      compareProposalValues(
        current[index],
        proposed[index],
        `${path}[${index}]`,
        index < current.length,
        index < proposed.length,
      ),
    ).flat();
  }

  if (isJsonRecord(current) && isJsonRecord(proposed)) {
    const keys = [...new Set([...Object.keys(current), ...Object.keys(proposed)])].sort();
    if (keys.length === 0) {
      return [{ current: "{}", path, proposed: "{}", status: "unchanged" }];
    }
    return keys.flatMap((key) =>
      compareProposalValues(
        current[key],
        proposed[key],
        `${path}.${key}`,
        Object.hasOwn(current, key),
        Object.hasOwn(proposed, key),
      ),
    );
  }

  return [
    {
      current: proposalValueSummary(current),
      path,
      proposed: proposalValueSummary(proposed),
      status: Object.is(current, proposed) ? "unchanged" : "changed",
    },
  ];
}

export function diffProposalValues(current: unknown, proposed: unknown): ProposalValueDiff[] {
  return compareProposalValues(current, proposed, "$", true, true);
}

export interface ProposalChangeSummary {
  detail: string;
  label: string;
}

export function summarizeProposalChange(
  current: unknown,
  proposed: unknown,
): ProposalChangeSummary {
  const changedFields = diffProposalValues(current, proposed).filter(
    (field) => field.status !== "unchanged",
  );
  if (changedFields.length === 0) {
    return { detail: "Direct comparison", label: "No field changes" };
  }

  if (changedFields.length === 1 && changedFields[0]?.path === "$") {
    const status = changedFields[0].status;
    return {
      detail: "Direct comparison",
      label:
        status === "added"
          ? "Value added"
          : status === "removed"
            ? "Value removed"
            : "Value changed",
    };
  }

  const statusOrder: readonly ProposalValueDiffStatus[] = ["changed", "added", "removed"];
  const detail = statusOrder
    .map((status) => ({
      count: changedFields.filter((field) => field.status === status).length,
      status,
    }))
    .filter(({ count }) => count > 0)
    .map(({ count, status }) => `${count} ${status}`)
    .join(" · ");

  return {
    detail,
    label: `${changedFields.length} field ${changedFields.length === 1 ? "change" : "changes"}`,
  };
}

export function highImpactReasonLabel(value: string): string {
  return humanizeProposalField(value);
}

export function filterPromotionProposals(
  proposals: readonly PromotionProposal[],
  query: string,
): readonly PromotionProposal[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return proposals;

  return proposals.filter((proposal) =>
    [
      proposal.proposal_id,
      proposal.claim_id,
      proposal.subject_entity_id,
      proposal.predicate,
      proposal.target_kind,
      proposal.target_key,
      proposal.author_tenant_id,
      proposalValueSummary(proposal.current_value),
      proposalValueSummary(proposal.proposed_value),
    ].some((candidate) => candidate.toLocaleLowerCase().includes(normalized)),
  );
}

export function mayReviewPromotionProposals(identity: WhoAmI): boolean {
  return identity.roles.includes("producer") || identity.roles.includes("admin");
}
