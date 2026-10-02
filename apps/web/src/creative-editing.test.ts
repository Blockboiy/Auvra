import type { CreativeProject, CreativeShot, VideoGeneration } from "@auvra/shared";
import { describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { DEFAULT_CREATION_MODE, FINAL_RENDER_LABEL, finalPreviewUrl, generationHistory, generationPollDelay, generationPreviewUrl, hasActiveGeneration, latestGeneration, latestShotGenerations, generationPermissionPatch, isCreativeProject, quoteMatchesPlan, quotedPromptMatchesEditor, visualConceptPatch, visualModePatch } from "./creative-editing";

const deterministicShot: CreativeShot = { id: "shot-1", order: 1, purpose: "Explain coordination", durationSeconds: 6, exactCopy: ["One workspace"], visualConcept: "Deterministic node diagram", visualMode: "motion_graphic", assetRefs: [], motionDirection: "Build", transitionIn: "Fade", transitionOut: "Mask", brandConstraints: ["No logo mutation"], allowGenerativeVideo: false };

describe("Creative Studio shot editing", () => {
  it("promotes a deterministic shot to generative without losing its editable fields", () => {
    const promoted = { ...deterministicShot, ...visualModePatch(deterministicShot, "generative_video") } as CreativeShot;
    const concept = "Abstract premium visualization of multiple AI agents coordinating inside one intelligent workspace. No text, no logos, no people.";
    const withConcept = { ...promoted, ...visualConceptPatch(promoted, concept) } as CreativeShot;
    const enabled = { ...withConcept, ...generationPermissionPatch(withConcept, true), durationSeconds: 4 };
    expect(enabled).toEqual(expect.objectContaining({ id: "shot-1", order: 1, exactCopy: ["One workspace"], durationSeconds: 4, visualMode: "generative_video", allowGenerativeVideo: true, visualConcept: concept, generativePrompt: concept }));
    expect(enabled.generativeReason).toContain("cinematic movement");
  });

  it("serializes every edited shot field and returns the authoritative persisted project", async () => {
    const shot: CreativeShot = { ...deterministicShot, ...visualModePatch(deterministicShot, "generative_video"), allowGenerativeVideo: true, visualConcept: "Connected agents in violet light", generativePrompt: "Connected agents in violet light; no text", generativeReason: "Cinematic movement adds value", recommendedCapability: "cinematic movement" };
    const brand = { primaryColor: "#6D35F7", accentColors: [] as string[], backgroundPreference: "dark" as const, typographyDirection: "Sans", cornerLanguage: "Soft", visualKeywords: [] as string[], prohibitedMutations: [] as string[] };
    const project = { id: "project-1", name: "Launch", brief: { objective: "Launch", audience: "Teams", keyMessage: "Coordinate", durationSeconds: 15 as const, aspectRatio: "16:9" as const, toneNotes: "Premium", qualityTarget: "standard" as const }, brandSystem: brand, assets: [], insights: [], plan: { version: 1, conceptTitle: "Launch", conceptSummary: "Summary", openingHook: "Hook", narrativeArc: "Arc", brandSystem: brand, durationSeconds: 15 as const, aspectRatio: "16:9" as const, shots: [shot, { ...deterministicShot, id: "shot-2", order: 2, durationSeconds: 9 }], audioPlan: { foley: [], uiCues: [], transitions: [] }, closingCTA: "Start", qualityRisks: [], createdAt: "2026-10-01T00:00:00.000Z" }, quotes: [], generations: [], events: [], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" } satisfies CreativeProject;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(project), { status: 200, headers: { "Content-Type": "application/json" } }));
    const returned = await api.directCreativeProject(project.id, project.plan);
    const submitted = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(submitted.plan.shots[0]).toEqual(shot);
    expect(returned.plan?.shots[0]).toEqual(shot);
    expect(isCreativeProject(returned)).toBe(true);
    fetchMock.mockRestore();
  });
});

const generation = (id: string, status: VideoGeneration["status"], outputAssetId?: string, shotId = "shot-1"): VideoGeneration => ({ id, projectId: "project-1", shotId, model: "runway/gen-4.5", provider: "Orbio", request: {}, status, attempt: Number(id.slice(-1)) || 1, quotedCostUsd: 0.48, reservedCostUsd: 0.552, costStatus: status === "completed" ? "verified" : "reserved", ...(outputAssetId ? { outputAssetId } : {}) });

describe("Creative Studio V1 generation state", () => {
  it("blocks approval when the displayed quote prompt differs from the editor", () => {
    const quote = { items: [{ shotId: "shot-1", mode: "generative_video", prompt: "stale", seconds: 4, estimatedProviderCostUsd: 0.12, reservedCostUsd: 0.138 }] } as CreativeProject["quotes"][number];
    expect(quotedPromptMatchesEditor(quote, "dancing")).toBe(false);
    expect(quotedPromptMatchesEditor(quote, "stale")).toBe(true);
  });
  it("defaults to Cinematic Scene while Image to Video awaits provider support", () => { expect(DEFAULT_CREATION_MODE).toBe("cinematic_scene"); });
  it("shows only the latest attempt on the primary surface while preserving history", () => { const project = { generations: [generation("g1", "failed"), generation("g2", "failed"), generation("g3", "in_progress")] }; expect(latestGeneration(project)?.id).toBe("g3"); expect(generationHistory(project).map((item) => item.id)).toEqual(["g2", "g1"]); });
  it("prevents duplicate submission state and polls only while an attempt is active", () => { const active = { generations: [generation("g1", "in_progress")] }; const terminal = { generations: [generation("g1", "completed", "asset-1")] }; expect(hasActiveGeneration(active)).toBe(true); expect(generationPollDelay(active)).toBe(3000); expect(hasActiveGeneration(terminal)).toBe(false); expect(generationPollDelay(terminal)).toBeUndefined(); });
  it("does not keep polling a completed latest V1 result because of an older legacy attempt", () => { const project = { generations: [generation("g1", "in_progress"), generation("g2", "completed", "asset-2")] }; expect(latestGeneration(project)?.id).toBe("g2"); expect(hasActiveGeneration(project)).toBe(false); expect(generationPollDelay(project)).toBeUndefined(); });
  it("derives long-form polling from the latest attempt for every shot", () => { const project = { generations: [generation("g1", "completed", "a1", "shot-1"), generation("g2", "failed", undefined, "shot-2"), generation("g3", "in_progress", undefined, "shot-3")] }; expect(latestShotGenerations(project).map((item) => item.shotId)).toEqual(["shot-1", "shot-2", "shot-3"]); expect(hasActiveGeneration(project)).toBe(true); expect(generationPollDelay(project)).toBe(3000); project.generations[2] = generation("g4", "completed", "a3", "shot-3"); expect(generationPollDelay(project)).toBeUndefined(); });
  it("invalidates a multi-shot quote when any exact provider prompt changes", () => { const shots = [{ ...deterministicShot, id: "shot-1", visualMode: "generative_video" as const, allowGenerativeVideo: true, generativePrompt: "Reveal" }, { ...deterministicShot, id: "shot-2", order: 2, visualMode: "generative_video" as const, allowGenerativeVideo: true, generativePrompt: "Hero" }]; const quote = { items: shots.map((shot) => ({ shotId: shot.id, mode: shot.visualMode, prompt: shot.generativePrompt, seconds: 6, estimatedProviderCostUsd: 0.18, reservedCostUsd: 0.207 })) } as CreativeProject["quotes"][number]; expect(quoteMatchesPlan(quote, shots)).toBe(true); expect(quoteMatchesPlan(quote, shots.map((shot) => shot.id === "shot-2" ? { ...shot, generativePrompt: "Changed hero" } : shot))).toBe(false); });
  it("exposes a project-scoped preview URL only for completed output", () => { const project = { id: "project/one" }; expect(generationPreviewUrl(project, generation("g1", "completed", "asset/two"))).toBe("/api/creative/projects/project%2Fone/assets/asset%2Ftwo/content"); expect(generationPreviewUrl(project, generation("g2", "in_progress"))).toBeUndefined(); });
  it("keeps final output separate and labels deterministic rendering clearly", () => { expect(finalPreviewUrl({ id: "project/one", outputAssetId: "final/two" })).toBe("/api/creative/projects/project%2Fone/assets/final%2Ftwo/content"); expect(finalPreviewUrl({ id: "project/one" })).toBeUndefined(); expect(FINAL_RENDER_LABEL).toBe("Render final video"); });
});
