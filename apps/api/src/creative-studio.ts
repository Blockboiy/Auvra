/** Auvra Creative Studio v1: Orbio storyboard + explicitly approved local MP4 render.
 * No third-party video-generation charge or fabricated AI-footage claim. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Express } from "express";
import type { AppConfig } from "./config.js";
import type { InferenceProvider } from "./provider/types.js";

type Aspect = "9:16" | "16:9";
type CreativeStatus = "storyboard_ready" | "rendering" | "completed" | "failed";
export interface CreativeScene { caption: string; direction: string; imageIndex?: number; secondImageIndex?: number; }
export interface CreativeStoryboard { headline: string; voiceoverDraft: string; scenes: [CreativeScene, CreativeScene, CreativeScene]; }
export interface CreativeJob {
  id: string;
  status: CreativeStatus;
  createdAt: string;
  updatedAt: string;
  productName: string;
  brief: string;
  audience: string;
  aspectRatio: Aspect;
  durationSeconds?: 15 | 30; // Existing projects are 15 seconds.
  servingModel: string;
  tokenUsage: { input: number; output: number; total: number };
  inferenceCostUsd: number | null;
  inferenceBudgetUsd: number;
  renderCostUsd: 0;
  imageName: string; // Retained for existing v1 projects.
  imageNames?: string[];
  storyboardSource?: "ai" | "manual_fallback";
  storyboard: CreativeStoryboard | null;
  error?: string;
  videoUrl?: string;
}

class CreativeError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code: string) { super(message); }
}
const obj = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const clean = (value: unknown, max: number): string => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const round = (value: number): number => Math.round(value * 1e8) / 1e8;
const MAX_IMAGES = 6;
const imageData = (value: unknown): { bytes: Buffer; ext: string } => {
  if (typeof value !== "string") throw new CreativeError("Upload a JPG, PNG or WebP product image.", 422, "IMAGE_REQUIRED");
  const found = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!found?.[1] || !found[2] || found[2].length > 2_100_000) throw new CreativeError("Each prepared image must be under 1.5 MB. Upload up to six images.", 422, "INVALID_IMAGE");
  const bytes = Buffer.from(found[2], "base64");
  const mime = found[1];
  const magic = mime === "jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!magic || bytes.length < 20 || bytes.length > 1_550_000) throw new CreativeError("Image contents do not match a supported format, or the file is too large.", 422, "INVALID_IMAGE");
  return { bytes, ext: mime === "jpeg" ? "jpg" : mime };
};

/** Reject unsupported shapes rather than silently presenting a fabricated storyboard. */
export function parseCreativeStoryboard(raw: string): CreativeStoryboard {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: Record<string, unknown> | null = null;
  try { parsed = obj(JSON.parse(text)); } catch { /* handled below */ }
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length !== 3) throw new Error("The model did not return a complete three-scene storyboard.");
  const scenes = parsed.scenes.map((value) => {
    const scene = obj(value);
    return { caption: clean(scene?.caption, 84), direction: clean(scene?.direction, 180) };
  });
  if (scenes.some((scene) => !scene.caption || !scene.direction)) throw new Error("The storyboard has an empty caption or scene direction.");
  const headline = clean(parsed.headline, 100);
  const voiceoverDraft = clean(parsed.voiceoverDraft, 650);
  if (!headline || !voiceoverDraft) throw new Error("The storyboard is missing its headline or draft voiceover.");
  return { headline, voiceoverDraft, scenes: scenes as [CreativeScene, CreativeScene, CreativeScene] };
}

/** Explicitly labelled local recovery: no model response or AI-authorship claim. */
export function manualStoryboard(productName: string, brief: string): CreativeStoryboard {
  const first = brief.split(/[.!?]/).map((value) => clean(value, 66)).find(Boolean) ?? productName;
  return {
    headline: `${productName} · editable outline`,
    voiceoverDraft: `Introducing ${productName}. ${first}. Explore ${productName} today.`,
    scenes: [
      { caption: `Meet ${productName}`, direction: "Show the first uploaded image." },
      { caption: first, direction: "Show a second uploaded image if available." },
      { caption: `Explore ${productName}`, direction: "Close on the product or logo." }
    ]
  };
}

