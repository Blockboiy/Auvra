import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreativePlan, CreativeProject, CreativeQuote, VideoGeneration, VideoGenerationStatus } from "@auvra/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { getConfig } from "../config.js";
import type { InferenceProvider } from "../provider/types.js";
import { quoteModel, routeShot, videoModelRegistry } from "./model-registry.js";
import { MemoryCreativeRepository } from "./repository.js";
import { CreativeService, planFingerprint } from "./service.js";
import { parseCreativePlan } from "./validation.js";
import { OrbioVideoProvider, type SubmitVideoRequest, type VideoJobResult, type VideoProvider } from "./video-provider.js";
import type { FinishingRenderInput, FinishingRenderer } from "./finishing-renderer.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

const inference: InferenceProvider = { complete: async () => { throw new Error("Inference intentionally unavailable in unit tests"); } };
class MockVideoProvider implements VideoProvider {
  submissions: SubmitVideoRequest[] = []; polls: string[] = []; nextStatus: VideoGenerationStatus = "in_progress"; statuses = new Map<string, VideoGenerationStatus>(); usageCostUsd: number | undefined;
  async submitVideo(value: SubmitVideoRequest) { this.submissions.push(value); return { jobId: `job_${this.submissions.length}`, status: "pending" as const }; }
  async getVideoJob(jobId: string): Promise<VideoJobResult> { this.polls.push(jobId); return { id: jobId, status: this.statuses.get(jobId) ?? this.nextStatus, outputs: 1, ...(this.usageCostUsd === undefined ? {} : { usageCostUsd: this.usageCostUsd }) }; }
  async downloadVideo() { return new Response("video", { status: 200 }); }
}
class MockFinishingRenderer implements FinishingRenderer {
  calls: FinishingRenderInput[] = [];
  async render(value: FinishingRenderInput) { this.calls.push(value); return Buffer.from("final-video"); }
}

const validPlan = (values: Partial<CreativePlan> = {}): CreativePlan => ({
  version: 1, conceptTitle: "System into motion", conceptSummary: "Reimagined product evidence", openingHook: "Operate with clarity", narrativeArc: "Hook, proof, action",
  brandSystem: { primaryColor: "#6D35F7", accentColors: ["#9B7CFF"], backgroundPreference: "dark", typographyDirection: "Geometric", cornerLanguage: "Soft", visualKeywords: ["precise"], prohibitedMutations: ["Preserve logo"] }, durationSeconds: 15, aspectRatio: "16:9",
  shots: [{ id: "generated", order: 1, purpose: "Atmospheric opening", durationSeconds: 4, exactCopy: [], visualConcept: "Dimensional field", visualMode: "generative_video", assetRefs: [], motionDirection: "Camera drift", transitionIn: "Fade", transitionOut: "Mask", generativePrompt: "Abstract violet material folding through light; no text or logos", recommendedCapability: "cinematic movement", audioCue: "Whoosh", brandConstraints: ["No logos"], generativeReason: "Complex dimensional camera motion adds value", allowGenerativeVideo: true }, { id: "exact", order: 2, purpose: "Exact product proof", durationSeconds: 11, exactCopy: ["$0.042"], visualConcept: "Metric counter", visualMode: "motion_graphic", assetRefs: [], motionDirection: "Counter build", transitionIn: "Mask", transitionOut: "Hold", brandConstraints: ["Preserve metric"], allowGenerativeVideo: false }],
  audioPlan: { musicBed: "Pulse", foley: ["impact"], uiCues: ["tick"], transitions: ["whoosh"] }, closingCTA: "Start now", qualityRisks: ["Verify metrics"], createdAt: "2026-10-01T00:00:00.000Z", ...values
});

async function setup(enabled = false, limits: Partial<ReturnType<typeof getConfig>["creative"]> = {}, inferenceProvider: InferenceProvider = inference) {
  const directory = await mkdtemp(join(tmpdir(), "auvra-creative-")); directories.push(directory);
  const base = getConfig(); const repository = new MemoryCreativeRepository(); const video = new MockVideoProvider(); const finishingRenderer = new MockFinishingRenderer();
  const config = getConfig({ creative: { ...base.creative, dataFile: join(directory, "creative.json"), assetDir: join(directory, "assets"), videoGenerationEnabled: enabled, pollIntervalMs: 60_000, ...limits }, provider: { apiKey: "test", baseUrl: "https://orbio.invalid/api/v1", model: "test/chat", timeoutMs: 500, retries: 0 } });
  const created = createApp(config, { creativeRepository: repository, provider: inferenceProvider, videoProvider: video, finishingRenderer });
  const response = await request(created.app).post("/api/creative/projects").send({ name: "Launch", brief: { objective: "Launch the product", audience: "Operators", keyMessage: "Move with confidence", durationSeconds: 15, aspectRatio: "16:9", toneNotes: "Premium", qualityTarget: "standard" } });
  return { ...created, config, repository, video, finishingRenderer, project: response.body as CreativeProject, directory };
}

