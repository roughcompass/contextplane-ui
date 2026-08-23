import { Bell, Check, RadioTower, RefreshCw, Send } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  getTenantLearningAggregates,
  ingestTenantSignal,
  listTenantLearningMetrics,
  listTenantNotifications,
  markTenantNotificationRead,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type SignalIngestInput,
  type StructuredServiceResult,
} from "../../shared/api";

interface ActivityPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

const notificationStatusOptions = [
  { label: "Unread", value: "unread" },
  { label: "Read", value: "read" },
  { label: "All", value: "all" },
];
const learningWindowOptions = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];
const producerTypeOptions = [
  { label: "Human", value: "human" },
  { label: "Agent", value: "agent" },
  { label: "External", value: "external" },
];
const signalClassificationOptions = [
  { label: "Public", value: "public" },
  { label: "Internal", value: "internal" },
  { label: "Confidential", value: "confidential" },
  { label: "Restricted", value: "restricted" },
];

function localDateTimeNow(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function KeyValueEvidence({ value }: { value: StructuredServiceResult }) {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item])
    : Object.entries(value);
  if (entries.length === 0) return <p className="text-sm text-muted">No evidence was reported.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, item]) => (
        <div key={key} className="rounded-md border border-border bg-surface p-4">
          <dt className="text-xs font-medium text-muted">{key.replaceAll("_", " ")}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">
            {typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? (
              String(item)
            ) : (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5">
                {JSON.stringify(item, null, 2)}
              </pre>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ActivityPanel({ client, requestContext }: ActivityPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const tenantKey = requestContext.tenantId ?? "credential-default";
  const [notificationStatus, setNotificationStatus] = useState<"all" | "read" | "unread">("unread");
  const [windowDays, setWindowDays] = useState(30);
  const [sourceId, setSourceId] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [sourceEventId, setSourceEventId] = useState("");
  const [producerId, setProducerId] = useState("");
  const [producerType, setProducerType] = useState<"agent" | "external" | "human">("human");
  const [classification, setClassification] = useState<
    "confidential" | "internal" | "public" | "restricted"
  >("internal");
  const [eventTime, setEventTime] = useState(localDateTimeNow);
  const [observedTime, setObservedTime] = useState(localDateTimeNow);
  const [payloadText, setPayloadText] = useState("{}");
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const notificationsKey = [
    "contextplane",
    tenantKey,
    "activity",
    "notifications",
    notificationStatus,
  ] as const;
  const notifications = useQuery({
    queryFn: ({ signal }) =>
      listTenantNotifications(
        client,
        { pageSize: 50, status: notificationStatus },
        requestContext,
        signal,
      ),
    queryKey: notificationsKey,
  });
  const aggregates = useQuery({
    queryFn: ({ signal }) =>
      getTenantLearningAggregates(client, windowDays, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "activity", "learning", "aggregates", windowDays],
  });
  const metrics = useQuery({
    queryFn: ({ signal }) => listTenantLearningMetrics(client, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "activity", "learning", "metrics"],
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      markTenantNotificationRead(client, notificationId, requestContext),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", tenantKey, "activity", "notifications"],
      });
      showToast({
        message: "The service recorded this notification as read.",
        title: "Notification updated",
        variant: "success",
      });
    },
  });
  const signalMutation = useMutation({
    mutationFn: (input: SignalIngestInput) => ingestTenantSignal(client, input, requestContext),
    onSuccess: (receipt) => {
      showToast({
        message: receipt.replayed
          ? "The service recognized an existing idempotent signal submission."
          : "The signal is now available as governed observation evidence.",
        title: receipt.replayed ? "Signal replay recognized" : "Signal ingested",
        variant: "success",
      });
    },
  });

  function submitSignal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload: unknown = JSON.parse(payloadText);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        setPayloadError("Payload must be a JSON object.");
        return;
      }
      setPayloadError(null);
      signalMutation.mutate({
        classification,
        event_time: new Date(eventTime).toISOString(),
        idempotency_key: crypto.randomUUID(),
        observed_time: new Date(observedTime).toISOString(),
        payload: payload as Record<string, unknown>,
        producer_id: producerId.trim(),
        producer_type: producerType,
        schema_version: "external_signal.v1",
        source_event_id: sourceEventId.trim(),
        source_id: sourceId.trim(),
        source_system: sourceSystem.trim(),
      });
    } catch {
      setPayloadError("Enter valid JSON payload data.");
    }
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="notifications-title"
        className="rounded-xl border border-border bg-surface"
      >
        <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bell aria-hidden="true" className="size-5 text-accent" />
              <h2 id="notifications-title" className="text-lg font-semibold text-foreground">
                Capability notifications
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Version and lifecycle events delivered to this tenant's active subscriptions.
            </p>
          </div>
          <SearchableSelect
            allowEmpty={false}
            className="min-w-36"
            label="Status"
            onValueChange={(value) => setNotificationStatus(value as "all" | "read" | "unread")}
            options={notificationStatusOptions}
            value={notificationStatus}
          />
        </div>
        {notifications.isPending ? (
          <div className="m-6 h-32 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : notifications.isError ? (
          <div className="p-6">
            <RequestFailure
              onRetry={() => void notifications.refetch()}
              title="Notifications unavailable"
            >
              The tenant inbox could not be loaded.
            </RequestFailure>
          </div>
        ) : notifications.data.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No {notificationStatus === "all" ? "" : notificationStatus} notification is available.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {notifications.data.items.map((notification) => (
              <li key={notification.notificationId} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-foreground">{notification.capabilitySlug}</h3>
                      <StatusBadge>{notification.eventKind}</StatusBadge>
                      {notification.changeClassification ? (
                        <StatusBadge
                          tone={
                            notification.changeClassification === "breaking" ? "danger" : "info"
                          }
                        >
                          {notification.changeClassification}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {notification.versionBefore ?? "No prior version"} →{" "}
                      {notification.versionAfter ?? "No reported version"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <time dateTime={notification.occurredAt}>{notification.occurredAt}</time>
                    </p>
                    <a
                      className="mt-2 inline-flex text-sm font-medium text-accent hover:underline"
                      href={notification.fetchUrl}
                    >
                      Inspect changed capability
                    </a>
                  </div>
                  {notificationStatus !== "read" ? (
                    <Button
                      disabled={markReadMutation.isPending}
                      onClick={() => markReadMutation.mutate(notification.notificationId)}
                      size="compact"
                      variant="secondary"
                    >
                      <Check aria-hidden="true" className="size-4" />
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="learning-title"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="learning-title" className="text-lg font-semibold text-foreground">
              Learning evidence
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tenant-scoped aggregate evidence. Privacy floors may intentionally suppress sparse
              cells.
            </p>
          </div>
          <SearchableSelect
            allowEmpty={false}
            className="min-w-36"
            label="Window"
            onValueChange={(value) => setWindowDays(Number(value))}
            options={learningWindowOptions}
            value={String(windowDays)}
          />
        </div>
        {aggregates.isPending || metrics.isPending ? (
          <div className="mt-5 h-36 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : aggregates.isError || metrics.isError ? (
          <div className="mt-5">
            <RequestFailure
              onRetry={() => {
                void aggregates.refetch();
                void metrics.refetch();
              }}
              title="Learning evidence unavailable"
            >
              Aggregate or metric definitions could not be loaded.
            </RequestFailure>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Aggregates</h3>
              <KeyValueEvidence value={aggregates.data} />
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Inspect metric definitions
              </summary>
              <div className="mt-3">
                <KeyValueEvidence value={metrics.data} />
              </div>
            </details>
          </div>
        )}
      </section>

      <section
        aria-labelledby="signal-title"
        className="rounded-xl border border-border bg-surface p-6"
      >
        <div className="flex items-center gap-2">
          <RadioTower aria-hidden="true" className="size-5 text-accent" />
          <h2 id="signal-title" className="text-lg font-semibold text-foreground">
            Record external signal
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Submit one allowlisted observation from a registered source. A fresh idempotency key is
          generated for each submission.
        </p>
        <form className="mt-5 space-y-5" onSubmit={submitSignal}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClassName}>
              Registered source UUID
              <input
                required
                className={inputClassName}
                onChange={(event) => setSourceId(event.target.value)}
                value={sourceId}
              />
            </label>
            <label className={labelClassName}>
              Source system
              <input
                required
                className={inputClassName}
                onChange={(event) => setSourceSystem(event.target.value)}
                value={sourceSystem}
              />
            </label>
            <label className={labelClassName}>
              Source event ID
              <input
                required
                className={inputClassName}
                onChange={(event) => setSourceEventId(event.target.value)}
                value={sourceEventId}
              />
            </label>
            <label className={labelClassName}>
              Producer ID
              <input
                required
                className={inputClassName}
                onChange={(event) => setProducerId(event.target.value)}
                value={producerId}
              />
            </label>
            <SearchableSelect
              allowEmpty={false}
              label="Producer type"
              onValueChange={(value) => setProducerType(value as "agent" | "external" | "human")}
              options={producerTypeOptions}
              value={producerType}
            />
            <SearchableSelect
              allowEmpty={false}
              label="Classification"
              onValueChange={(value) => setClassification(value as typeof classification)}
              options={signalClassificationOptions}
              value={classification}
            />
            <label className={labelClassName}>
              Event time
              <input
                required
                className={inputClassName}
                onChange={(event) => setEventTime(event.target.value)}
                type="datetime-local"
                value={eventTime}
              />
            </label>
            <label className={labelClassName}>
              Observed time
              <input
                required
                className={inputClassName}
                onChange={(event) => setObservedTime(event.target.value)}
                type="datetime-local"
                value={observedTime}
              />
            </label>
          </div>
          <label className={labelClassName}>
            Allowlisted payload
            <textarea
              aria-invalid={payloadError ? true : undefined}
              className={`${inputClassName} min-h-40 resize-y font-mono leading-6`}
              onChange={(event) => setPayloadText(event.target.value)}
              spellCheck={false}
              value={payloadText}
            />
          </label>
          {payloadError ? <p className="text-sm text-danger">{payloadError}</p> : null}
          {signalMutation.isError ? (
            <Notice title="Signal was not admitted" variant="danger">
              The service rejected the envelope. The entered evidence remains available for
              correction.
            </Notice>
          ) : null}
          {signalMutation.data ? (
            <Notice title="Durable signal receipt" variant="success">
              Signal {signalMutation.data.signalId} · authority {signalMutation.data.authority} ·
              digest {signalMutation.data.contentDigest}
            </Notice>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={signalMutation.isPending} type="submit">
              {signalMutation.isPending ? (
                <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Send aria-hidden="true" className="size-4" />
              )}
              {signalMutation.isPending ? "Submitting…" : "Submit signal"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