/** Limit each caption to two lines for readable mobile-safe ad overlays. */
export function displayCaption(text: string, aspect: Aspect): string {
  const maxChars = aspect === "9:16" ? 21 : 32;
  const words = clean(text, 84).split(/\s+/).filter(Boolean).map((word) => word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word);
  const lines: string[] = [""];
  for (const word of words) {
    let i = lines.length - 1;
    if ((lines[i] ?? "").length && (lines[i]!.length + 1 + word.length) > maxChars && lines.length < 3) {
      lines.push(""); i += 1;
    }
    lines[i] = (lines[i] ? lines[i] + " " : "") + word;
  }
  if (lines.length > 2) {
    const second = lines.slice(1).join(" ");
    lines.splice(1, lines.length - 1, second.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…");
  }
  return lines.join("\n");
}

/** Verify browser-rendered caption PNG size/header before passing it to FFmpeg.
 * Using PNG overlays avoids drawtext/Fontconfig entirely on Windows. */
export function decodeCaptionOverlay(input: unknown, aspect: Aspect): Buffer {
  if (typeof input !== "string" || input.length > 2_200_000) throw new CreativeError("The caption overlay is missing or too large. Reload and try rendering again.", 422, "INVALID_CAPTION_OVERLAY");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match?.[1]) throw new CreativeError("A valid PNG caption overlay is required for every scene.", 422, "INVALID_CAPTION_OVERLAY");
  const bytes = Buffer.from(match[1], "base64");
  const width = aspect === "9:16" ? 720 : 1280;
  const height = aspect === "9:16" ? 1280 : 720;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || bytes.length > 1_550_000 || !bytes.subarray(0, 8).equals(signature)
    || bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) {
    throw new CreativeError("The caption image has the wrong size or format. Reload and try rendering again.", 422, "INVALID_CAPTION_OVERLAY");
  }
  return bytes;
}

/** Render each scene from its selected upload, then concatenate without re-encoding.
 * Captions arrive as transparent browser-generated PNGs; FFmpeg uses no font/text filters.
 * Sequential per-scene FFmpeg calls avoid holding multiple HD streams in RAM. */
async function runFfmpeg(folder: string, imageNames: string[], storyboard: CreativeStoryboard, aspect: Aspect, durationSeconds: 15 | 30): Promise<void> {
  const width = aspect === "9:16" ? 720 : 1280;
  const height = aspect === "9:16" ? 1280 : 720;
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const invoke = async (args: string[], timeoutMs: number): Promise<void> => new Promise<void>((ok, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: folder, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-1400); });
    child.once("error", (error) => { clearTimeout(timer); reject(new Error(`FFmpeg unavailable: ${error.message}. Install FFmpeg on the server.`)); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) ok();
      else reject(new Error(`Video render failed${code === null ? " or timed out" : ` (code ${code})`}: ${stderr.slice(-330) || "Check FFmpeg codec support."}`));
    });
  });
  const segments: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const scene = storyboard.scenes[i]!;
    const chosen = scene.imageIndex ?? (i % imageNames.length);
    const shots = [chosen, ...(scene.secondImageIndex === undefined ? [] : [scene.secondImageIndex])];
    if (shots.some((index) => !Number.isInteger(index) || index < 0 || index >= imageNames.length)) throw new Error("A scene refers to an unavailable photo.");
    const sceneFrames = durationSeconds === 30 ? 250 : 125;
    for (let j = 0; j < shots.length; j += 1) {
      const source = imageNames[shots[j]!]!;
      const frames = Math.floor(sceneFrames / shots.length) + (j < sceneFrames % shots.length ? 1 : 0);
      const filter = `[0:v]split=2[bg][fg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=18:1,eq=brightness=-0.25[back];` +
        `[fg]scale=${Math.round(width * 0.86)}:${Math.round(height * 0.68)}:force_original_aspect_ratio=decrease,format=rgba[front];` +
        `[back][front]overlay=x='(W-w)/2+6*sin(t*0.6)':y='(H-h)/2-${Math.round(height * 0.09)}+5*cos(t*0.5)':eval=frame[composed];` +
        `[composed][1:v]overlay=x=0:y=0:format=auto:shortest=0:repeatlast=1,format=yuv420p[out]`;
      const filename = `scene${i + 1}-${j + 1}.mp4`;
      await invoke(["-loop", "1", "-framerate", "25", "-i", source, "-i", `caption${i + 1}.png`,
        "-filter_complex", filter, "-map", "[out]", "-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-threads", "2", "-pix_fmt", "yuv420p", filename], 100_000);
      segments.push(filename);
    }
  }
  await writeFile(join(folder, "concat.txt"), segments.map((name) => `file '${name}'`).join("\n") + "\n", { mode: 0o600 });
  await invoke(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", "video.partial.mp4"], 30_000);
  const output = join(folder, "video.partial.mp4");
  if ((await stat(output)).size < 4096) throw new Error("FFmpeg did not produce a valid-sized video file.");
  await rename(output, join(folder, "video.mp4"));
}

