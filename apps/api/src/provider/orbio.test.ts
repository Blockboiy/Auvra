import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbioProvider, classifyProviderError, parseOrbioResponse, parseProviderCost } from "./orbio.js";

const provider = (retries = 1) => new OrbioProvider({
  apiKey: "test-secret",
  baseUrl: "https://api.orbio.so/api/v1",
  model: "google/gemini-3.8-flash",
  timeoutMs: 1_000,
  retries
});

afterEach(() => vi.unstubAllGlobals());

describe("Orbio response parsing", () => {
  it("extracts text, usage, and provider-reported cost", () => {
    const result = parseOrbioResponse({
      model: "google/gemini-3.8-flash",
      choices: [{ finish_reason: "stop", message: { content: "done" } }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16, cost: 0.00042 }
    }, "fallback");
    expect(result.text).toBe("done");
    expect(result.usage).toEqual({ input: 12, output: 4, total: 16 });
    expect(result.actualCostUsd).toBe(0.00042);
  });

  it("parses compatible nested cost formats and preserves zero cost", () => {
    expect(parseProviderCost({ usage: { cost_details: { total_cost: "0.0012" } } })).toBe(0.0012);
    expect(parseProviderCost({ cost: 0 })).toBe(0);
  });

  it("returns null rather than fabricating missing cost", () => {
    expect(parseProviderCost({ usage: { total_tokens: 5 } })).toBeNull();
  });

  it("extracts OpenAI-compatible tool calls", () => {
    const result = parseOrbioResponse({
      choices: [{ message: { content: null, tool_calls: [{ id: "call-1", function: { name: "calculate", arguments: "{\"a\":2}" } }] } }],
      usage: { input_tokens: 3, output_tokens: 2, cost: 0.0001 }
    }, "model");
    expect(result.toolCalls[0]?.function.name).toBe("calculate");
  });

  it("rejects malformed tool calls instead of executing unvalidated arguments", () => {
    expect(() => parseOrbioResponse({
      choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "calculate", arguments: { a: 2 } } }] } }],
      usage: { cost: 0.0001 }
    }, "model")).toThrow("malformed tool call");
  });

  it("reproduces and classifies the current model routing failure without retrying it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "No provider is currently serving this model. Check the model id, or try another." }
    }), { status: 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider(2).complete({
      messages: [{ role: "user", content: "plan" }],
      maxOutputTokens: 32
    })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the compatible minimal Chat Completions shape when no tools are requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "google/gemini-3.8-flash",
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3, cost: 0.00001 }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await provider(0).complete({ messages: [{ role: "user", content: "hi" }], maxOutputTokens: 8, temperature: 0 });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      model: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 8
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("temperature");
  });

  it("sends OpenAI-compatible client-side tools only when supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "one", type: "function", function: { name: "calculate", arguments: "{\"operation\":\"add\",\"a\":1,\"b\":2}" } }] } }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6, cost: 0.00002 }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider(0).complete({
      messages: [{ role: "user", content: "add" }],
      maxOutputTokens: 16,
      tools: [{ type: "function", function: { name: "calculate", description: "Add", parameters: { type: "object" } } }]
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.tool_choice).toBe("auto");
    expect(body.tools[0].function.name).toBe("calculate");
    expect(result.toolCalls[0]?.function.name).toBe("calculate");
  });

  it("falls back only on a definitive unavailable-model response and records the served model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "No provider is currently serving this model." } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash",
        choices: [{ finish_reason: "stop", message: { content: "ready" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, cost: 0.00004 }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const instance = new OrbioProvider({
      apiKey: "test-secret", baseUrl: "https://api.orbio.so/api/v1",
      model: "google/gemini-3.8-flash", models: ["deepseek/deepseek-v4.1-flash"],
      timeoutMs: 1_000, retries: 0
    });
    const result = await instance.complete({ messages: [{ role: "user", content: "test" }], maxOutputTokens: 16 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.model).toBe("deepseek/deepseek-v4.1-flash");
    expect(result.attemptedModels).toEqual(["google/gemini-3.8-flash", "deepseek/deepseek-v4.1-flash"]);
    expect(result.actualCostUsd).toBe(0.00004);
  });

  it("does not try a fallback after a timeout or uncertain upstream billing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    vi.stubGlobal("fetch", fetchMock);
    const instance = new OrbioProvider({
      apiKey: "test-secret", baseUrl: "https://api.orbio.so/api/v1",
      model: "google/gemini-3.8-flash", models: ["deepseek/deepseek-v4.1-flash"],
      timeoutMs: 1_000, retries: 0
    });
    await expect(instance.complete({ messages: [{ role: "user", content: "test" }], maxOutputTokens: 16 }))
      .rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes authentication, credits, tools, rate limits, and gateway failures", () => {
    expect(classifyProviderError(401, {}).code).toBe("AUTHENTICATION_ERROR");
    expect(classifyProviderError(402, {}).code).toBe("INSUFFICIENT_CREDITS");
    expect(classifyProviderError(400, { error: { message: "tools are unsupported" } }).code).toBe("TOOL_INCOMPATIBLE");
    expect(classifyProviderError(429, {}).code).toBe("RATE_LIMITED");
    expect(classifyProviderError(500, {}).code).toBe("GATEWAY_ERROR");
  });

  it("checks gateway metadata without performing inference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      id: "google/gemini-3.8-flash",
      supported_parameters: ["tools", "tool_choice"]
    }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const diagnostic = await provider(0).diagnose();
    expect(diagnostic.overall).toBe("ready");
    expect(diagnostic.checks.model.status).toBe("pass");
    expect(diagnostic.checks.toolCalling.status).toBe("pass");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.orbio.so/api/v1/models");
  });
});
