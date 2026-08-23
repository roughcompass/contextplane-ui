import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, SearchableSelect, useToast } from "@repo/ui/primitives";

import {
  approveArcReplayCorpus,
  registerArcSourceConnector,
  registerArcSourceUploadPolicy,
  type ArcOwningScope,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

interface SourceGovernancePanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const fieldClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

const SCOPES: readonly { label: string; value: ArcOwningScope }[] = [
  { label: "Global — applies to every tenant", value: "global" },
  { label: "Tenant — applies to one tenant", value: "tenant" },
];

/** Comma or newline separated, trimmed, blanks dropped. */
function toList(raw: string): readonly string[] {
  return raw
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function ScopeField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (next: ArcOwningScope) => void;
  value: ArcOwningScope | "";
}) {
  return (
    <SearchableSelect
      emptyLabel="Choose a scope…"
      label={label}
      onValueChange={(next) => onChange(next as ArcOwningScope)}
      options={SCOPES.map((entry) => ({ label: entry.label, value: entry.value }))}
      value={value}
    />
  );
}

export function SourceGovernancePanel({ client, requestContext }: SourceGovernancePanelProps) {
  const { showToast } = useToast();

  const [connectorScope, setConnectorScope] = useState<ArcOwningScope | "">("");
  const [connectorId, setConnectorId] = useState("");
  const [schemes, setSchemes] = useState("");
  const [hosts, setHosts] = useState("");
  const [connectorMedia, setConnectorMedia] = useState("");
  const [connectorVerifiers, setConnectorVerifiers] = useState("");
  const [connectorMaxBytes, setConnectorMaxBytes] = useState("");

  const [policyScope, setPolicyScope] = useState<ArcOwningScope | "">("");
  const [policyId, setPolicyId] = useState("");
  const [policyMedia, setPolicyMedia] = useState("");
  const [policyVerifiers, setPolicyVerifiers] = useState("");
  const [policyMaxBytes, setPolicyMaxBytes] = useState("");

  const [corpusScope, setCorpusScope] = useState<ArcOwningScope | "">("");
  const [corpusDigest, setCorpusDigest] = useState("");
  const [generatorVersion, setGeneratorVersion] = useState("");

  const connectorMutation = useMutation({
    mutationFn: () =>
      registerArcSourceConnector(
        client,
        {
          allowed_hosts: toList(hosts),
          allowed_media_types: toList(connectorMedia),
          allowed_schemes: toList(schemes),
          allowed_verifier_ids: toList(connectorVerifiers),
          connector_id: connectorId.trim(),
          max_bytes: Number(connectorMaxBytes),
          owning_scope: connectorScope as ArcOwningScope,
        },
        requestContext,
      ),
    onSuccess: (result) =>
      showToast({ title: `Connector ${result.connector_id} registered`, variant: "success" }),
  });

  const policyMutation = useMutation({
    mutationFn: () =>
      registerArcSourceUploadPolicy(
        client,
        {
          allowed_media_types: toList(policyMedia),
          allowed_verifier_ids: toList(policyVerifiers),
          max_bytes: Number(policyMaxBytes),
          owning_scope: policyScope as ArcOwningScope,
          policy_id: policyId.trim(),
        },
        requestContext,
      ),
    onSuccess: (result) =>
      showToast({ title: `Upload policy ${result.policy_id} registered`, variant: "success" }),
  });

  const corpusMutation = useMutation({
    mutationFn: () =>
      approveArcReplayCorpus(
        client,
        {
          corpus_digest: corpusDigest.trim(),
          generator_version: generatorVersion.trim(),
          owning_scope: corpusScope as ArcOwningScope,
        },
        requestContext,
      ),
    onSuccess: () => showToast({ title: "Replay corpus approved", variant: "success" }),
  });

  const connectorReady =
    connectorScope !== "" &&
    connectorId.trim() !== "" &&
    toList(schemes).length > 0 &&
    toList(hosts).length > 0 &&
    toList(connectorMedia).length > 0 &&
    toList(connectorVerifiers).length > 0 &&
    Number.isInteger(Number(connectorMaxBytes)) &&
    Number(connectorMaxBytes) > 0;

  const policyReady =
    policyScope !== "" &&
    policyId.trim() !== "" &&
    toList(policyMedia).length > 0 &&
    toList(policyVerifiers).length > 0 &&
    Number.isInteger(Number(policyMaxBytes)) &&
    Number(policyMaxBytes) > 0;

  const corpusReady =
    corpusScope !== "" && corpusDigest.trim() !== "" && generatorVersion.trim() !== "";

  function submit(ready: boolean, run: () => void) {
    return (event: FormEvent) => {
      event.preventDefault();
      if (ready) run();
    };
  }

  return (
    <div className="space-y-6">
      {/* The entry's own point, and the reason this page exists apart from the
          authoring flow: none of these three governs one change. Each is a
          standing grant that every later admission inherits, and nothing about
          the act of registering one looks like it changes what governance
          concludes. */}
      <Notice title="These are standing grants, not one-off settings" variant="warning">
        Nothing registered here applies to a single change. A connector or upload policy sets the
        limits that <strong>every future admission through it</strong> inherits — including, in the
        verifier list, who is allowed to approve that material. A replay corpus decides what
        &ldquo;the change behaved correctly&rdquo; is measured against for every qualification that
        cites it. None of them can be read back afterwards, so what is registered here is not
        visible anywhere else.
      </Notice>

      <SectionSurface
        description="What ARC may fetch, from where, and who may approve what comes back."
        title="Register a source connector"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={submit(connectorReady, () => connectorMutation.mutate())}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ScopeField label="Connector scope" onChange={setConnectorScope} value={connectorScope} />
            <label className="text-xs font-medium text-muted" htmlFor="connector-id">
              Connector
              <input
                className={fieldClassName}
                id="connector-id"
                onChange={(event) => setConnectorId(event.target.value)}
                value={connectorId}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="connector-schemes">
              Allowed schemes
              <input
                className={fieldClassName}
                id="connector-schemes"
                onChange={(event) => setSchemes(event.target.value)}
                placeholder="https"
                value={schemes}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="connector-hosts">
              Allowed hosts
              <input
                className={fieldClassName}
                id="connector-hosts"
                onChange={(event) => setHosts(event.target.value)}
                placeholder="policy.example.com, docs.example.com"
                value={hosts}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="connector-media">
              Allowed media types
              <input
                className={fieldClassName}
                id="connector-media"
                onChange={(event) => setConnectorMedia(event.target.value)}
                placeholder="application/pdf, text/markdown"
                value={connectorMedia}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="connector-max-bytes">
              Maximum bytes
              <input
                className={fieldClassName}
                id="connector-max-bytes"
                inputMode="numeric"
                onChange={(event) => setConnectorMaxBytes(event.target.value)}
                value={connectorMaxBytes}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted" htmlFor="connector-verifiers">
            Allowed approval verifiers
            <input
              className={fieldClassName}
              id="connector-verifiers"
              onChange={(event) => setConnectorVerifiers(event.target.value)}
              value={connectorVerifiers}
            />
          </label>
          {/* Named rather than left as one field among six: it is the only one
              here that widens who may approve, and it is the one whose effect is
              least visible from its own name. */}
          <p className="text-xs text-muted">
            This list decides <strong>who may approve material this connector fetches</strong>. It
            is the widest thing on this form: adding a verifier here grants approval authority over
            every future fetch, not just the next one.
          </p>
          <Button disabled={!connectorReady || connectorMutation.isPending} type="submit">
            Register this connector
          </Button>
        </form>
      </SectionSurface>

      <SectionSurface
        description="The same limits for material pushed in rather than fetched."
        title="Register an upload policy"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={submit(policyReady, () => policyMutation.mutate())}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <ScopeField label="Upload policy scope" onChange={setPolicyScope} value={policyScope} />
            <label className="text-xs font-medium text-muted" htmlFor="policy-id">
              Policy
              <input
                className={fieldClassName}
                id="policy-id"
                onChange={(event) => setPolicyId(event.target.value)}
                value={policyId}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="policy-media">
              Uploadable media types
              <input
                className={fieldClassName}
                id="policy-media"
                onChange={(event) => setPolicyMedia(event.target.value)}
                value={policyMedia}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="policy-max-bytes">
              Maximum upload bytes
              <input
                className={fieldClassName}
                id="policy-max-bytes"
                inputMode="numeric"
                onChange={(event) => setPolicyMaxBytes(event.target.value)}
                value={policyMaxBytes}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted" htmlFor="policy-verifiers">
            Approval verifiers for uploads
            <input
              className={fieldClassName}
              id="policy-verifiers"
              onChange={(event) => setPolicyVerifiers(event.target.value)}
              value={policyVerifiers}
            />
          </label>
          <Button disabled={!policyReady || policyMutation.isPending} type="submit">
            Register this upload policy
          </Button>
        </form>
      </SectionSurface>

      <SectionSurface
        description="What observation is replayed against, named by digest."
        title="Approve a replay corpus"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={submit(corpusReady, () => corpusMutation.mutate())}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <ScopeField label="Corpus scope" onChange={setCorpusScope} value={corpusScope} />
            <label className="text-xs font-medium text-muted" htmlFor="corpus-digest">
              Corpus digest
              <input
                className={fieldClassName}
                id="corpus-digest"
                onChange={(event) => setCorpusDigest(event.target.value)}
                value={corpusDigest}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="corpus-generator">
              Generator version
              <input
                className={fieldClassName}
                id="corpus-generator"
                onChange={(event) => setGeneratorVersion(event.target.value)}
                value={generatorVersion}
              />
            </label>
          </div>
          {/* The digest is the corpus, not a label for it. */}
          <p className="text-xs text-muted">
            The digest <strong>is</strong> the corpus. A regenerated corpus with the same generator
            version has a different digest and needs its own approval — which is what keeps
            &ldquo;it behaved correctly&rdquo; meaning one thing across qualifications.
          </p>
          <Button disabled={!corpusReady || corpusMutation.isPending} type="submit">
            Approve this corpus
          </Button>
        </form>
      </SectionSurface>
    </div>
  );
}
