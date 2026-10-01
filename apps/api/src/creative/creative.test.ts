import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreativePlan, CreativeProject, VideoGeneration, VideoGenerationStatus } from "@auvra/shared";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { getConfig } from "../config.js";
import type { InferenceProvider } from "../provider/types.js";
import { quoteModel, routeShot, videoModelRegistry } from "./model-registry.js";
import { MemoryCreativeRepository } from "./repository.js";
import { CreativeService, planFingerprint } from "./service.js";
import { parseCreativePlan } from "./validation.js";
import { OrbioVideoProvider, type SubmitVideoRequest, type VideoJobResult, type VideoProvider } from "./video-provider.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const inference: InferenceProvider = { complete: async () => { throw new Error("Inference intentionally unavailable in unit tests"); } };
class MockVideoProvider implements VideoProvider {
  submissions: SubmitVideoRequest[] = []; polls: string[] = []; nextStatus: VideoGenerationStatus = "in_progress"; usageCostUsd: number | undefined;
  async submitVideo(value: SubmitVideoRequest) { this.submissions.push(value); return { jobId: `job_${this.submissions.length}`, status: "pending" as const }; }
  async getVideoJob(jobId: string): Promise<VideoJobResult> { this.polls.push(jobId); return { id: jobId, status: this.nextStatus, outputs: 1, ...(this.usageCostUsd === undefined ? {} : { usageCostUsd: this.usageCostUsd }) }; }
  async downloadVideo() { return new Response("video", { status: 200 }); }
}

const validPlan = (values: Partial<CreativePlan> = {}): CreativePlan => ({
  version: 1, conceptTitle: "System into motion", conceptSummary: "Reimagined product evidence", openingHook: "Operate with clarity", narrativeArc: "Hook, proof, action",
  brandSystem: { primaryColor: "#6D35F7", accentColors: ["#9B7CFF"], backgroundPreference: "dark", typographyDirection: "Geometric", cornerLanguage: "Soft", visualKeywords: ["precise"], prohibitedMutations: ["Preserve logo"] }, durationSeconds: 15, aspectRatio: "16:9",
  shots: [{ id: "generated", order: 1, purpose: "Atmospheric opening", durationSeconds: 4, exactCopy: [], visualConcept: "Dimensional field", visualMode: "generative_video", assetRefs: [], motionDirection: "Camera drift", transitionIn: "Fade", transitionOut: "Mask", generativePrompt: "Abstract violet material folding through light; no text or logos", recommendedCapability: "cinematic movement", audioCue: "Whoosh", brandConstraints: ["No logos"], generativeReason: "Complex dimensional camera motion adds value", allowGenerativeVideo: true }, { id: "exact", order: 2, purpose: "Exact product proof", durationSeconds: 11, exactCopy: ["$0.042"], visualConcept: "Metric counter", visualMode: "motion_graphic", assetRefs: [], motionDirection: "Counter build", transitionIn: "Mask", transitionOut: "Hold", brandConstraints: ["Preserve metric"], allowGenerativeVideo: false }],
  audioPlan: { musicBed: "Pulse", foley: ["impact"], uiCues: ["tick"], transitions: ["whoosh"] }, closingCTA: "Start now", qualityRisks: ["Verify metrics"], createdAt: "2026-10-01T00:00:00.000Z", ...values
});

async function setup(enabled = false, limits: Partial<ReturnType<typeof getConfig>["creative"]> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "auvra-creative-")); directories.push(directory);
  const base = getConfig(); const repository = new MemoryCreativeRepository(); const video = new MockVideoProvider();
  const config = getConfig({ creative: { ...base.creative, dataFile: join(directory, "creative.json"), assetDir: join(directory, "assets"), videoGenerationEnabled: enabled, pollIntervalMs: 60_000, ...limits }, provider: { apiKey: "test", baseUrl: "https://orbio.invalid/api/v1", model: "test/chat", timeoutMs: 500, retries: 0 } });
  const created = createApp(config, { creativeRepository: repository, provider: inference, videoProvider: video });
  const response = await request(created.app).post("/api/creative/projects").send({ name: "Launch", brief: { objective: "Launch the product", audience: "Operators", keyMessage: "Move with confidence", durationSeconds: 15, aspectRatio: "16:9", toneNotes: "Premium", qualityTarget: "standard" } });
  return { ...created, config, repository, video, project: response.body as CreativeProject, directory };
}

