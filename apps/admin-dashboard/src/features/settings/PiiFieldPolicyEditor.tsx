import { useId, useState, type FormEvent } from "react";

import { Button, SearchableSelect } from "@repo/ui/primitives";

import type { PiiFieldType, PiiPattern, PiiPolicy } from "../../shared/api";

/**
 * The policies a tenant may set on a field, with the wording an operator reads.
 *
 * Three, and the service takes the strongest of the tenant's value and its own
 * floor — so `advisory` here does not weaken a block the deployment applies.
 *
 * Written out for the labels, not for the values: the values are checked
 * against the contract by the `PiiPolicy` annotation below, so one the service
 * drops fails the build here.
 */
const POLICIES: readonly { label: string; value: PiiPolicy }[] = [
  { label: "Advisory — record the match, allow the write", value: "advisory" },
  { label: "Warn — allow the write and tell the caller", value: "warn" },
  { label: "Block — refuse the write", value: "block" },
];

/**
 * The field types the scanner runs on.
 *
 * **Still written out, and now checked.** A TypeScript union cannot be
 * enumerated at runtime, so a picker needs a real array — the list does not go
 * away. What changed is that `PiiFieldType` comes from the contract, so a value
 * the service removes fails the build here instead of silently offering an
 * operator a policy that stores, lists, and governs nothing.
 *
 * The remaining gap is one-directional and worth naming: a value the service
 * *adds* still has to be added here by hand. Nothing catches its absence,
 * because an incomplete array is a valid array.
 */
const FIELD_TYPES: readonly PiiFieldType[] = [
  "artifact.body",
  "claim_value",
  "external_signal.payload",
  "external_signal.references",
  "intent_checkpoint.body",
  "intent_checkpoint.references",
  "memory_session_event.body",
  "workspace_entry.body",
  "workspace_entry.references",
];

export interface PiiFieldPolicyDraft {
  fieldType: PiiFieldType;
  patternId: string | null;
  policy: PiiPolicy;
}

interface PiiFieldPolicyEditorProps {
  disabled: boolean;
  onSubmit: (draft: PiiFieldPolicyDraft) => void;
  patterns: readonly PiiPattern[];
}

export function PiiFieldPolicyEditor({ disabled, onSubmit, patterns }: PiiFieldPolicyEditorProps) {
  const formId = useId();
  const [fieldType, setFieldType] = useState<PiiFieldType | "">("");
  const [patternId, setPatternId] = useState("");
  const [policy, setPolicy] = useState<PiiPolicy | "">("");

  const ready = fieldType !== "" && policy !== "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    // An empty pattern means the catch-all override for this field type, which
    // is what the endpoint reads a null `pattern_id` as — not "no policy".
    onSubmit({
      fieldType: fieldType as PiiFieldType,
      patternId: patternId === "" ? null : patternId,
      policy: policy as PiiPolicy,
    });
    setFieldType("");
    setPatternId("");
    setPolicy("");
  }

  return (
    <form aria-labelledby={formId} className="space-y-3 px-6 py-4" onSubmit={submit}>
      <h3 className="text-sm font-semibold text-foreground" id={formId}>
        Set a field policy
      </h3>
      <p className="text-xs text-muted">
        Leave the pattern empty to cover every detector on that field type. Setting a policy
        replaces any existing one for the same field and pattern.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <SearchableSelect
          emptyLabel="Choose a field type…"
          label="Field type"
          onValueChange={(value) => setFieldType(value as PiiFieldType)}
          options={FIELD_TYPES.map((value) => ({ label: value, value }))}
          value={fieldType}
        />
        <SearchableSelect
          allowEmpty
          emptyLabel="Every pattern"
          label="Detector pattern"
          onValueChange={setPatternId}
          options={patterns.map((pattern) => ({
            label: `${pattern.name} (${pattern.category})`,
            value: pattern.pattern_id,
          }))}
          value={patternId}
        />
        <SearchableSelect
          emptyLabel="Choose a policy…"
          label="Policy"
          onValueChange={(value) => setPolicy(value as PiiPolicy)}
          options={POLICIES.map((entry) => ({ label: entry.label, value: entry.value }))}
          value={policy}
        />
      </div>
      <Button disabled={disabled || !ready} type="submit">
        Set policy
      </Button>
    </form>
  );
}
