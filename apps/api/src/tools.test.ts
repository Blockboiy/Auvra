import type { Mission } from "@auvra/shared";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./tools.js";
import type { WebScrapeProvider, WebSearchProvider, WebToolBudgetContext } from "./web-search.js";

const mission = (permissions: Mission["permissions"]): Mission => ({
  id: "mission", objective: "Test objective", budgetUsd: 1, permissions, status: "running", currentStep: 1, maxSteps: 3,
  actualCostUsd: 0, estimatedCostUsd: 0, usage: { input: 0, output: 0, total: 0 }, events: [], notes: [],
  cancellationRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
});

describe("tool permission enforcement", () => {
  it("rejects a real tool without its required permission", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("calculate", { operation: "add", a: 2, b: 3 }, { mission: mission([]), saveNote: async () => undefined }))
      .rejects.toThrow("math.calculate");
  });

  it("executes allowlisted arithmetic with permission", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("calculate", { operation: "percent", a: 15, b: 200 }, { mission: mission(["math.calculate"]), saveNote: async () => undefined }))
      .resolves.toMatchObject({ result: 30 });
  });

  it("scrapes only an exact URL originating from this mission's search results", async () => {
    const search: WebSearchProvider = { configured: true, search: async () => ({ provider: "brave", query: "q", searchedAt: new Date().toISOString(), results: [], note: "n" }) };
    const scrape: WebScrapeProvider = { configured: true, scrape: async (url) => ({ provider: "orbio-firecrawl", url, scrapedAt: new Date().toISOString(), markdown: "evidence", note: "untrusted" }) };
    const registry = new ToolRegistry(search, scrape);
    const webBudget: WebToolBudgetContext = { assertCanSpend: async () => undefined, recordSpend: async () => undefined };
    const context = { mission: mission(["web.scrape"]), saveNote: async () => undefined, webBudget, searchedUrls: new Set(["https://example.com/page"]) };
    await expect(registry.execute("web_scrape", { url: "https://example.com/page" }, context)).resolves.toMatchObject({ markdown: "evidence" });
    await expect(registry.execute("web_scrape", { url: "https://other.example/page" }, context)).rejects.toThrow("this mission");
  });

  it("requires the explicit web.scrape permission", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("web_scrape", { url: "https://example.com/" }, { mission: mission(["web.search"]), saveNote: async () => undefined }))
      .rejects.toThrow("web.scrape");
  });
});