describe("video model registry and quote safety", () => {
  it("marks every Seedance route unavailable through Orbio", () => { const seedance = videoModelRegistry.filter((model) => model.id.includes("seedance")); expect(seedance).toHaveLength(3); expect(seedance.every((model) => !model.enabled && model.reasonUnavailable?.includes("pricing_unavailable"))).toBe(true); });
  it("never interprets generic model-metadata zero pricing as free video", () => { const genericModelsPayload = { pricing: { prompt: "0", completion: "0" } }; expect(genericModelsPayload.pricing.prompt).toBe("0"); expect(quoteModel("unknown/from-generic-models", { durationSeconds: 4, aspectRatio: "16:9", resolution: "720p", audio: false })).toBeNull(); });
  it("quotes Veo Lite from the trusted registry and applies the configured reserve", async () => { expect(quoteModel("google/veo-3.1-lite", { durationSeconds: 4, aspectRatio: "16:9", resolution: "720p", audio: false })).toBe(0.12); const { app, project } = await setup(); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: validPlan() }); const quote = await request(app).post(`/api/creative/projects/${project.id}/quote`).send({}); expect(quote.body.estimatedProviderCostUsd).toBe(0.12); expect(quote.body.reservedCostUsd).toBe(0.138); expect(quote.body.items.find((item: { shotId: string }) => item.shotId === "exact").estimatedProviderCostUsd).toBe(0); });
  it("refuses approval when no trusted model/configuration can be quoted", async () => { const { app, project } = await setup(); const plan = validPlan({ shots: [{ ...validPlan().shots[0]!, durationSeconds: 1 }, { ...validPlan().shots[1]!, durationSeconds: 14 }] }); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan }); const quote = await request(app).post(`/api/creative/projects/${project.id}/quote`).send({}); expect(quote.body.items[0].quoteUnavailable).toBe(true); expect((await request(app).post(`/api/creative/projects/${project.id}/quotes/${quote.body.id}/approve`).send({})).body.error.code).toBe("QUOTE_UNAVAILABLE"); });
  it("routes deterministic scenes to zero-provider-cost composition", () => { expect(routeShot(validPlan().shots[1]!, "16:9", "premium")).toEqual({ kind: "deterministic" }); });
});

describe("plan fingerprint, approval, and generation gates", () => {
  it("rejects malformed director JSON", () => { expect(parseCreativePlan({ conceptTitle: "missing everything" })).toBeUndefined(); });
  it("invalidates a quote when the plan changes", async () => { const { app, project } = await setup(); const plan = validPlan(); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan }); const quote = (await request(app).post(`/api/creative/projects/${project.id}/quote`).send({})).body; await request(app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: { ...plan, conceptTitle: "Changed" } }); const generate = await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id }); expect(generate.status).toBe(422); expect(generate.body.error.code).toBe("QUOTE_APPROVAL_REQUIRED"); });
  it("requires explicit approval and still refuses spend while the feature flag is false", async () => { const { app, project } = await setup(false); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: validPlan() }); const quote = (await request(app).post(`/api/creative/projects/${project.id}/quote`).send({})).body; expect((await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id })).body.error.code).toBe("QUOTE_APPROVAL_REQUIRED"); await request(app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); const disabled = await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id }); expect(disabled.status).toBe(503); expect(disabled.body.error.code).toBe("VIDEO_GENERATION_DISABLED"); });
  it("uses a stable plan fingerprint", () => { const plan = validPlan(); expect(planFingerprint(plan)).toBe(planFingerprint(structuredClone(plan))); expect(planFingerprint({ ...plan, closingCTA: "Different" })).not.toBe(planFingerprint(plan)); });
});