describe("video model registry and quote safety", () => {
  it("marks every Seedance route unavailable through Orbio", () => { const seedance = videoModelRegistry.filter((model) => model.id.includes("seedance")); expect(seedance).toHaveLength(3); expect(seedance.every((model) => !model.enabled && model.reasonUnavailable?.includes("pricing_unavailable"))).toBe(true); });
  it("never interprets generic model-metadata zero pricing as free video", () => { const genericModelsPayload = { pricing: { prompt: "0", completion: "0" } }; expect(genericModelsPayload.pricing.prompt).toBe("0"); expect(quoteModel("unknown/from-generic-models", { durationSeconds: 4, aspectRatio: "16:9", resolution: "720p", audio: false })).toBeNull(); });
  it("quotes Veo Lite from the trusted registry and applies the configured reserve", async () => { expect(quoteModel("google/veo-3.1-lite", { durationSeconds: 4, aspectRatio: "16:9", resolution: "720p", audio: false })).toBe(0.12); const { app, project } = await setup(); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: validPlan() }); const quote = await request(app).post(`/api/creative/projects/${project.id}/quote`).send({}); expect(quote.body.estimatedProviderCostUsd).toBe(0.12); expect(quote.body.reservedCostUsd).toBe(0.138); expect(quote.body.items.find((item: { shotId: string }) => item.shotId === "exact").estimatedProviderCostUsd).toBe(0); });
  it("returns a clear domain error when no trusted model/configuration can be quoted", async () => { const { app, project } = await setup(); const plan = validPlan({ shots: [{ ...validPlan().shots[0]!, durationSeconds: 1 }, { ...validPlan().shots[1]!, durationSeconds: 14 }] }); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan }); const quote = await request(app).post(`/api/creative/projects/${project.id}/quote`).send({}); expect(quote.status).toBe(422); expect(quote.body.error.code).toBe("VIDEO_QUOTE_UNAVAILABLE"); expect(quote.body.error.message).toContain("No enabled model has a trusted price"); expect(quote.body.error.details.shots).toEqual([{ shotId: "generated", reason: "No enabled model has a trusted price and compatible duration/aspect ratio." }]); expect((await request(app).get(`/api/creative/projects/${project.id}`)).body.quotes).toHaveLength(0); });
  it("routes deterministic scenes to zero-provider-cost composition", () => { expect(routeShot(validPlan().shots[1]!, "16:9", "premium")).toEqual({ kind: "deterministic" }); });
});

