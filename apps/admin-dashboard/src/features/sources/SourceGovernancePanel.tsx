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
import { VerifierAuthorityPicker } from "../../shared/arcGovernance/VerifierAuthorityPicker";

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
  // Arrays rather than raw text: the picker returns identifiers it read back
  // from the service, so there is nothing left for `toList` to salvage.
  const [connectorVerifiers, setConnectorVerifiers] = useState<readonly string[]>([]);
  const [connectorMaxBytes, setConnectorMaxBytes] = useState("");

  const [policyScope, setPolicyScope] = useState<ArcOwningScope | "">("");
  const [policyId, setPolicyId] = useState("");
  const [policyMedia, setPolicyMedia] = useState("");
  const [policyVerifiers, setPolicyVerifiers] = useState<readonly string[]>([]);
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
          allowed_verifier_ids: connectorVerifiers,
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
          allowed_verifier_ids: policyVerifiers,
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
    connectorVerifiers.length > 0 &&
    Number.isInteger(Number(connectorMaxBytes)) &&
    Number(connectorMaxBytes) > 0;

  const policyReady =
    policyScope !== "" &&
    policyId.trim() !== "" &&
    toList(policyMedia).length > 0 &&
    policyVerifiers.length > 0 &&
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
          concludes.

          The last sentence used to read "None of them can be read back
          afterwards, so what is registered here is not visible anywhere else."
          The tables below this form are that sentence being false, and it was
          false before they existed — the five list endpoints were in the
          committed contract the whole time. Deleting the whole notice would have
          dropped a real warning with it, which is why only the false half went. */}
      <Notice title="These are standing grants, not one-off settings" variant="warning">
        Nothing registered here applies to a single change. A connector or upload policy sets the
        limits that <strong>every future admission through it</strong> inherits — including, in the
        verifier list, who is allowed to approve that material. A replay corpus decides what
        &ldquo;the change behaved correctly&rdquo; is measured against for every qualification that
        cites it.
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
            <ScopeField
              label="Connector scope"
              onChange={setConnectorScope}
              value={connectorScope}
            />
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
          {/* Named rather than left as one field among six: it is the only one
              here that widens who may approve, and it is the one whose effect is
              least visible from its own name. The picker adds the fact the
              warning could only assert — how much authority each candidate
              already holds — which is the argument E22-T5 said gets stronger
              rather than weaker once verifiers are readable. */}
          <VerifierAuthorityPicker
            client={client}
            hint="This list decides who may approve material this connector fetches. It is the widest thing on this form: adding a verifier here grants approval authority over every future fetch, not just the next one."
            label="Allowed approval verifiers"
            onChange={setConnectorVerifiers}
            tenantId={requestContext.tenantId}
            value={connectorVerifiers}
          />
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
          <VerifierAuthorityPicker
            client={client}
            hint="The same grant on the upload path: a verifier here may approve everything pushed in through this policy, for as long as the policy stands."
            label="Approval verifiers for uploads"
            onChange={setPolicyVerifiers}
            tenantId={requestContext.tenantId}
            value={policyVerifiers}
          />
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
              {/* The digest IS the corpus, which the copy below already argues and which
                  ADR 0018 quotes as the clearest statement of this exception anywhere in
                  the tree: a regenerated corpus has a different digest and needs its own
                  approval.
                  identifier-exception: asserted-digest */}
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
          {/* The digest is the corpus, not a label for it.

              **And it is the one identifier field on this screen that stays a
              text box.** ADR 0018 says a server-assigned identifier is chosen
              from a list, never typed — and its exception is a value the server
              has not assigned yet. This is that: approving a corpus is the act
              that first makes the digest known here, so there is no collection
              to choose from. Applying the rule anyway would mean offering the
              reader a list of corpora that are already approved, on the form for
              approving one that is not. The table below is where the approved
              ones are. */}
          <p className="text-xs text-muted">
            The digest <strong>is</strong> the corpus. A regenerated corpus with the same generator
            version has a different digest and needs its own approval — which is what keeps
            &ldquo;it behaved correctly&rdquo; meaning one thing across qualifications.
          </p>
          <p className="text-xs text-muted">
            Typed rather than chosen, unlike every other identifier on this screen: this is the act
            that first tells Contextplane the digest exists, so there is nothing yet to choose from.
          </p>
          <Button disabled={!corpusReady || corpusMutation.isPending} type="submit">
            Approve this corpus
          </Button>
        </form>
      </SectionSurface>
    </div>
  );
}
