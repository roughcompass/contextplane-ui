import type { AuditSnapshot } from "../../shared/api";

export interface AuditFilters {
  action: string;
  actorId: string;
  from: string;
  targetId: string;
  targetType: string;
  to: string;
}

export const auditPageSize = 50;

export const emptyAuditFilters: AuditFilters = {
  action: "",
  actorId: "",
  from: "",
  targetId: "",
  targetType: "",
  to: "",
};

export function formatAuditTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function shortIdentifier(identifier: string) {
  return identifier.length > 12 ? identifier.slice(0, 8) : identifier;
}

export function shortRequestIdentifier(identifier: string) {
  return identifier.length > 16 ? `${identifier.slice(0, 8)}…${identifier.slice(-6)}` : identifier;
}

export function formatSnapshot(snapshot: AuditSnapshot) {
  return JSON.stringify(snapshot, null, 2) ?? "null";
}