export function registerCreativeStudio(app: Express, config: AppConfig, provider: InferenceProvider): void {
  const enabled = process.env.AUVRA_CREATIVE_ENABLED === "true";
  const root = resolve(process.env.AUVRA_CREATIVE_DIR ?? join(dirname(config.dataFile), "creative"));
  const active = new Set<string>();
  const maxJobs = 20; // Bound stored data for a shared protected demo; production needs per-user quotas.
  const pathFor = (id: string) => join(root, id);
  const load = async (id: string): Promise<CreativeJob> => {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id)) throw new CreativeError("Video project not found.", 404, "NOT_FOUND");
    try { return JSON.parse(await readFile(join(pathFor(id), "job.json"), "utf8")) as CreativeJob; }
    catch { throw new CreativeError("Video project not found.", 404, "NOT_FOUND"); }
  };
  const save = async (job: CreativeJob) => {
    job.updatedAt = new Date().toISOString();
    const dir = pathFor(job.id);
    const temp = join(dir, `job.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(job, null, 2), { mode: 0o600 });
    await rename(temp, join(dir, "job.json"));
  };
  const guarded = (handler: (request: import("express").Request, response: import("express").Response) => Promise<void>) =>
    (request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
      if (!enabled) { response.status(503).json({ error: { code: "CREATIVE_DISABLED", message: "Creative Studio is disabled on this demo. Set AUVRA_CREATIVE_ENABLED=true to enable it." } }); return; }
      void handler(request, response).catch((error: unknown) => {
        if (error instanceof CreativeError) { response.status(error.statusCode).json({ error: { code: error.code, message: error.message } }); return; }
        next(error);
      });
    };

  app.get("/api/creative/status", (_request, response) => response.json({ enabled, mode: "photo_motion_mp4", externalGeneration: false, externalRenderCostUsd: 0, requiresInternet: true }));
  app.get("/api/creative/projects", guarded(async (_request, response) => {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const projects: Array<Pick<CreativeJob, "id" | "productName" | "createdAt" | "status" | "inferenceCostUsd">> = [];
    for (const entry of entries.filter((item) => item.isDirectory()).slice(0, maxJobs)) {
      try {
        const saved = await load(entry.name);
        projects.push({ id: saved.id, productName: saved.productName, createdAt: saved.createdAt, status: saved.status === "rendering" && !active.has(saved.id) ? "storyboard_ready" : saved.status, inferenceCostUsd: saved.inferenceCostUsd });
      } catch { /* Skip incomplete workspace directories. */ }
    }
    projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    response.json(projects.slice(0, 12));
  }));
  app.post("/api/creative/storyboard", guarded(async (request, response) => {
    const input = obj(request.body);
    const productName = clean(input?.productName, 100);
    const brief = clean(input?.brief, 2500);
    const audience = clean(input?.audience, 120);
    const aspectRatio: Aspect = input?.aspectRatio === "16:9" ? "16:9" : "9:16";
    const durationSeconds: 15 | 30 = input?.durationSeconds === 30 ? 30 : 15;
    const inferenceBudgetUsd = input?.inferenceBudgetUsd;
    const model = typeof input?.model === "string" ? input.model.trim() : "";
    const available = [...new Set([config.provider.model, ...(config.provider.models ?? [])])].slice(0, 4);
    if (productName.length < 2 || brief.length < 15 || audience.length < 2) throw new CreativeError("Enter the product, audience and a brief of at least 15 characters.", 422, "INVALID_BRIEF");
    if (typeof inferenceBudgetUsd !== "number" || !Number.isFinite(inferenceBudgetUsd) || inferenceBudgetUsd < 0.01 || inferenceBudgetUsd > 5) throw new CreativeError("Set an inference allowance between $0.01 and $5.", 422, "INVALID_BUDGET");
    if (model && !available.includes(model)) throw new CreativeError("Select a model from your configured Orbio pool.", 422, "MODEL_NOT_CONFIGURED");
    const incomingImages = Array.isArray(input?.imageDataUrls) ? input.imageDataUrls : input?.imageDataUrl ? [input.imageDataUrl] : [];
    if (incomingImages.length < 1 || incomingImages.length > MAX_IMAGES) throw new CreativeError("Upload 1–6 product photos or screenshots.", 422, "INVALID_IMAGE_COUNT");
    const images = incomingImages.map(imageData);
    const reserve = config.preflightCostUsd * Math.min(4, available.length);
    if (reserve > inferenceBudgetUsd) throw new CreativeError("The AI allowance does not cover the conservative call reserve.", 422, "BUDGET_TOO_LOW");
    if (active.size) throw new CreativeError("Another Creative Studio operation is running. Try again shortly.", 429, "CREATIVE_BUSY");
    // Keep this slot through the provider response, not just until directory creation.
    // Shared demo: prevent concurrent inference and unbounded uploads.
    active.add("planning");
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      if ((await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length >= maxJobs) throw new CreativeError("This shared demo has reached its creative-project limit. Archive older projects before continuing.", 507, "STORAGE_LIMIT");
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const imageNames = images.map((image, i) => `product${i + 1}.${image.ext}`);
      const job: CreativeJob = { id, status: "storyboard_ready", createdAt, updatedAt: createdAt, productName, brief, audience, aspectRatio, durationSeconds, servingModel: model || config.provider.model, tokenUsage: { input: 0, output: 0, total: 0 }, inferenceCostUsd: null, inferenceBudgetUsd, renderCostUsd: 0, imageName: imageNames[0]!, imageNames, storyboard: null };
      await mkdir(pathFor(id), { recursive: false, mode: 0o700 });
      for (let i = 0; i < images.length; i += 1) {
        await writeFile(join(pathFor(id), imageNames[i]!), images[i]!.bytes, { flag: "wx", mode: 0o600 });
      }
      try {
        const result = await provider.complete({
          messages: [
            { role: "system", content: "You write concise marketing storyboards. Reply with ONLY minified valid JSON, no markdown, in this exact shape: {\"headline\":\"...\",\"voiceoverDraft\":\"...\",\"scenes\":[{\"caption\":\"...\",\"direction\":\"...\"},{\"caption\":\"...\",\"direction\":\"...\"},{\"caption\":\"...\",\"direction\":\"...\"}]}. Three scenes only. Under 180 words total. Each caption <= 55 characters. Scene 1 hook; scene 2 a brief-supported benefit; scene 3 CTA. Photos are not visible to you. Video uses supplied photos and captions; directions must use only pan, crop or zoom. Do not invent claims. Voiceover is text only." },
            { role: "user", content: `Product: ${productName}\nAudience: ${audience}\nBrief: ${brief}\nFormat: ${aspectRatio}\nDuration: ${durationSeconds}s\nImages available: ${images.length} (not visible to model). Return JSON only.` }
          ],
          tools: [],
          maxOutputTokens: 2048,
          ...(model ? { preferredModel: model } : {}),
          temperature: 0.1
        });
        job.servingModel = result.model;
        job.tokenUsage = result.usage;
        job.inferenceCostUsd = result.actualCostUsd;
        if (result.actualCostUsd === null) throw new Error("Orbio omitted cost metadata; the charge is unknown. No automatic retry was made.");
        if (result.actualCostUsd > inferenceBudgetUsd) throw new Error("Provider-reported inference cost exceeded the selected allowance. No additional call was made.");
        if (!result.text.trim() || ["length", "max_tokens"].includes(result.finishReason ?? "")) throw new Error("Orbio stopped before completing the storyboard (output length). No automatic retry was made.");
        job.storyboard = parseCreativeStoryboard(result.text);
        job.storyboardSource = "ai";
      } catch (error) {
        // A usable manual outline, not a fabricated AI result. No second paid call.
        job.storyboard = manualStoryboard(productName, brief);
        job.storyboardSource = "manual_fallback";
        job.error = `${error instanceof Error ? error.message.slice(0, 220) : "Orbio could not finish the storyboard."} An editable local outline is available instead. It was not written by AI; review every caption before rendering.`;
      }
      for (let i = 0; i < 3; i += 1) {
        job.storyboard!.scenes[i]!.imageIndex = i % images.length;
        if (images.length > 3) job.storyboard!.scenes[i]!.secondImageIndex = (i + 3) % images.length;
      }
      await save(job);
      response.status(201).json(job);
    } finally { active.delete("planning"); }
  }));

  // Recover v1 failed projects (including a paid but incomplete provider response) locally,
  // without re-running Orbio or discarding the uploaded image.
  app.post("/api/creative/:id/manual-storyboard", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    if (job.status !== "failed" || job.storyboard || active.size) throw new CreativeError("This project does not need a manual outline.", 409, "RECOVERY_UNAVAILABLE");
    job.storyboard = manualStoryboard(job.productName, job.brief);
    job.storyboardSource = "manual_fallback";
    job.status = "storyboard_ready";
    job.error = `${job.error ?? "The model did not finish."} This is a locally prepared outline, not AI-generated. Review captions and images before approving the render; no new inference request was sent.`;
    job.imageNames = job.imageNames?.length ? job.imageNames : [job.imageName];
    job.storyboard.scenes.forEach((scene, i) => { scene.imageIndex = i % job.imageNames!.length; if (job.imageNames!.length > 3) scene.secondImageIndex = (i + 3) % job.imageNames!.length; });
    await save(job);
    response.json(job);
  }));

  app.get("/api/creative/:id/images/:index", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    const names = job.imageNames?.length ? job.imageNames : [job.imageName];
    const index = Number(request.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= names.length) throw new CreativeError("Image not found.", 404, "IMAGE_NOT_FOUND");
    const name = names[index]!;
    const file = join(pathFor(job.id), name);
    if (!(await stat(file).catch(() => null))) throw new CreativeError("Image not found.", 404, "IMAGE_NOT_FOUND");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".png") ? "image/png" : "image/webp");
    response.sendFile(file);
  }));

  app.get("/api/creative/:id", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    if (job.status === "rendering" && !active.has(job.id)) { job.status = "storyboard_ready"; job.error = "Rendering was interrupted by a server restart. You can approve a new local render without paying for the storyboard again."; await save(job); }
    response.json(job);
  }));
  app.patch("/api/creative/:id/storyboard", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    if (job.status !== "storyboard_ready" || !job.storyboard || active.has(job.id)) throw new CreativeError("The storyboard is no longer editable.", 409, "NOT_EDITABLE");
    const incoming = obj(request.body);
    const scenes = incoming?.scenes;
    const indexes = incoming?.imageIndexes;
    const secondIndexes = incoming?.secondImageIndexes;
    const images = job.imageNames?.length ? job.imageNames : [job.imageName];
    if (!Array.isArray(scenes) || scenes.length !== 3 || scenes.some((caption) => typeof caption !== "string" || !clean(caption, 84))) throw new CreativeError("Enter three nonempty captions.", 422, "INVALID_CAPTIONS");
    if (!Array.isArray(indexes) || indexes.length !== 3 || indexes.some((value) => !Number.isInteger(value) || value < 0 || value >= images.length)) throw new CreativeError("Select one uploaded image for each scene.", 422, "INVALID_SCENE_IMAGES");
    if (!Array.isArray(secondIndexes) || secondIndexes.length !== 3 || secondIndexes.some((value) => value !== null && (!Number.isInteger(value) || value < 0 || value >= images.length))) throw new CreativeError("Select a valid optional second photo for each scene.", 422, "INVALID_SECOND_IMAGES");
    job.storyboard.scenes = job.storyboard.scenes.map((scene, i) => {
      const { secondImageIndex: _old, ...rest } = scene;
      return { ...rest, caption: clean(scenes[i], 84), imageIndex: indexes[i] as number, ...(secondIndexes[i] === null ? {} : { secondImageIndex: secondIndexes[i] as number }) };
    }) as CreativeStoryboard["scenes"];
    await save(job);
    response.json(job);
  }));
  app.post("/api/creative/:id/render", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    if (job.status === "completed") { response.json(job); return; }
    if (job.status !== "storyboard_ready" || !job.storyboard) throw new CreativeError("Review a complete storyboard before rendering.", 409, "STORYBOARD_REQUIRED");
    const overlays = obj(request.body)?.captionOverlays;
    if (!Array.isArray(overlays) || overlays.length !== 3) throw new CreativeError("Three caption overlays are required. Reload the page and approve again; your storyboard is preserved.", 422, "CAPTIONS_REQUIRED");
    const captionPngs = overlays.map((value) => decodeCaptionOverlay(value, job.aspectRatio));
    if (active.size) throw new CreativeError("Another Creative Studio operation is running. Try again shortly.", 429, "CREATIVE_BUSY");
    active.add(job.id);
    try {
      for (let i = 0; i < captionPngs.length; i += 1) await writeFile(join(pathFor(job.id), `caption${i + 1}.png`), captionPngs[i]!, { mode: 0o600 });
    } catch (error) { active.delete(job.id); throw error; }
    job.status = "rendering";
    delete job.error;
    await save(job);
    response.status(202).json(job);
    void (async () => {
      try {
        await runFfmpeg(pathFor(job.id), job.imageNames?.length ? job.imageNames : [job.imageName], job.storyboard!, job.aspectRatio, job.durationSeconds ?? 15);
        job.status = "completed";
        delete job.error;
        job.videoUrl = `/api/creative/${job.id}/video`;
      } catch (error) {
        job.status = "storyboard_ready";
        job.error = error instanceof Error ? error.message.slice(0, 400) : "Rendering failed.";
      } finally {
        try { await save(job); } finally { active.delete(job.id); }
      }
    })().catch((error: unknown) => console.error("Auvra creative render status persistence failed", error));
  }));
  app.get("/api/creative/:id/video", guarded(async (request, response) => {
    const job = await load(request.params.id as string);
    if (job.status !== "completed") throw new CreativeError("The video is not ready.", 409, "VIDEO_NOT_READY");
    const file = join(pathFor(job.id), "video.mp4");
    if ((await stat(file).catch(() => null)) === null) throw new CreativeError("The rendered video file is unavailable on this server.", 404, "VIDEO_MISSING");
    response.setHeader("Cache-Control", "private, no-store");
    response.type("video/mp4");
    response.sendFile(file);
  }));
}