describe("plan fingerprint, approval, and generation gates", () => {
  it("passes the parsed runtime flag through createApp and CreativeService", async () => {
    const state = await setup(true);
    expect(state.config.creative.videoGenerationEnabled).toBe(true);
    expect(state.creative.models().generationEnabled).toBe(true);
    state.creative.stop();
  });
  it("rejects malformed director JSON", () => { expect(parseCreativePlan({ conceptTitle: "missing everything" })).toBeUndefined(); });
  it("invalidates a quote when a paid generative prompt changes", async () => { const { app, project } = await setup(); const plan = validPlan(); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan }); const quote = (await request(app).post(`/api/creative/projects/${project.id}/quote`).send({})).body; await request(app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: { ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, generativePrompt: "A materially different paid scene" } : shot) } }); const generate = await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id }); expect(generate.status).toBe(422); expect(generate.body.error.code).toBe("QUOTE_APPROVAL_REQUIRED"); });
  it("requires explicit approval and still refuses spend while the feature flag is false", async () => { const { app, project } = await setup(false); await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: validPlan() }); const quote = (await request(app).post(`/api/creative/projects/${project.id}/quote`).send({})).body; expect((await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id })).body.error.code).toBe("QUOTE_APPROVAL_REQUIRED"); await request(app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); const disabled = await request(app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id }); expect(disabled.status).toBe(503); expect(disabled.body.error.code).toBe("VIDEO_GENERATION_DISABLED"); });
  it.each([
    { enabled: true, expectedStatus: 202, expectedCode: undefined, expectedSubmissions: 1 },
    { enabled: false, expectedStatus: 503, expectedCode: "VIDEO_GENERATION_DISABLED", expectedSubmissions: 0 }
  ])("exercises the browser generate endpoint with runtime flag $enabled", async ({ enabled, expectedStatus, expectedCode, expectedSubmissions }) => {
    const previous = process.env.AUVRA_VIDEO_GENERATION_ENABLED;
    process.env.AUVRA_VIDEO_GENERATION_ENABLED = String(enabled);
    try {
      const directory = await mkdtemp(join(tmpdir(), "auvra-creative-http-")); directories.push(directory);
      const repository = new MemoryCreativeRepository();
      const video = new MockVideoProvider();
      const base = getConfig();
      const config = getConfig({
        creative: { ...base.creative, dataFile: join(directory, "creative.json"), assetDir: join(directory, "assets"), pollIntervalMs: 60_000 },
        provider: { apiKey: "test", baseUrl: "https://orbio.invalid/api/v1", model: "test/chat", timeoutMs: 500, retries: 0 }
      });
      expect(config.creative.videoGenerationEnabled).toBe(enabled);
      const created = createApp(config, { creativeRepository: repository, provider: inference, videoProvider: video });
      const generate = vi.spyOn(created.creative, "generate");
      const project = (await request(created.app).post("/api/creative/projects").send({ name: "HTTP path", brief: { objective: "Launch", audience: "Operators", keyMessage: "Move", durationSeconds: 15, aspectRatio: "16:9", toneNotes: "Premium", qualityTarget: "standard" } })).body as CreativeProject;
      await request(created.app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: validPlan() });
      const quote = (await request(created.app).post(`/api/creative/projects/${project.id}/quote`).send({})).body;
      await request(created.app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({});

      const response = await request(created.app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id });

      expect(response.status).toBe(expectedStatus);
      expect(response.body.error?.code).toBe(expectedCode);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(generate).toHaveBeenCalledWith(project.id, quote.id);
      expect(video.submissions).toHaveLength(expectedSubmissions);
      if (enabled) {
        const persisted = await created.creative.get(project.id);
        expect(persisted.generations).toHaveLength(1);
        expect(persisted.generations[0]?.upstreamJobId).toBe("job_1");
      }
      created.creative.stop();
    } finally {
      if (previous === undefined) delete process.env.AUVRA_VIDEO_GENERATION_ENABLED;
      else process.env.AUVRA_VIDEO_GENERATION_ENABLED = previous;
    }
  });
  it("fingerprints paid shot inputs but ignores deterministic finishing changes", () => { const plan = validPlan(); expect(planFingerprint(plan)).toBe(planFingerprint(structuredClone(plan))); expect(planFingerprint({ ...plan, closingCTA: "Different", finishing: { voiceoverEnabled: false, voiceoverSource: "user", captionsEnabled: true } })).toBe(planFingerprint(plan)); expect(planFingerprint({ ...plan, shots: plan.shots.map((shot, index) => index === 0 ? { ...shot, generativePrompt: "Different paid prompt" } : shot) })).not.toBe(planFingerprint(plan)); });
  it("round-trips a deterministic shot edited to generative and quotes the persisted plan without mutation", async () => {
    const { app, project } = await setup();
    const initial = validPlan({ shots: [
      { ...validPlan().shots[0]!, visualMode: "motion_graphic", allowGenerativeVideo: false, visualConcept: "Deterministic node build", durationSeconds: 4, generativePrompt: undefined, generativeReason: undefined },
      { ...validPlan().shots[1]!, durationSeconds: 11 }
    ].map((shot) => { const copy = { ...shot }; if (copy.generativePrompt === undefined) delete copy.generativePrompt; if (copy.generativeReason === undefined) delete copy.generativeReason; return copy; }) });
    expect((await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: initial })).status).toBe(200);
    const oldQuote = (await request(app).post(`/api/creative/projects/${project.id}/quote`).send({})).body;
    expect(oldQuote.estimatedProviderCostUsd).toBe(0);

    const concept = "Abstract premium visualization of multiple AI agents coordinating inside one intelligent workspace. Floating connected nodes, subtle violet and indigo dimensional lighting, clean bright environment, smooth cinematic movement, sophisticated SaaS launch-film aesthetic. No text, no logos, no people.";
    const prompt = `${concept} Camera glides slowly through the connected system.`;
    const persistedBeforeEdit = (await request(app).get(`/api/creative/projects/${project.id}`)).body as CreativeProject;
    const edited: CreativePlan = {
      ...persistedBeforeEdit.plan!,
      closingCTA: "Coordinate intelligently",
      shots: persistedBeforeEdit.plan!.shots.map((shot) => shot.id === "generated" ? {
        ...shot,
        order: 1,
        durationSeconds: 6,
        exactCopy: ["One intelligent workspace"],
        visualConcept: concept,
        visualMode: "generative_video",
        generativePrompt: prompt,
        recommendedCapability: "cinematic dimensional coordination",
        generativeReason: "The abstract spatial coordination benefits from cinematic camera movement.",
        allowGenerativeVideo: true
      } : { ...shot, order: 2, durationSeconds: 9 })
    };
    const saved = await request(app).post(`/api/creative/projects/${project.id}/direct`).send({ plan: edited });
    expect(saved.status).toBe(200);
    const reloaded = (await request(app).get(`/api/creative/projects/${project.id}`)).body as CreativeProject;
    const savedShot = reloaded.plan!.shots.find((shot) => shot.id === "generated")!;
    expect(savedShot).toEqual(expect.objectContaining({ order: 1, durationSeconds: 6, exactCopy: ["One intelligent workspace"], visualConcept: concept, visualMode: "generative_video", generativePrompt: prompt, recommendedCapability: "cinematic dimensional coordination", generativeReason: "The abstract spatial coordination benefits from cinematic camera movement.", allowGenerativeVideo: true }));
    expect(reloaded.plan!.closingCTA).toBe("Coordinate intelligently");
    expect(reloaded.quotes.find((quote) => quote.id === oldQuote.id)?.status).toBe("invalidated");

    const planBeforeQuote = structuredClone(reloaded.plan!);
    const quoteResponse = await request(app).post(`/api/creative/projects/${project.id}/quote`).send({});
    expect(quoteResponse.status).toBe(201);
    const generatedLine = quoteResponse.body.items.find((item: { shotId: string }) => item.shotId === "generated");
    const deterministicLine = quoteResponse.body.items.find((item: { shotId: string }) => item.shotId === "exact");
    expect(generatedLine).toEqual(expect.objectContaining({ model: "google/veo-3.1-lite", seconds: 6 }));
    expect(generatedLine.estimatedProviderCostUsd).toBeGreaterThan(0);
    expect(generatedLine.reservedCostUsd).toBeGreaterThan(generatedLine.estimatedProviderCostUsd);
    expect(deterministicLine.estimatedProviderCostUsd).toBe(0);
    expect(deterministicLine.reservedCostUsd).toBe(0);
    expect(quoteResponse.body.planFingerprint).toBe(planFingerprint(planBeforeQuote));
    expect((await request(app).get(`/api/creative/projects/${project.id}`)).body.plan).toEqual(planBeforeQuote);
  });
});

