import type { CreativeCreationMode, CreativeProject, CreativeQuote, CreativeShot, VideoGeneration } from "@auvra/shared";

export const DEFAULT_CREATION_MODE: CreativeCreationMode = "cinematic_scene";
export const ACTIVE_GENERATION_STATUSES = new Set(["pending", "in_progress"]);

export const latestGeneration = (project: Pick<CreativeProject, "generations">): VideoGeneration | undefined => project.generations.at(-1);
export const generationHistory = (project: Pick<CreativeProject, "generations">): VideoGeneration[] => project.generations.slice(0, -1).reverse();
// V1 is one-shot. Older projects may retain an unrelated in-flight legacy
// record; it must not keep the current (latest) result stuck on “Generating”.
export const latestShotGenerations = (project: Pick<CreativeProject, "generations">): VideoGeneration[] => {
  const latest = new Map<string, VideoGeneration>();
  for (const generation of project.generations) latest.set(generation.shotId, generation);
  return [...latest.values()];
};
export const hasActiveGeneration = (project: Pick<CreativeProject, "generations">): boolean => latestShotGenerations(project).some((generation) => ACTIVE_GENERATION_STATUSES.has(generation.status));
export const generationPollDelay = (project: Pick<CreativeProject, "generations">): number | undefined => hasActiveGeneration(project) ? 3000 : undefined;
export const generationPreviewUrl = (project: Pick<CreativeProject, "id">, generation?: VideoGeneration): string | undefined => generation?.status === "completed" && generation.outputAssetId ? `/api/creative/projects/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(generation.outputAssetId)}/content` : undefined;
export const finalPreviewUrl = (project: Pick<CreativeProject, "id" | "outputAssetId">): string | undefined => project.outputAssetId ? `/api/creative/projects/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(project.outputAssetId)}/content` : undefined;
export const FINAL_RENDER_LABEL = "Render final video";
export const safeGenerationError = (generation: VideoGeneration): string => generation.status === "failed" ? "The video could not be generated. Review the request and try again with a new approval." : generation.status === "expired" ? "Generation status expired without another paid submission." : generation.status === "cancelled" ? "Generation was cancelled." : "";

const defaultGenerativeReason = "Generated motion is explicitly enabled because cinematic movement adds value to this shot.";

export function generativeFields(shot: CreativeShot): Pick<CreativeShot, "generativePrompt" | "generativeReason"> {
  return { generativePrompt: shot.generativePrompt || shot.visualConcept, generativeReason: shot.generativeReason || defaultGenerativeReason };
}

export function visualModePatch(shot: CreativeShot, visualMode: CreativeShot["visualMode"]): Partial<CreativeShot> {
  return { visualMode, ...(["generative_video", "hybrid"].includes(visualMode) ? generativeFields(shot) : {}) };
}

export function generationPermissionPatch(shot: CreativeShot, allowGenerativeVideo: boolean): Partial<CreativeShot> {
  return { allowGenerativeVideo, ...(allowGenerativeVideo && ["generative_video", "hybrid"].includes(shot.visualMode) ? generativeFields(shot) : {}) };
}

export function visualConceptPatch(shot: CreativeShot, visualConcept: string): Partial<CreativeShot> {
  const syncPrompt = ["generative_video", "hybrid"].includes(shot.visualMode) && (!shot.generativePrompt || shot.generativePrompt === shot.visualConcept);
  return { visualConcept, ...(syncPrompt ? { generativePrompt: visualConcept } : {}) };
}

export function isCreativeProject(value: unknown): value is CreativeProject {
  return Boolean(value && typeof value === "object" && "brief" in value && "assets" in value && "quotes" in value);
}

export function quotedPromptMatchesEditor(quote: CreativeQuote, editorPrompt: string | undefined): boolean {
  const quotedPrompt = quote.items.find((item) => item.prompt)?.prompt;
  return Boolean(quotedPrompt !== undefined && editorPrompt !== undefined && quotedPrompt === editorPrompt);
}

export function quoteMatchesPlan(quote: CreativeQuote, shots: CreativeShot[]): boolean {
  return quote.items.every((item) => {
    const shot = shots.find((candidate) => candidate.id === item.shotId);
    return !item.prompt || Boolean(shot && item.prompt === (shot.generativePrompt ?? shot.visualConcept));
  });
}
