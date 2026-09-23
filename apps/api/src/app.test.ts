import type { InferenceResult } from "./provider/types.js";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { ProviderError, type InferenceProvider, type InferenceRequest } from "./provider/types.js";
import { MemoryMissionRepository } from "./repository.js";
import { BraveWebSearch } from "./web-search.js";

const result = (values: Partial<InferenceResult> = {}): InferenceResult => ({
  text: "complete",
  toolCalls: [],
  usage: { input: 10, output: 5, total: 15 },
  actualCostUsd: 0.001,
  model: "mock/orbio",
  finishReason: "stop",
  ...values
});

class ScriptedProvider implements InferenceProvider {
  calls = 0;
  constructor(private readonly script: Array<InferenceResult | Error | ((request: InferenceRequest) => Promise<InferenceResult>)>) {}
  async complete(request: InferenceRequest): Promise<InferenceResult> {
    const next = this.script[this.calls++];
    if (!next) throw new Error("Unexpected provider call");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(request) : next;
  }
}

const setup = (provider: InferenceProvider, values: { maxSteps?: number; preflightCostUsd?: number } = {}) => {
  const config = getConfig({
    maxSteps: values.maxSteps ?? 3,
    preflightCostUsd: values.preflightCostUsd ?? 0.002,
    missionTimeoutMs: 2_000,
    webSearch: { apiKey: "" },
    provider: { apiKey: "test-key", baseUrl: "https://example.invalid/api/v1", model: "mock/orbio", timeoutMs: 500, retries: 0 }
  });
  return createApp(config, { repository: new MemoryMissionRepository(), provider });
};

const createMission = async (app: ReturnType<typeof createApp>["app"], values: Record<string, unknown> = {}) => {
  const response = await request(app).post("/api/missions").send({ objective: "Calculate the contingency amount and report it", budgetUsd: 0.05, permissions: ["math.calculate"], ...values });
  return response;
};

const waitForTerminal = async (app: ReturnType<typeof createApp>["app"], id: string) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request(app).get(`/api/missions/${id}`);
    if (["completed", "failed", "cancelled", "budget_exhausted"].includes(response.body.status)) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Mission did not finish");
};

describe("mission web research preflight", () => {
  it("performs a permissioned live-source lookup before planning and preserves source evidence", async () => {
    const provider = new ScriptedProvider([
      result({ text: JSON.stringify({ summary: "Use sources", steps: ["Review public sources"] }) }),
      result({ text: "Candidate: [Example](https://example.com/order). Checkout product not independently verified." })
    ]);
    const config = getConfig({
      webSearch: { apiKey: "test-search-key" },
      provider: { apiKey: "test-key", baseUrl: "https://example.invalid/api/v1", model: "mock/orbio", timeoutMs: 500, retries: 0 }
    });
    const mockFetch = async () => new Response(JSON.stringify({ web: { results: [{ title: "Example", url: "https://example.com/order", description: "Online order page" }] } }), { status: 200 });
    const searchProvider = new BraveWebSearch("test-search-key", mockFetch as typeof fetch);
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider, searchProvider });
    const created = await createMission(app, {
      objective: "Get me a list of resturants that have a checkout system within Lagos Nigeria",
      permissions: ["web.search"]
    });
    expect((await request(app).post(`/api/missions/${created.body.id}/start`)).status).toBe(202);
    const completed = await waitForTerminal(app, created.body.id);
    expect(completed.status).toBe("completed");
    expect(completed.events.some((event: { type: string; tool?: { name: string } }) => event.type === "tool.completed" && event.tool?.name === "web_search")).toBe(true);
    expect(completed.finalOutput).toContain("https://example.com/order");
    expect(provider.calls).toBe(2);
  });

  it("requires explicit web permission and a configured search provider before paid inference", async () => {
    const provider = new ScriptedProvider([]);
    const { app } = setup(provider);
    const objective = "Get me a list of restaurants that have a checkout system within Lagos Nigeria";
    const created = await createMission(app, { objective, permissions: ["notes.write"] });
    const missingPermission = await request(app).post(`/api/missions/${created.body.id}/start`);
    expect(missingPermission.status).toBe(422);
    expect(missingPermission.body.error.code).toBe("WEB_RESEARCH_PERMISSION_REQUIRED");
    const permitted = await createMission(app, { objective, permissions: ["web.search"] });
    const missingProvider = await request(app).post(`/api/missions/${permitted.body.id}/start`);
    expect(missingProvider.status).toBe(503);
    expect(missingProvider.body.error.code).toBe("WEB_RESEARCH_NOT_CONFIGURED");
    expect(provider.calls).toBe(0);
  });
});