describe("paid job persistence and restart-safe polling", () => {
  async function generated() { const state = await setup(true); await request(state.app).post(`/api/creative/projects/${state.project.id}/direct`).send({ plan: validPlan() }); const quote = (await request(state.app).post(`/api/creative/projects/${state.project.id}/quote`).send({})).body; await request(state.app).post(`/api/creative/projects/${state.project.id}/quotes/${quote.id}/approve`).send({}); const response = await request(state.app).post(`/api/creative/projects/${state.project.id}/generate`).send({ quoteId: quote.id }); return { ...state, quoteId: quote.id as string, generationId: response.body.generationIds[0] as string }; }
  it("persists the upstream job ID immediately and polls that same job without resubmitting", async () => { const state = await generated(); const saved = await state.creative.getGeneration(state.project.id, state.generationId); expect(saved.upstreamJobId).toBe("job_1"); await state.creative.pollGeneration(saved); await state.creative.pollGeneration(await state.creative.getGeneration(state.project.id, state.generationId)); expect(state.video.submissions).toHaveLength(1); expect(state.video.polls).toEqual(["job_1", "job_1"]); state.creative.stop(); });
  it("restart recovery discovers and polls the persisted upstream job", async () => { const state = await generated(); const replacement = new CreativeService(state.repository, state.config, inference, state.video); await replacement.pollOnce(); expect(state.video.polls).toEqual(["job_1"]); expect(state.video.submissions).toHaveLength(1); state.creative.stop(); replacement.stop(); });
  it.each(["failed", "cancelled", "expired"] as VideoGenerationStatus[])("stops polling terminal %s jobs", async (status) => { const state = await generated(); state.video.nextStatus = status; await state.creative.pollOnce(); await state.creative.pollOnce(); expect(state.video.polls).toHaveLength(1); state.creative.stop(); });
  it("records actual usage.cost when present and marks missing cost unverified rather than zero", async () => { const verified = await generated(); verified.video.nextStatus = "completed"; verified.video.usageCostUsd = 0.101; await verified.creative.pollOnce(); expect((await verified.creative.getGeneration(verified.project.id, verified.generationId)).actualProviderCostUsd).toBe(0.101); verified.creative.stop(); const missing = await generated(); missing.video.nextStatus = "completed"; await missing.creative.pollOnce(); const record = await missing.creative.getGeneration(missing.project.id, missing.generationId); expect(record.costStatus).toBe("unverified"); expect(record.actualProviderCostUsd).toBeUndefined(); expect(record.reservedCostUsd).toBe(0.138); missing.creative.stop(); });
  it("does not submit the same approved request twice while its generation is active", async () => { const state = await generated(); const duplicate = await request(state.app).post(`/api/creative/projects/${state.project.id}/generate`).send({ quoteId: state.quoteId }); expect(duplicate.status).toBe(409); expect(duplicate.body.error.code).toBe("GENERATION_ALREADY_EXISTS"); expect(state.video.submissions).toHaveLength(1); state.creative.stop(); });
});

describe("provider URL construction", () => {
  it("ignores arbitrary provider URLs and reconstructs polling and content requests", async () => { const urls: string[] = []; const provider = new OrbioVideoProvider({ apiKey: "secret", baseUrl: "https://api.orbio.test/api/v1", timeoutMs: 1000 }, (async (input) => { urls.push(String(input)); return urls.length === 1 ? new Response(JSON.stringify({ id: "safe_job", status: "in_progress", polling_url: "https://evil.test/steal" }), { status: 200 }) : new Response("video", { status: 200 }); }) as typeof fetch); await provider.getVideoJob("safe_job"); await provider.downloadVideo("safe_job", 0); expect(urls).toEqual(["https://api.orbio.test/api/v1/videos/safe_job", "https://api.orbio.test/api/v1/videos/safe_job/content?index=0"]); await expect(provider.getVideoJob("https://evil.test/job")).rejects.toMatchObject({ code: "INVALID_JOB_ID" }); });
  it("submits generate_audio and never the undocumented audio field", async () => { let body: Record<string, unknown> = {}; const provider = new OrbioVideoProvider({ apiKey: "secret", baseUrl: "https://api.orbio.test/api/v1", timeoutMs: 1000 }, (async (_input, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: "safe_job", status: "pending" }), { status: 200 }); }) as typeof fetch); await provider.submitVideo({ model: "runway/gen-4.5", prompt: "Camera pushes in", durationSeconds: 4, aspectRatio: "16:9", resolution: "720p", audio: false }); expect(body.generate_audio).toBe(false); expect(body).not.toHaveProperty("audio"); });
});

describe("asset upload limits and path safety", () => {
  it("stores a traversal-like filename under a generated safe ID", async () => { const { app, project, config } = await setup(); const response = await request(app).post(`/api/creative/projects/${project.id}/assets`).field("role", "logo").attach("assets", Buffer.from("png"), { filename: "../escape.png", contentType: "image/png" }); expect(response.status).toBe(201); const files = await readdir(config.creative.assetDir); expect(files).toHaveLength(1); expect(files[0]).toMatch(/^[0-9a-f-]+\.png$/); expect(files[0]).not.toContain("escape"); });
  it("rejects unsupported MIME types and enforces file size limits", async () => { const unsupported = await setup(); expect((await request(unsupported.app).post(`/api/creative/projects/${unsupported.project.id}/assets`).attach("assets", Buffer.from("text"), { filename: "x.txt", contentType: "text/plain" })).status).toBe(415); const limited = await setup(false, { maxAssetBytes: 3 }); const tooLarge = await request(limited.app).post(`/api/creative/projects/${limited.project.id}/assets`).attach("assets", Buffer.from("1234"), { filename: "x.png", contentType: "image/png" }); expect(tooLarge.status).toBe(413); expect(tooLarge.body.error.code).toBe("ASSET_LIMIT_EXCEEDED"); });
  it("serves only project-owned asset metadata with the recorded content type", async () => { const { app, project } = await setup(); const upload = await request(app).post(`/api/creative/projects/${project.id}/assets`).attach("assets", Buffer.from("png"), { filename: "frame.png", contentType: "image/png" }); const asset = upload.body.assets[0]; const served = await request(app).get(`/api/creative/projects/${project.id}/assets/${asset.id}/content`); expect(served.status).toBe(200); expect(served.headers["content-type"]).toContain("image/png"); expect((await request(app).get(`/api/creative/projects/${project.id}/assets/not-a-real-asset/content?path=../../.env`)).status).toBe(404); });
});

