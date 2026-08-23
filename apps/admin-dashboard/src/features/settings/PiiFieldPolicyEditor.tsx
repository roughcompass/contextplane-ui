import { useId, useState, type FormEvent } from "react";

import { Button, SearchableSelect } from "@repo/ui/primitives";

import type { PiiPattern } from "../../shared/api";

/**
 * The policies a tenant may set on a field.
 *
 * Three, and the service takes the strongest of the tenant's value and its own
 * floor — so `advisory` here does not weaken a block the deployment applies. The
 * contract types this as an open `string`, which is why the list is written
 * out; see the field-type note below for why that matters more there.
 */
const POLICIES = [
  { label: "Advisory — record the match, allow the write", value: "advisory" },
  { label: "Warn — allow the write and tell the caller", value: "warn" },
  { label: "Block — refuse the write", value: "block" },
] as const;

/**
 * The field types the scanner runs on.
 *
 * **Written out here because the contract does not publish them.** The service
 * holds a closed set — `PILOT_FIELD_TYPES` — and refuses an unrecognised value
 * rather than admitting it, but `PiiFieldPolicyCreate.field_type` is typed as a
 * bare `string`. So a free-text field would let an operator save a policy that
 * silently governs nothing: it would store, list, and never match.
 *
 * A duplicated vocabulary is the lesser problem, and it is a visible one — a
 * value missing from this list cannot be selected, where a typo in a text box
 * cannot be seen at all. The contract gap is filed rather than lived with.
 */
const FIELD_TYPES = [
  "artifact.body",
  "claim_value",
  "external_signal.payload",
  "external_signal.references",
  "intent_checkpoint.body",
  "intent_checkpoint.references",
  "memory_session_event.body",
  "workspace_entry.body",
  "workspace_entry.references",
] as const;

export interface PiiFieldPolicyDraft {
  fieldType: string;
  patternId: string | null;
  policy: string;
}

interface PiiFieldPolicyEditorProps {
  disabled: boolean;
  onSubmit: (draft: PiiFieldPolicyDraft) => void;
  patterns: readonly PiiPattern[];
}

export function PiiFieldPolicyEditor({ disabled, onSubmit, patterns }: PiiFieldPolicyEditorProps) {
  const formId = useId();
  const [fieldType, setFieldType] = useState("");
  const [patternId, setPatternId] = useState("");
  const [policy, setPolicy] = useState("");

  const ready = fieldType !== "" && policy !== "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    // An empty pattern means the catch-all override for this field type, which
    // is what the endpoint reads a null `pattern_id` as — not "no policy".
    onSubmit({ fieldType, patternId: patternId === "" ? null : patternId, policy });
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
          onValueChange={setFieldType}
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
          onValueChange={setPolicy}
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
