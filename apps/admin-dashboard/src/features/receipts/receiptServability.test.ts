import { describe, expect, it } from "vitest";

import { ContextplaneApiError } from "../../shared/api";
import { SERVABILITY_COPY, servabilityFromError } from "./receiptServability";

function apiError(code: string, status = 409) {
  return new ContextplaneApiError({
    errors: [{ code, message: "refused", path: null }],
    requestId: "req-1",
    status,
  });
}

describe("servabilityFromError", () => {
  it("reads an unhydrated receipt as still being written, not as a failure", () => {
    /** The service refuses rather than answering emptily, because an empty
     * exclusions list is indistinguishable from "nothing was excluded". An
     * explorer that rendered the refusal as an error would teach its reader that
     * the system is broken when it is being careful. */
    expect(servabilityFromError(apiError("receipt_not_hydrated"))).toBe("still-being-written");
  });

  it("keeps a withheld receipt distinct from an unhydrated one", () => {
    /** Opposite in kind. Waiting fixes the first and fixes nothing about the
     * second, so collapsing them would leave somebody refreshing a screen that
     * will never change — and hide that a decision was taken. */
    expect(servabilityFromError(apiError("receipt_withheld"))).toBe("withheld");
  });

  it("offers a re-read only where re-reading could change the answer", () => {
    expect(SERVABILITY_COPY["still-being-written"].waitingHelps).toBe(true);
    expect(SERVABILITY_COPY.withheld.waitingHelps).toBe(false);
  });

  it("says plainly that a withheld receipt will not change on re-read", () => {
    expect(SERVABILITY_COPY.withheld.detail).toMatch(/return the same refusal/u);
  });

  it("leaves a real error a real error", () => {
    /** Swallowing a 500 into "still being written" would be the same mistake a
     * third time: a screen that reports a working system while it is broken. */
    expect(servabilityFromError(apiError("internal_error", 500))).toBeNull();
    expect(servabilityFromError(apiError("not_found", 404))).toBeNull();
    expect(servabilityFromError(new Error("network down"))).toBeNull();
    expect(servabilityFromError(null)).toBeNull();
  });
});
