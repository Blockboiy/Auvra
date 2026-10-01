import { describe, expect, it, vi } from "vitest";
import {
  BraveWebSearch, FallbackWebSearch, OrbioFirecrawlWebResearch, assertSafeScrapeUrl,
  requiresWebResearch, cleanSearchSnippet, ORBIO_WEB_SEARCH_MAX_COST_USD,
  ORBIO_WEB_SCRAPE_UNIT_COST_USD, type WebSearchProvider, type WebToolBudgetContext
} from "./web-search.js";

const publicResult = (provider: "brave" | "orbio-firecrawl" = "brave") => ({
  provider, query: "test", searchedAt: new Date().toISOString(),
  results: [{ title: "Result", url: "https://example.com/", description: "Evidence" }], note: "Untrusted"
});
const budget = (): WebToolBudgetContext => ({ assertCanSpend: vi.fn(async () => undefined), recordSpend: vi.fn(async () => undefined) });
const publicDns = async () => ["93.184.216.34"];

describe("permissioned research", () => {
  it("removes provider HTML tags from public result text", () => {
    expect(cleanSearchSnippet("<strong>Auvra</strong> &amp; small businesses")).toBe("Auvra & small businesses");
    expect(cleanSearchSnippet("Online <em>ordering</em> &nbsp; pages")).toBe("Online ordering pages");
  });
  it("detects current public-business discovery without flagging arithmetic", () => {
    expect(requiresWebResearch("Get me a list of resturants that have a checkout system within Lagos Nigeria")).toBe(true);
    expect(requiresWebResearch("Calculate (18 x 7) + 5")).toBe(false);
  });
  it("requires a server key and validates query size", async () => {
    await expect(new BraveWebSearch("").search("restaurants in Lagos")).rejects.toThrow("not configured");
    await expect(new BraveWebSearch("test").search("x".repeat(251))).rejects.toThrow("1-250");
  });
  it("returns sourced Brave results while discarding unsafe URLs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ web: { results: [
      { title: "Example Restaurant", url: "https://example.com/order", description: "Order food online" },
      { title: "Invalid", url: "javascript:alert(1)", description: "Invalid URL" }
    ] } }), { status: 200 }));
    const result = await new BraveWebSearch("test-secret", fetcher as typeof fetch).search("Lagos restaurants online ordering");
    expect(result).toMatchObject({ provider: "brave", results: [{ url: "https://example.com/order" }] });
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("test-secret");
  });
  it("uses Brave success without calling Orbio", async () => {
    const brave: WebSearchProvider = { configured: true, search: vi.fn(async () => publicResult("brave")) };
    const orbio: WebSearchProvider = { configured: true, search: vi.fn(async () => publicResult("orbio-firecrawl")) };
    expect((await new FallbackWebSearch(brave, orbio).search("test query", budget())).provider).toBe("brave");
    expect(orbio.search).not.toHaveBeenCalled();
  });
  it("uses Orbio with the same budget context when Brave returns zero valid results", async () => {
    const brave: WebSearchProvider = { configured: true, search: vi.fn(async () => ({ ...publicResult("brave"), results: [] })) };
    const orbio: WebSearchProvider = { configured: true, search: vi.fn(async (_query, guard) => {
      await guard!.recordSpend({ provider: "orbio-firecrawl", tool: "web.search", units: 1, amountUsd: 0.0011, source: "provider" });
      return publicResult("orbio-firecrawl");
    }) };
    const guard = budget();
    const response = await new FallbackWebSearch(brave, orbio).search("test query", guard);
    expect(response.provider).toBe("orbio-firecrawl");
    expect(orbio.search).toHaveBeenCalledWith("test query", guard);
    expect(guard.recordSpend).toHaveBeenCalledTimes(1);
    expect(guard.recordSpend).toHaveBeenCalledWith(expect.objectContaining({ tool: "web.search", amountUsd: 0.0011 }));
  });
  it("returns an empty Orbio result once without recursively falling back", async () => {
    const brave: WebSearchProvider = { configured: true, search: vi.fn(async () => ({ ...publicResult("brave"), results: [] })) };
    const orbio: WebSearchProvider = { configured: true, search: vi.fn(async () => ({ ...publicResult("orbio-firecrawl"), results: [] })) };
    const response = await new FallbackWebSearch(brave, orbio).search("test query", budget());
    expect(response).toMatchObject({ provider: "orbio-firecrawl", results: [] });
    expect(brave.search).toHaveBeenCalledTimes(1);
    expect(orbio.search).toHaveBeenCalledTimes(1);
  });
  it("uses Orbio when Brave is unconfigured, rate limited, or unreachable", async () => {
    const braves: WebSearchProvider[] = [
      { configured: false, search: vi.fn() },
      { configured: true, search: vi.fn(async () => { throw new Error("429 quota"); }) },
      { configured: true, search: vi.fn(async () => { throw new TypeError("network"); }) }
    ];
    for (const brave of braves) {
      const orbio: WebSearchProvider = { configured: true, search: vi.fn(async () => publicResult("orbio-firecrawl")) };
      expect((await new FallbackWebSearch(brave, orbio).search("test query", budget())).provider).toBe("orbio-firecrawl");
      expect(orbio.search).toHaveBeenCalledTimes(1);
    }
  });
  it("normalizes Orbio results, preflights the bound, and records provider cost", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      result: { results: [{ title: "<b>Safe</b>", url: "https://example.com/x", description: "<i>Desc</i>" }] }, cost: { credit: "0.001100", status: "settled" }
    }), { status: 200 }));
    const guard = budget();
    const result = await new OrbioFirecrawlWebResearch("secret-key", "https://api.orbio.test/api/v1", fetcher as typeof fetch, publicDns).search("safe query", guard);
    expect(result).toMatchObject({ provider: "orbio-firecrawl", results: [{ title: "Safe", description: "Desc" }] });
    expect(guard.assertCanSpend).toHaveBeenCalledWith(ORBIO_WEB_SEARCH_MAX_COST_USD, "web.search");
    expect(guard.recordSpend).toHaveBeenCalledWith(expect.objectContaining({ tool: "web.search", amountUsd: 0.0011, units: 1, source: "provider" }));
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ limit: 8, scrape: false, max_cost: "0.008800" });
  });
  it("does not send Orbio search when the mission budget guard rejects it", async () => {
    const fetcher = vi.fn(); const guard = budget();
    vi.mocked(guard.assertCanSpend).mockRejectedValue(new Error("insufficient mission budget"));
    await expect(new OrbioFirecrawlWebResearch("secret-key", "https://api.orbio.test/api/v1", fetcher as typeof fetch).search("safe query", guard)).rejects.toThrow("insufficient mission budget");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("surfaces a clean Orbio failure without leaking ORBIO_API_KEY", async () => {
    const secret = "sk-orbio-super-secret";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: `bad ${secret}` } }), { status: 500 }));
    let message = "";
    try { await new OrbioFirecrawlWebResearch(secret, "https://api.orbio.test/api/v1", fetcher as typeof fetch).search("safe query", budget()); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain("HTTP 500"); expect(message).not.toContain(secret);
  });
  it("records successful scrape cost and caps untrusted page content", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ result: { markdown: "x".repeat(60_000), metadata: { url: "https://example.com/page" } }, cost: { credit: null, status: "settling" } }), { status: 200 }));
    const guard = budget();
    const result = await new OrbioFirecrawlWebResearch("secret", "https://api.orbio.test/api/v1", fetcher as typeof fetch, publicDns).scrape("https://example.com/page", guard);
    expect(result.markdown).toHaveLength(50_000);
    expect(guard.assertCanSpend).toHaveBeenCalledWith(ORBIO_WEB_SCRAPE_UNIT_COST_USD, "web.scrape");
    expect(guard.recordSpend).toHaveBeenCalledWith(expect.objectContaining({ amountUsd: 0.0011, units: 1, source: "catalogue" }));
  });
  it.each([
    ["localhost", "http://localhost/page"], ["IPv4 loopback", "http://127.0.0.2/page"],
    ["IPv6 loopback", "http://[::1]/page"], ["mapped loopback", "http://[::ffff:7f00:1]/page"],
    ["private network", "http://192.168.1.10/page"], ["file protocol", "file:///etc/passwd"],
    ["FTP protocol", "ftp://example.com/page"], ["data protocol", "data:text/plain,test"],
    ["JavaScript protocol", "javascript:alert(1)"]
  ])("rejects %s scrape URLs", async (_label, url) => {
    await expect(assertSafeScrapeUrl(url, publicDns)).rejects.toThrow();
  });
});
