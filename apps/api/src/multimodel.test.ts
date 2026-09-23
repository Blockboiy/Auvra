import request from "supertest";
import { describe, expect, it } from "vitest";
import type { InferenceProvider, InferenceRequest, InferenceResult } from "./provider/types.js";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { MemoryMissionRepository } from "./repository.js";

const answer = (text: string): InferenceResult => ({ text, toolCalls: [], usage: { input: 2, output: 2, total: 4 }, actualCostUsd: 0.0001, model: "served/mock", finishReason: "stop" });

class RoutingProvider implements InferenceProvider {
  requests: InferenceRequest[] = [];
  async complete(request: InferenceRequest): Promise<InferenceResult> {
    this.requests.push(request);
    if (this.requests.length === 1) return answer('{"summary":"route","steps":["finish"]}');
    if (this.requests.length === 2) return answer("executor draft");
    return answer("synthesized final answer");
  }
}

describe("multi-model mission routing", () => {
  it("persists configured per-stage model choices and passes them to Orbio requests", async () => {
    const provider = new RoutingProvider();
    const config = getConfig({ maxSteps: 1, provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/a", models: ["model/b", "model/c"], timeoutMs: 500, retries: 0 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/missions").send({ objective: "Prepare a bounded research summary", budgetUsd: 0.05, permissions: [], modelRoute: { planning: "model/a", execution: "model/b", final: "model/c" } });
    expect(created.status).toBe(201);
    expect(created.body.modelRoute).toEqual({ planning: "model/a", execution: "model/b", final: "model/c" });
    await request(app).post(`/api/missions/${created.body.id}/start`);
    for (let i=0;i<50;i++){ const current=await request(app).get(`/api/missions/${created.body.id}`); if (["completed","failed","budget_exhausted"].includes(current.body.status)) break; await new Promise(r=>setTimeout(r,10)); }
    expect(provider.requests[0]?.preferredModel).toBe("model/a");
    expect(provider.requests[1]?.preferredModel).toBe("model/b");
    expect(provider.requests[2]?.preferredModel).toBe("model/c");
    expect(provider.requests[2]?.tools).toEqual([]);
  });

  it("rejects a model outside the configured Orbio pool", async () => {
    const provider = new RoutingProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/a", models: ["model/b"], timeoutMs: 500, retries: 0 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const response = await request(app).post("/api/missions").send({ objective: "Prepare a bounded research summary", budgetUsd: 0.05, permissions: [], modelRoute: { planning: "model/not-configured" } });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("MODEL_NOT_CONFIGURED");
  });
});
