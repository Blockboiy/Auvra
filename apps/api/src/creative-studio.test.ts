import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { decodeCaptionOverlay, displayCaption, parseCreativeStoryboard } from "./creative-studio.js";
import type { InferenceProvider, InferenceResult } from "./provider/types.js";
import { MemoryMissionRepository } from "./repository.js";

const sample = '{"headline":"Fresh every day","voiceoverDraft":"Discover our fruit drink today.","scenes":[{"caption":"Fresh flavor","direction":"Gentle pan"},{"caption":"Made for your day","direction":"Subtle crop"},{"caption":"Order yours today","direction":"Slow zoom"}]}';
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/NwAAAABJRU5ErkJggg==";
let directory: string;
let oldEnabled: string | undefined;
let oldDir: string | undefined;
let oldFfmpeg: string | undefined;
class MockProvider implements InferenceProvider {
  calls = 0;
  constructor(private readonly finishReason = "stop") {}
  async complete(): Promise<InferenceResult> {
    this.calls += 1;
    return { text: sample, toolCalls: [], usage: { input: 120, output: 120, total: 240 }, actualCostUsd: 0.0015, model: "model/test", finishReason: this.finishReason };
  }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "auvra-creative-test-"));
  oldEnabled = process.env.AUVRA_CREATIVE_ENABLED;
  oldDir = process.env.AUVRA_CREATIVE_DIR;
  oldFfmpeg = process.env.FFMPEG_PATH;
  process.env.AUVRA_CREATIVE_ENABLED = "true";
  process.env.AUVRA_CREATIVE_DIR = directory;
});
afterEach(async () => {
  if (oldEnabled === undefined) delete process.env.AUVRA_CREATIVE_ENABLED; else process.env.AUVRA_CREATIVE_ENABLED = oldEnabled;
  if (oldDir === undefined) delete process.env.AUVRA_CREATIVE_DIR; else process.env.AUVRA_CREATIVE_DIR = oldDir;
  if (oldFfmpeg === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = oldFfmpeg;
  await rm(directory, { recursive: true, force: true });
});

describe("Creative Studio", () => {
  it("validates exactly three complete scenes", () => {
    expect(parseCreativeStoryboard(sample).scenes).toHaveLength(3);
    expect(() => parseCreativeStoryboard('{"scenes":[]}')).toThrow("three-scene");
    expect(displayCaption("A tasty fruit drink made for your day", "9:16").split("\n").length).toBeLessThanOrEqual(2);
  });
  it("rejects missing and incorrectly-sized caption PNG overlays without rendering", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "An overview of business metrics and costs.", aspectRatio: "9:16", inferenceBudgetUsd: 0.2, imageDataUrl: pixel });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const missing = await request(app).post(`/api/creative/${id}/render`).send({});
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("CAPTIONS_REQUIRED");
    const invalid = await request(app).post(`/api/creative/${id}/render`).send({ captionOverlays: [pixel, pixel, pixel] });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("INVALID_CAPTION_OVERLAY");
    expect((await request(app).get(`/api/creative/${id}`)).body.status).toBe("storyboard_ready");
    expect(provider.calls).toBe(1);
    expect(() => decodeCaptionOverlay(pixel, "16:9")).toThrow("wrong size");
  });
  it("generates a budget-checked storyboard and does not render before approval", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const input = { productName: "Pineapple juice", audience: "Local shoppers", brief: "A fresh pineapple drink for people who enjoy fruit flavors.", aspectRatio: "9:16", inferenceBudgetUsd: 0.1, imageDataUrl: pixel };
    const created = await request(app).post("/api/creative/storyboard").send(input);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("storyboard_ready");
    expect(created.body.inferenceCostUsd).toBe(0.0015);
    expect(created.body.storyboard.scenes).toHaveLength(3);
    expect(created.body.storyboardSource).toBe("ai");
    expect(provider.calls).toBe(1);
    const id = created.body.id as string;
    expect((await request(app).get(`/api/creative/${id}/video`)).status).toBe(409);
    const edited = await request(app).patch(`/api/creative/${id}/storyboard`).send({ scenes: ["Hook", "Benefit", "Order today"], imageIndexes: [0, 0, 0], secondImageIndexes: [null, null, null] });
    expect(edited.status).toBe(200);
    expect(edited.body.storyboard.scenes[0].caption).toBe("Hook");
    expect(provider.calls).toBe(1);
  });
  it("stores multiple photos and assigns a different photo to each scene", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "Show three feature screenshots and invite visitors to try it.", aspectRatio: "16:9", inferenceBudgetUsd: 0.2, imageDataUrls: [pixel, pixel, pixel] });
    expect(created.status).toBe(201);
    expect(created.body.imageNames).toHaveLength(3);
    expect(created.body.storyboard.scenes.map((scene: { imageIndex: number }) => scene.imageIndex)).toEqual([0, 1, 2]);
    const id = created.body.id as string;
    const updated = await request(app).patch(`/api/creative/${id}/storyboard`).send({ scenes: ["Problem", "Solution", "Try it"], imageIndexes: [2, 0, 1], secondImageIndexes: [null, null, null] });
    expect(updated.status).toBe(200);
    expect(updated.body.storyboard.scenes.map((scene: { imageIndex: number }) => scene.imageIndex)).toEqual([2, 0, 1]);
    expect((await request(app).get(`/api/creative/${id}/images/2`)).status).toBe(200);
    expect((await request(app).get(`/api/creative/${id}/images/3`)).status).toBe(404);
    expect(provider.calls).toBe(1);
  });
  it("automatically distributes six uploaded photos across two shots in each scene", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "Show a six-shot overview of the dashboard and investigation flow.", aspectRatio: "16:9", durationSeconds: 30, inferenceBudgetUsd: 0.2, imageDataUrls: Array(6).fill(pixel) });
    expect(created.status).toBe(201);
    expect(created.body.durationSeconds).toBe(30);
    expect(created.body.storyboard.scenes.map((scene: { imageIndex: number }) => scene.imageIndex)).toEqual([0, 1, 2]);
    expect(created.body.storyboard.scenes.map((scene: { secondImageIndex: number }) => scene.secondImageIndex)).toEqual([3, 4, 5]);
    expect(provider.calls).toBe(1);
  });
  it("preserves provider-reported charges and offers a clearly labelled manual outline on length stops", async () => {
    const provider = new MockProvider("length");
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "Show how businesses can inspect their revenue and find profit leaks.", aspectRatio: "9:16", inferenceBudgetUsd: 0.2, imageDataUrls: [pixel, pixel] });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("storyboard_ready");
    expect(created.body.storyboardSource).toBe("manual_fallback");
    expect(created.body.error).toMatch(/not written by AI/);
    expect(created.body.inferenceCostUsd).toBe(0.0015);
    expect(provider.calls).toBe(1);
  });
  it("recovers a previously failed v1 project without another paid request", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "Make a concise launch video for our analytics product.", aspectRatio: "9:16", inferenceBudgetUsd: 0.2, imageDataUrl: pixel });
    expect(created.status).toBe(201);
    const filename = join(directory, created.body.id, "job.json");
    const saved = JSON.parse(await readFile(filename, "utf8"));
    saved.status = "failed"; saved.storyboard = null; saved.error = "Orbio did not finish the storyboard.";
    await writeFile(filename, JSON.stringify(saved));
    const recovered = await request(app).post(`/api/creative/${created.body.id}/manual-storyboard`);
    expect(recovered.status).toBe(200);
    expect(recovered.body.storyboardSource).toBe("manual_fallback");
    expect(recovered.body.imageNames).toHaveLength(1);
    expect(provider.calls).toBe(1);
  });
  it("rejects more than six images without calling Orbio", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const created = await request(app).post("/api/creative/storyboard").send({ productName: "LeakScout", audience: "Business owners", brief: "A product overview with demo screenshots.", aspectRatio: "9:16", inferenceBudgetUsd: 0.2, imageDataUrls: Array(7).fill(pixel) });
    expect(created.status).toBe(422);
    expect(provider.calls).toBe(0);
  });
  it("rejects non-image data without calling a model", async () => {
    const provider = new MockProvider();
    const config = getConfig({ provider: { apiKey: "key", baseUrl: "https://example.invalid", model: "model/test", models: [], retries: 0, timeoutMs: 1_000 } });
    const { app } = createApp(config, { repository: new MemoryMissionRepository(), provider });
    const invalid = await request(app).post("/api/creative/storyboard").send({ productName: "Drink", audience: "Shoppers", brief: "A product advertising concept with a factual description.", aspectRatio: "9:16", inferenceBudgetUsd: 0.1, imageDataUrl: "data:image/png;base64,ZXZpbA==" });
    expect(invalid.status).toBe(422);
    expect(provider.calls).toBe(0);
  });
});
