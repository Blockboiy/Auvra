import { describe, expect, it } from "vitest";
import { compactSearchEvidence, incompleteFinishReason, MAX_PUBLIC_SEARCH_CALLS } from "./research-guard.js";

describe("bounded, auditable web research", () => {
  it("keeps a predictable three-search limit", () => {
    expect(MAX_PUBLIC_SEARCH_CALLS).toBe(3);
  });
  it("retains citation URLs but trims long untrusted snippets and source counts", () => {
    const original = {
      query: "my query",
      results: Array.from({ length: 17 }, (_, i) => ({
        title: "Result " + i, url: "https://example.org/source-" + i, description: "x".repeat(750)
      }))
    };
    const compact = compactSearchEvidence(original);
    expect(compact.results).toHaveLength(8);
    expect(compact.results[0]?.url).toBe("https://example.org/source-0");
    expect(compact.results[0]?.description).toHaveLength(180);
    expect(original.results[0]?.description).toHaveLength(750);
    expect(compact.note).toContain("untrusted leads");
  });
  it("rejects incomplete final answers while allowing an ordinary stop", () => {
    expect(incompleteFinishReason("length")).toBe(true);
    expect(incompleteFinishReason("max_tokens")).toBe(true);
    expect(incompleteFinishReason("content_filter")).toBe(true);
    expect(incompleteFinishReason("stop")).toBe(false);
    expect(incompleteFinishReason(null)).toBe(false);
  });
});
