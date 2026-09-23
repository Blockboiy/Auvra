import { describe, expect, it, vi } from "vitest";
import { BraveWebSearch, requiresWebResearch, cleanSearchSnippet } from "./web-search.js";

describe("permissioned research", () => {
  it("removes provider HTML tags from public result text", () => {
    expect(cleanSearchSnippet("<strong>Auvra</strong> &amp; small businesses")).toBe("Auvra & small businesses");
    expect(cleanSearchSnippet("Online <em>ordering</em> &nbsp; pages")).toBe("Online ordering pages");
  });
  it("detects current public-business discovery without flagging arithmetic", () => {
    expect(requiresWebResearch("Get me a list of resturants that have a checkout system within Lagos Nigeria")).toBe(true);
    expect(requiresWebResearch("Calculate (18 × 7) + 5")).toBe(false);
  });

  it("requires a server key and validates query size", async () => {
    await expect(new BraveWebSearch("").search("restaurants in Lagos")).rejects.toThrow("BRAVE_SEARCH_API_KEY");
    await expect(new BraveWebSearch("test").search("x".repeat(251))).rejects.toThrow("1–250");
  });

  it("returns sourced results from the provider, discarding unsafe URLs", async () => {
    const fetcher = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify({ web: { results: [
      { title: "Example Restaurant", url: "https://example.com/order", description: "Order food online" },
      { title: "Invalid", url: "javascript:alert(1)", description: "Invalid URL" }
    ] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const service = new BraveWebSearch("test-secret", fetcher as unknown as typeof fetch);
    const result = await service.search("Lagos restaurants online ordering");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.url).toBe("https://example.com/order");
    expect(result.note).toContain("not verified facts");
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string,string>)["X-Subscription-Token"]).toBe("test-secret");
  });
});