describe("cinematic creation modes", () => {
  it("requires an uploaded image before preparing Image to Video", async () => { const state = await setup(); const created = (await request(state.app).post("/api/creative/projects").send({ name: "Image motion", brief: { creationMode: "image_to_video", objective: "Animate frame", audience: "Customers", keyMessage: "Camera pushes in while fabric moves", durationSeconds: 4, aspectRatio: "16:9", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject; const response = await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({}); expect(response.status).toBe(422); expect(response.body.error.code).toBe("REFERENCE_IMAGE_REQUIRED"); });
  it("prepares a text-to-video mode without an image", async () => { const state = await setup(); const created = (await request(state.app).post("/api/creative/projects").send({ name: "Scene", brief: { creationMode: "cinematic_scene", objective: "Create scene", audience: "Customers", keyMessage: "A runner crosses a rain-lit street as the camera tracks beside her", durationSeconds: 6, aspectRatio: "9:16", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject; const response = await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({}); expect(response.status).toBe(200); expect(response.body.plan.shots).toHaveLength(1); expect(response.body.plan.shots[0]).toEqual(expect.objectContaining({ durationSeconds: 6, visualMode: "generative_video", allowGenerativeVideo: true })); });
  it("normalizes an edited legacy V1 plan and submits only the visible prompt", async () => {
    const state = await setup(true);
    const created = (await request(state.app).post("/api/creative/projects").send({ name: "Dance", brief: { creationMode: "cinematic_scene", objective: "Create scene", audience: "Customers", keyMessage: "A woman dances", durationSeconds: 6, aspectRatio: "9:16", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject;
    const dancing = "A confident young woman dancing slowly and fluidly in warm evening light, cinematic camera movement.";
    const historical = { id: "completed-history", projectId: created.id, shotId: "old-shot", model: "runway/gen-4.5", provider: "Orbio" as const, request: {}, status: "completed" as const, attempt: 11, quotedCostUsd: 0.48, reservedCostUsd: 0.552, actualProviderCostUsd: 0.44, costStatus: "verified" as const, outputAssetId: "old-output" };
    await state.repository.updateProject(created.id, (current) => ({ ...current, generations: [historical], assets: [{ id: "old-output", projectId: created.id, originalName: "old.mp4", mimeType: "video/mp4", size: 4, role: "generated_video", createdAt: new Date().toISOString(), analysisStatus: "completed" }], updatedAt: new Date().toISOString() }));
    const legacy = validPlan({ durationSeconds: 15, shots: [
      { ...validPlan().shots[0]!, id: "edited", visualConcept: dancing, generativePrompt: dancing, visualMode: "motion_graphic", allowGenerativeVideo: false },
      { ...validPlan().shots[0]!, id: "stale", order: 2, visualConcept: "Abstract AI agents", generativePrompt: "Abstract premium visualization of multiple AI agents coordinating", durationSeconds: 11 }
    ] });
    const saved = await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({ plan: legacy });
    expect(saved.body.plan.shots).toHaveLength(1);
    expect(saved.body.generations).toEqual(expect.arrayContaining([expect.objectContaining({ id: "completed-history", outputAssetId: "old-output" })]));
    expect(saved.body.plan.shots[0]).toEqual(expect.objectContaining({ visualMode: "generative_video", visualConcept: dancing, generativePrompt: dancing }));
    const quote = (await request(state.app).post(`/api/creative/projects/${created.id}/quote`).send({})).body;
    expect(quote.items).toHaveLength(1);
    expect(quote.items[0]).toEqual(expect.objectContaining({ prompt: dancing }));
    await request(state.app).post(`/api/creative/projects/${created.id}/quotes/${quote.id}/approve`).send({});
    expect((await request(state.app).post(`/api/creative/projects/${created.id}/generate`).send({ quoteId: quote.id })).status).toBe(202);
    expect(state.video.submissions).toHaveLength(1);
    expect(state.video.submissions[0]?.prompt).toBe(dancing);
    expect(state.video.submissions[0]?.prompt).not.toContain("AI agents");
    state.creative.stop();
  });
  it("normalizes a persisted legacy plan before direct Estimate Cost and never quotes the stale shot", async () => {
    const state = await setup(false);
    const created = (await request(state.app).post("/api/creative/projects").send({ name: "Legacy dance", brief: { creationMode: "cinematic_scene", objective: "Create scene", audience: "Customers", keyMessage: "A woman dances", durationSeconds: 15, aspectRatio: "16:9", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject;
    const dancing = "A confident young woman dancing slowly and fluidly in warm evening light, cinematic camera movement.";
    const legacy = validPlan({ shots: [
      { ...validPlan().shots[0]!, id: "legacy-1", visualMode: "motion_graphic", allowGenerativeVideo: false, visualConcept: dancing, generativePrompt: undefined, generativeReason: undefined, durationSeconds: 4 },
      { ...validPlan().shots[0]!, id: "legacy-2", order: 2, visualConcept: "Abstract AI agents", generativePrompt: "Abstract premium visualization of multiple AI agents coordinating", durationSeconds: 6 },
      { ...validPlan().shots[1]!, id: "legacy-3", order: 3, durationSeconds: 5 }
    ].map((shot) => { const copy = { ...shot }; if (copy.generativePrompt === undefined) delete copy.generativePrompt; if (copy.generativeReason === undefined) delete copy.generativeReason; return copy; }) });
    await state.repository.updateProject(created.id, (current) => ({ ...current, plan: legacy, updatedAt: new Date().toISOString() }));
    const quote = await request(state.app).post(`/api/creative/projects/${created.id}/quote`).send({});
    expect(quote.status).toBe(201);
    expect(quote.body.items).toHaveLength(2);
    expect(quote.body.items.every((item: { prompt?: string }) => item.prompt?.includes("A woman dances"))).toBe(true);
    expect(quote.body.items.every((item: { prompt?: string }) => !item.prompt?.includes("AI agents"))).toBe(true);
    const persisted = await state.creative.get(created.id);
    expect(persisted.plan?.shots).toHaveLength(2);
    expect(persisted.plan?.shots.every((shot) => shot.visualMode === "generative_video" && shot.allowGenerativeVideo)).toBe(true);
    expect(state.video.submissions).toHaveLength(0);
    state.creative.stop();
  });
  it("invalidates V1 approval when its prompt changes", async () => {
    const state = await setup();
    const created = (await request(state.app).post("/api/creative/projects").send({ name: "Prompt", brief: { creationMode: "social_clip", objective: "Create clip", audience: "Customers", keyMessage: "First", durationSeconds: 4, aspectRatio: "16:9", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject;
    const first = validPlan({ durationSeconds: 4, shots: [{ ...validPlan().shots[0]!, id: "one", durationSeconds: 4, visualConcept: "First", generativePrompt: "First" }] });
    const second = { ...first, shots: [{ ...first.shots[0]!, visualConcept: "Second", generativePrompt: "Second" }] };
    await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({ plan: first });
    const quote = (await request(state.app).post(`/api/creative/projects/${created.id}/quote`).send({})).body;
    await request(state.app).post(`/api/creative/projects/${created.id}/quotes/${quote.id}/approve`).send({});
    await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({ plan: second });
    expect((await state.creative.get(created.id)).quotes.find((item) => item.id === quote.id)?.status).toBe("invalidated");
    state.creative.stop();
  });
  it("fails safely when a legacy project has multiple generative shots", async () => {
    const state = await setup(true);
    const plan = validPlan({ shots: [validPlan().shots[0]!, { ...validPlan().shots[0]!, id: "second", order: 2, durationSeconds: 11, generativePrompt: "Another stale prompt" }] });
    await request(state.app).post(`/api/creative/projects/${state.project.id}/direct`).send({ plan });
    const quote = await request(state.app).post(`/api/creative/projects/${state.project.id}/quote`).send({});
    expect(quote.status).toBe(422);
    expect(quote.body.error.code).toBe("ACTIVE_GENERATION_SHOT_AMBIGUOUS");
    expect(state.video.submissions).toHaveLength(0);
    state.creative.stop();
  });
  it("keeps image-conditioned paid submission blocked when no documented Orbio request field exists", async () => { const state = await setup(true); const created = (await request(state.app).post("/api/creative/projects").send({ name: "Image motion", brief: { creationMode: "image_to_video", objective: "Animate frame", audience: "Customers", keyMessage: "Camera pushes in while fabric moves", durationSeconds: 4, aspectRatio: "16:9", toneNotes: "Cinematic", qualityTarget: "standard" } })).body as CreativeProject; await request(state.app).post(`/api/creative/projects/${created.id}/assets`).attach("assets", Buffer.from("png"), { filename: "frame.png", contentType: "image/png" }); await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({}); const quote = (await request(state.app).post(`/api/creative/projects/${created.id}/quote`).send({})).body; await request(state.app).post(`/api/creative/projects/${created.id}/quotes/${quote.id}/approve`).send({}); const response = await request(state.app).post(`/api/creative/projects/${created.id}/generate`).send({ quoteId: quote.id }); expect(response.status).toBe(422); expect(response.body.error.code).toBe("IMAGE_CONDITIONING_NOT_WIRED"); expect(state.video.submissions).toHaveLength(0); state.creative.stop(); });
});

describe("deterministic finishing and final export", () => {
  async function completedState() {
    const state = await setup(true); await request(state.app).post(`/api/creative/projects/${state.project.id}/direct`).send({ plan: validPlan() }); const quote = (await request(state.app).post(`/api/creative/projects/${state.project.id}/quote`).send({})).body; await request(state.app).post(`/api/creative/projects/${state.project.id}/quotes/${quote.id}/approve`).send({}); await request(state.app).post(`/api/creative/projects/${state.project.id}/generate`).send({ quoteId: quote.id }); state.video.nextStatus = "completed"; await state.creative.pollOnce(); return state;
  }

  it.each([
    { name: "video only", finishing: { voiceoverEnabled: false, voiceoverSource: "user", captionsEnabled: false, captionStyle: "clean" } },
    { name: "video and captions", finishing: { voiceoverEnabled: false, voiceoverSource: "user", voiceoverScript: "Exact approved words", captionsEnabled: true, captionStyle: "clean" } }
  ])("renders $name from the existing completed shot", async ({ finishing }) => { const state = await completedState(); const generated = (await state.creative.get(state.project.id)).generations[0]!.outputAssetId; await request(state.app).post(`/api/creative/projects/${state.project.id}/finishing`).send(finishing); const rendered = await request(state.app).post(`/api/creative/projects/${state.project.id}/render`).send({}); expect(rendered.status).toBe(201); expect(rendered.body.outputAssetId).toBeTruthy(); expect(rendered.body.outputAssetId).not.toBe(generated); expect(rendered.body.assets.find((asset: { id: string }) => asset.id === rendered.body.outputAssetId).role).toBe("final_output"); expect(state.finishingRenderer.calls).toHaveLength(1); expect(state.finishingRenderer.calls[0]?.generatedClips[0]?.shotId).toBe("generated"); expect(state.video.submissions).toHaveLength(1); state.creative.stop(); });

  it("persists the exact approved script and passes narration, captions, logo, and CTA to final rendering", async () => { const state = await completedState(); const narrationUpload = await request(state.app).post(`/api/creative/projects/${state.project.id}/assets`).field("role", "narration").attach("assets", Buffer.from("wav"), { filename: "narration.wav", contentType: "audio/wav" }); const narrationId = narrationUpload.body.assets.at(-1).id; const logoUpload = await request(state.app).post(`/api/creative/projects/${state.project.id}/assets`).field("role", "logo").attach("assets", Buffer.from("png"), { filename: "logo.png", contentType: "image/png" }); const logoId = logoUpload.body.assets.at(-1).id; const exact = "You design the frame. Auvra directs the motion."; const saved = await request(state.app).post(`/api/creative/projects/${state.project.id}/finishing`).send({ voiceoverEnabled: true, voiceoverSource: "user", voiceoverScript: exact, narrationAssetId: narrationId, captionsEnabled: true, captionStyle: "bold", logoEnabled: true, ctaEnabled: true, ctaText: "Start creating" }); expect(saved.body.plan.finishing.voiceoverScript).toBe(exact); const rendered = await request(state.app).post(`/api/creative/projects/${state.project.id}/render`).send({}); expect(rendered.status).toBe(201); const call = state.finishingRenderer.calls[0]!; expect(call.plan.finishing).toEqual(expect.objectContaining({ voiceoverScript: exact, captionsEnabled: true, logoEnabled: true, ctaEnabled: true, ctaText: "Start creating", narrationAssetId: narrationId })); expect(call.narrationPath).toMatch(new RegExp(`${narrationId}\\.wav$`)); expect(call.logoPath).toMatch(new RegExp(`${logoId}\\.png$`)); const output = await request(state.app).get(`/api/creative/projects/${state.project.id}/output`); expect(output.body.assetId).toBe(rendered.body.outputAssetId); const content = await request(state.app).get(`/api/creative/projects/${state.project.id}/assets/${rendered.body.outputAssetId}/content?path=../../secret`); expect(content.status).toBe(200); expect(content.headers["content-type"]).toContain("video/mp4"); expect(state.video.submissions).toHaveLength(1); state.creative.stop(); });

  it("reuses uploaded narration without any TTS call and rerenders metadata without calling the video provider", async () => { const state = await completedState(); const upload = await request(state.app).post(`/api/creative/projects/${state.project.id}/assets`).field("role", "narration").attach("assets", Buffer.from("wav"), { filename: "narration.wav", contentType: "audio/wav" }); const narrationAssetId = upload.body.assets.at(-1).id; const first = { voiceoverEnabled: true, voiceoverSource: "user", voiceoverScript: "Same final script", narrationAssetId, captionsEnabled: false, logoEnabled: false, ctaEnabled: false }; await request(state.app).post(`/api/creative/projects/${state.project.id}/finishing`).send(first); await request(state.app).post(`/api/creative/projects/${state.project.id}/render`).send({}); await request(state.app).post(`/api/creative/projects/${state.project.id}/finishing`).send({ ...first, captionsEnabled: true }); await request(state.app).post(`/api/creative/projects/${state.project.id}/render`).send({}); expect(state.video.submissions).toHaveLength(1); expect(state.finishingRenderer.calls).toHaveLength(2); expect(state.finishingRenderer.calls[0]?.narrationPath).toBe(state.finishingRenderer.calls[1]?.narrationPath); state.creative.stop(); });

  it("prepares a duration-bound script only on explicit request and persists its exact result for editing", async () => { const complete = vi.fn(async () => ({ text: "A precisely prepared script.", toolCalls: [], usage: { input: 1, output: 2, total: 3 }, actualCostUsd: 0.001, model: "test", finishReason: "stop" })); const state = await setup(false, {}, { complete }); await request(state.app).post(`/api/creative/projects/${state.project.id}/direct`).send({ plan: validPlan() }); const response = await request(state.app).post(`/api/creative/projects/${state.project.id}/finishing/prepare-script`).send({}); expect(response.status).toBe(200); expect(response.body.plan.finishing.voiceoverScript).toBe("A precisely prepared script."); expect(complete).toHaveBeenCalledTimes(1); state.creative.stop(); });
});

describe("long-form cinematic direction", () => {
  async function createDirected(state: Awaited<ReturnType<typeof setup>>, durationSeconds: 6 | 15 | 30 | 60, nativeAudioEnabled = false) {
    const created = (await request(state.app).post("/api/creative/projects").send({ name: `${durationSeconds}s film`, brief: { creationMode: "cinematic_scene", objective: "Create a luxury perfume film", audience: "Luxury buyers", keyMessage: "Black glass perfume in amber light", durationSeconds, aspectRatio: "16:9", toneNotes: "Premium and restrained", qualityTarget: "standard", nativeAudioEnabled } })).body as CreativeProject;
    const directed = await request(state.app).post(`/api/creative/projects/${created.id}/direct`).send({});
    expect(directed.status).toBe(200); return directed.body as CreativeProject;
  }

  it("keeps the short clip as one provider-compatible shot", async () => {
    const state = await setup(); const project = await createDirected(state, 6);
    expect(project.plan?.shots).toHaveLength(1); expect(project.plan?.shots[0]?.durationSeconds).toBe(6); state.creative.stop();
  });

  it.each([[15, 2], [30, 5], [60, 10]] as const)("plans %ss as %s short provider-compatible shots", async (durationSeconds, count) => {
    const state = await setup(); const project = await createDirected(state, durationSeconds);
    expect(project.plan?.shots).toHaveLength(count);
    expect(project.plan?.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0)).toBe(durationSeconds);
    expect(project.plan?.shots.every((shot) => shot.durationSeconds <= 8 && routeShot(shot, project.plan!.aspectRatio, project.brief.qualityTarget).kind === "generative")).toBe(true);
    state.creative.stop();
  });

  it("quotes the sum with reserve and submits nothing before complete-plan approval", async () => {
    const state = await setup(true); const project = await createDirected(state, 30);
    const quote = (await request(state.app).post(`/api/creative/projects/${project.id}/quote`).send({})).body as CreativeQuote;
    expect(quote.items.filter((item) => item.model)).toHaveLength(5);
    expect(quote.estimatedProviderCostUsd).toBe(Number(quote.items.reduce((sum, item) => sum + item.estimatedProviderCostUsd, 0).toFixed(6)));
    expect(quote.reservedCostUsd).toBe(Number(quote.items.reduce((sum, item) => sum + item.reservedCostUsd, 0).toFixed(6)));
    expect(state.video.submissions).toHaveLength(0);
    expect((await request(state.app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id })).body.error.code).toBe("QUOTE_APPROVAL_REQUIRED");
    expect(state.video.submissions).toHaveLength(0); state.creative.stop();
  });

  it("polls every shot, retries only failure, and assembles in plan order", async () => {
    const state = await setup(true, { pollConcurrency: 2 }); const project = await createDirected(state, 30);
    const quote = (await request(state.app).post(`/api/creative/projects/${project.id}/quote`).send({})).body as CreativeQuote;
    await request(state.app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); await request(state.app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id });
    expect(state.video.submissions).toHaveLength(5); expect(state.video.submissions.every((submission) => submission.durationSeconds === 6)).toBe(true);
    for (let index = 1; index <= 5; index++) state.video.statuses.set(`job_${index}`, index === 3 ? "failed" : "completed");
    await state.creative.pollOnce(); expect(state.video.polls).toEqual(["job_1", "job_2", "job_3", "job_4", "job_5"]);
    const partial = await state.creative.get(project.id); const current = new Map<string, VideoGeneration>(); for (const generation of partial.generations) current.set(generation.shotId, generation);
    expect([...current.values()].filter((generation) => generation.status === "completed")).toHaveLength(4);
    const failed = [...current.values()].find((generation) => generation.status === "failed")!;
    const retryQuote = (await request(state.app).post(`/api/creative/projects/${project.id}/quote`).send({ shotId: failed.shotId })).body as CreativeQuote;
    expect(retryQuote.items.filter((item) => item.model).map((item) => item.shotId)).toEqual([failed.shotId]);
    await request(state.app).post(`/api/creative/projects/${project.id}/quotes/${retryQuote.id}/approve`).send({}); await request(state.app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: retryQuote.id });
    expect(state.video.submissions).toHaveLength(6); state.video.statuses.set("job_6", "completed"); await state.creative.pollOnce();
    const pollsAtTerminal = state.video.polls.length; await state.creative.pollOnce(); expect(state.video.polls).toHaveLength(pollsAtTerminal);
    await request(state.app).post(`/api/creative/projects/${project.id}/render`).send({});
    expect(state.finishingRenderer.calls[0]?.generatedClips.map((clip) => clip.shotId)).toEqual([...(project.plan?.shots ?? [])].sort((a, b) => a.order - b.order).map((shot) => shot.id)); state.creative.stop();
  });

  it("sends native audio only after explicit opt-in and verified routing", async () => {
    const state = await setup(true); const project = await createDirected(state, 15, true);
    const quote = (await request(state.app).post(`/api/creative/projects/${project.id}/quote`).send({})).body as CreativeQuote;
    expect(quote.items.every((item) => !item.model || item.nativeAudioEnabled === true)).toBe(true);
    await request(state.app).post(`/api/creative/projects/${project.id}/quotes/${quote.id}/approve`).send({}); await request(state.app).post(`/api/creative/projects/${project.id}/generate`).send({ quoteId: quote.id });
    expect(state.video.submissions.every((submission) => submission.audio === true)).toBe(true); state.creative.stop();
  });
});