describe("mission API and executor", () => {
  it("validates mission creation inputs", async () => {
    const { app } = setup(new ScriptedProvider([]));
    const response = await createMission(app, { objective: "short", budgetUsd: -1, permissions: ["shell.execute"] });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a draft and requires explicit start before multi-step execution", async () => {
    const provider = new ScriptedProvider([
      result({ text: JSON.stringify({ summary: "Calculate safely", steps: ["Calculate", "Report"] }) }),
      result({ text: "", toolCalls: [{ id: "call-1", type: "function", function: { name: "calculate", arguments: JSON.stringify({ operation: "percent", a: 15, b: 2400 }) } }] }),
      result({ text: "The 15% contingency is $360." })
    ]);
    const { app } = setup(provider);
    const created = await createMission(app);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect(provider.calls).toBe(0);
    expect((await request(app).post(`/api/missions/${created.body.id}/start`)).status).toBe(202);
    const completed = await waitForTerminal(app, created.body.id);
    expect(completed.status).toBe("completed");
    expect(completed.finalOutput).toContain("$360");
    expect(completed.actualCostUsd).toBeCloseTo(0.003);
    expect(completed.events.some((event: { type: string }) => event.type === "tool.completed")).toBe(true);
  });

  it("refuses to start when the first conservative reserve does not fit", async () => {
    const { app } = setup(new ScriptedProvider([]), { preflightCostUsd: 0.002 });
    const created = await createMission(app, { budgetUsd: 0.001 });
    const response = await request(app).post(`/api/missions/${created.body.id}/start`);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("INSUFFICIENT_BUDGET");
  });

  it("stops before another paid call when remaining budget cannot cover its reserve", async () => {
    const provider = new ScriptedProvider([result({ text: '{"summary":"plan","steps":["act"]}', actualCostUsd: 0.01 })]);
    const { app } = setup(provider, { preflightCostUsd: 0.002 });
    const created = await createMission(app, { budgetUsd: 0.011 });
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("budget_exhausted");
    expect(provider.calls).toBe(1);
  });

  it("fails conservatively when provider cost is missing", async () => {
    const { app } = setup(new ScriptedProvider([result({ actualCostUsd: null })]));
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("failed");
    expect(stopped.error).toContain("did not report a cost");
    expect(stopped.events.find((event: { type: string }) => event.type === "inference.completed").cost).toBeUndefined();
  });

  it("reserves the final execution step for a tool-free answer", async () => {
    const call = result({ text: "", toolCalls: [{ id: "math-1", type: "function", function: { name: "calculate", arguments: '{"operation":"add","a":1,"b":1}' } }] });
    const provider = new ScriptedProvider([
      result({ text: '{"summary":"plan","steps":["calculate","report"]}' }),
      call,
      async (request) => {
        expect(request.tools).toEqual([]);
        expect(request.messages.some(message => message.role === "system" && message.content?.includes("final permitted execution turn"))).toBe(true);
        return result({ text: "1 + 1 = 2, based on the recorded calculator output." });
      }
    ]);
    const { app } = setup(provider, { maxSteps: 2 });
    const created = await createMission(app);
    await request(app).post("/api/missions/" + created.body.id + "/start");
    const completed = await waitForTerminal(app, created.body.id);
    expect(completed.status).toBe("completed");
    expect(completed.finalOutput).toContain("1 + 1 = 2");
    expect(provider.calls).toBe(3); // 1 planner + 2 execution turns, not an extra billed turn.
  });

  it("rejects unexpected tool requests on the final synthesis turn", async () => {
    const call = result({ text: "", toolCalls: [{ id: "loop", type: "function", function: { name: "calculate", arguments: '{"operation":"add","a":1,"b":1}' } }] });
    const provider = new ScriptedProvider([result({ text: '{"summary":"plan","steps":["loop"]}' }), call]);
    const { app } = setup(provider, { maxSteps: 1 });
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("failed");
    expect(stopped.error).toContain("Finalization returned a tool request");
  });

  it("limits research to three searches even if one response requests several", async () => {
    const call = (id: string) => ({ id, type: "function" as const, function: { name: "web_search", arguments: JSON.stringify({ query: "small business agent governance" }) } });
    const provider = new ScriptedProvider([
      result({ text: '{"summary":"market","steps":["search","report"]}' }),
      result({ text: "", toolCalls: [call("one"), call("two"), call("three")] }),
      async (inference) => {
        expect(inference.tools).toEqual([]);
        return result({ text: "Possible use cases need verification; these are not confirmed customers." });
      }
    ]);
    const config = getConfig({
      maxSteps: 2, webSearch: { apiKey: "test-search-key" },
      provider: { apiKey: "test-key", baseUrl: "https://example.invalid/api/v1", model: "mock/orbio", timeoutMs: 500, retries: 0 }
    });
    let searchRequests = 0;
    const fakeFetch = async () => { searchRequests++; return new Response(JSON.stringify({ web: { results: [{ title: "Evidence", url: "https://example.org/evidence", description: "Potential use case" }] } }), { status: 200 }); };
    const fakeSearch = new BraveWebSearch("test-search-key", fakeFetch as typeof fetch);
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider, searchProvider: fakeSearch });
    const created = await createMission(app, { objective: "Research businesses who may benefit from Auvra and list potential users", permissions: ["web.search"] });
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const completed = await waitForTerminal(app, created.body.id);
    expect(completed.status).toBe("completed");
    expect(searchRequests).toBe(3); // Includes mandatory preflight search.
    expect(completed.events.filter((e: { type: string }) => e.type === "tool.failed")).toHaveLength(1);
    expect(provider.calls).toBe(3);
  });

  it("preserves partial work instead of retrying an empty billed final response", async () => {
    const provider = new ScriptedProvider([
      result({ text: '{"summary":"calculate","steps":["calculate","report"]}' }),
      result({ text: "", toolCalls: [{ id: "math", type: "function", function: { name: "calculate", arguments: '{"operation":"add","a":1,"b":1}' } }] }),
      result({ text: "", finishReason: "length" })
    ]);
    const { app } = setup(provider, { maxSteps: 2 });
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("failed");
    expect(stopped.error).toContain("no final response");
    expect(stopped.events.some((e: { type: string }) => e.type === "tool.completed")).toBe(true);
    expect(provider.calls).toBe(3); // Never silently repeat a possibly charged response.
  });

  it("does not mark a truncated non-empty response as complete", async () => {
    const provider = new ScriptedProvider([
      result({ text: '{"summary":"finish","steps":["report"]}' }),
      result({ text: "An unfinished [source](https://example.org", finishReason: "length" })
    ]);
    const { app } = setup(provider, { maxSteps: 1 });
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("failed");
    expect(stopped.finalOutput).toBeUndefined();
    expect(stopped.error).toContain("stopped before a complete answer");
    expect(provider.calls).toBe(2);
  });

  it("gives planning and final synthesis separate output allowances", async () => {
    const provider = new ScriptedProvider([
      async (call) => { expect(call.maxOutputTokens).toBeGreaterThanOrEqual(512); return result({ text: '{"summary":"plan","steps":["write"]}' }); },
      async (call) => { expect(call.maxOutputTokens).toBeGreaterThanOrEqual(1200); expect(call.tools).toEqual([]); return result({ text: "A complete final answer." }); }
    ]);
    const { app } = setup(provider, { maxSteps: 1 });
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const done = await waitForTerminal(app, created.body.id);
    expect(done.status).toBe("completed");
    expect(done.finalOutput).toBe("A complete final answer.");
    expect(provider.calls).toBe(2);
  });

  it("normalizes structured plan steps and gives execution enough output tokens", async () => {
    const provider = new ScriptedProvider([
      result({ text: JSON.stringify({ summary: "Assess potential beneficiaries", steps: [
        { step: 1, tool: "web.search", action: "Research customer segments", purpose: "Find evidence" },
        { step: 2, action: "Separate potential from verified customers" }
      ] }) }),
      async (call) => {
        expect(call.maxOutputTokens).toBeGreaterThan(700);
        return result({ text: "Potential segments are not verified customers." });
      }
    ]);
    const { app } = setup(provider, { maxSteps: 2 });
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const finished = await waitForTerminal(app, created.body.id);
    expect(finished.status).toBe("completed");
    expect(finished.plan.steps).toEqual([
      "Research customer segments",
      "Separate potential from verified customers"
    ]);
    expect(provider.calls).toBe(2);
  });

  it("propagates cancellation and makes it durable", async () => {
    const waiting = (inference: InferenceRequest) => new Promise<InferenceResult>((resolve, reject) => {
      const timer = setTimeout(() => resolve(result()), 500);
      inference.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new ProviderError("cancelled", "CANCELLED")); }, { once: true });
    });
    const { app } = setup(new ScriptedProvider([waiting]));
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    expect((await request(app).post(`/api/missions/${created.body.id}/cancel`)).body.status).toBe("cancelled");
    expect((await request(app).get(`/api/missions/${created.body.id}`)).body.cancellationRequested).toBe(true);
  });

  it("records provider errors without exposing credentials", async () => {
    const { app } = setup(new ScriptedProvider([new ProviderError("Upstream unavailable", "PROVIDER_UNAVAILABLE")]));
    const created = await createMission(app);
    await request(app).post(`/api/missions/${created.body.id}/start`);
    const stopped = await waitForTerminal(app, created.body.id);
    expect(stopped.status).toBe("failed");
    expect(JSON.stringify(stopped)).not.toContain("test-key");
  });
});