describe("paid job persistence and restart-safe polling", () => {
  async function generated() { const state = await setup(true); await request(state.app).post(`/api/creative/projects/${state.project.id}/direct`).send({ plan: validPlan() }); const quote = (await request(state.app).post(`/api/creative/projects/${state.project.id}/quote`).send({})).body; await request(state.app).post(`/api/creative/projects/${state.project.id}/quotes/${quote.id}/approve`).send({}); const response = await request(state.app).post(`/api/creative/projects/${state.project.id}/generate`).send({ quoteId: quote.id }); return { ...state, generationId: response.body.generationIds[0] as string }; }
  it("persists the upstream job ID immediately and polls that same job without resubmitting", async () => { const state = await generated(); const saved = await state.creative.getGeneration(state.project.id, state.generationId); expect(saved.upstreamJobId).toBe("job_1"); await state.creative.pollGeneration(saved); await state.creative.pollGeneration(await state.creative.getGeneration(state.project.id, state.generationId)); expect(state.video.submissions).toHaveLength(1); expect(state.video.polls).toEqual(["job_1", "job_1"]); state.creative.stop(); });
  it("restart recovery discovers and polls the persisted upstream job", async () => { const state = await generated(); const replacement = new CreativeService(state.repository, state.config, inference, state.video); await replacement.pollOnce(); expect(state.video.polls).toEqual(["job_1"]); expect(state.video.submissions).toHaveLength(1); state.creative.stop(); replacement.stop(); });
  it.each(["failed", "cancelled", "expired"] as VideoGenerationStatus[])("stops polling terminal %s jobs", async (status) => { const state = await generated(); state.video.nextStatus = status; await state.creative.pollOnce(); await state.creative.pollOnce(); expect(state.video.polls).toHaveLength(1); state.creative.stop(); });
  it("records actual usage.cost when present and marks missing cost unverified rather than zero", async () => { const verified = await generated(); verified.video.nextStatus = "completed"; verified.video.usageCostUsd = 0.101; await verified.creative.pollOnce(); expect((await verified.creative.getGeneration(verified.project.id, verified.generationId)).actualProviderCostUsd).toBe(0.101); verified.creative.stop(); const missing = await generated(); missing.video.nextStatus = "completed"; await missing.creative.pollOnce(); const record = await missing.creative.getGeneration(missing.project.id, missing.generationId); expect(record.costStatus).toBe("unverified"); expect(record.actualProviderCostUsd).toBeUndefined(); expect(record.reservedCostUsd).toBe(0.138); missing.creative.stop(); });
});

describe("provider URL construction", () => {
  it("ignores arbitrary provider URLs and reconstructs polling and content requests", async () => { const urls: string[] = []; const provider = new OrbioVideoProvider({ apiKey: "secret", baseUrl: "https://api.orbio.test/api/v1", timeoutMs: 1000 }, (async (input) => { urls.push(String(input)); return urls.length === 1 ? new Response(JSON.stringify({ id: "safe_job", status: "in_progress", polling_url: "https://evil.test/steal" }), { status: 200 }) : new Response("video", { status: 200 }); }) as typeof fetch); await provider.getVideoJob("safe_job"); await provider.downloadVideo("safe_job", 0); expect(urls).toEqual(["https://api.orbio.test/api/v1/videos/safe_job", "https://api.orbio.test/api/v1/videos/safe_job/content?index=0"]); await expect(provider.getVideoJob("https://evil.test/job")).rejects.toMatchObject({ code: "INVALID_JOB_ID" }); });
});

describe("asset upload limits and path safety", () => {
  it("stores a traversal-like filename under a generated safe ID", async () => { const { app, project, config } = await setup(); const response = await request(app).post(`/api/creative/projects/${project.id}/assets`).field("role", "logo").attach("assets", Buffer.from("png"), { filename: "../escape.png", contentType: "image/png" }); expect(response.status).toBe(201); const files = await readdir(config.creative.assetDir); expect(files).toHaveLength(1); expect(files[0]).toMatch(/^[0-9a-f-]+\.png$/); expect(files[0]).not.toContain("escape"); });
  it("rejects unsupported MIME types and enforces file size limits", async () => { const unsupported = await setup(); expect((await request(unsupported.app).post(`/api/creative/projects/${unsupported.project.id}/assets`).attach("assets", Buffer.from("text"), { filename: "x.txt", contentType: "text/plain" })).status).toBe(415); const limited = await setup(false, { maxAssetBytes: 3 }); const tooLarge = await request(limited.app).post(`/api/creative/projects/${limited.project.id}/assets`).attach("assets", Buffer.from("1234"), { filename: "x.png", contentType: "image/png" }); expect(tooLarge.status).toBe(413); expect(tooLarge.body.error.code).toBe("ASSET_LIMIT_EXCEEDED"); });
});
