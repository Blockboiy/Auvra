import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import type { CreativePlan } from "@auvra/shared";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

export interface FinishingRenderInput {
  plan: CreativePlan;
  generatedClips: Array<{ shotId: string; path: string }>;
  narrationPath?: string;
  logoPath?: string;
}

export interface FinishingRenderer {
  render(input: FinishingRenderInput): Promise<Buffer>;
}

const entryPoint = () => {
  const candidates = [resolve(process.cwd(), "apps/video/src/index.ts"), resolve(process.cwd(), "../video/src/index.ts")];
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("The Auvra video composition entry point could not be found.");
  return selected;
};

export class RemotionFinishingRenderer implements FinishingRenderer {
  async render(input: FinishingRenderInput): Promise<Buffer> {
    const directory = await mkdtemp(join(tmpdir(), "auvra-finish-"));
    const publicDir = join(directory, "public");
    await mkdir(publicDir, { recursive: true });
    try {
      const generatedClipSources: Record<string, string> = {};
      for (const [index, clip] of input.generatedClips.entries()) {
        const name = `shot-${index}${extname(clip.path) || ".mp4"}`;
        await copyFile(clip.path, join(publicDir, name));
        generatedClipSources[clip.shotId] = name;
      }
      const optional = async (path: string | undefined, prefix: string) => {
        if (!path) return undefined;
        const name = `${prefix}${extname(path)}`;
        await copyFile(path, join(publicDir, name));
        return name;
      };
      const voiceoverSource = await optional(input.narrationPath, "narration");
      const logoSource = await optional(input.logoPath, "logo");
      const props = { plan: input.plan, generatedClipSources, ...(voiceoverSource ? { voiceoverSource } : {}), ...(logoSource ? { logoSource } : {}) };
      const serveUrl = await bundle({ entryPoint: entryPoint(), publicDir });
      const composition = await selectComposition({ serveUrl, id: "Creative-Finishing", inputProps: props });
      const output = join(directory, "final.mp4");
      await renderMedia({ serveUrl, composition, inputProps: props, codec: "h264", outputLocation: output });
      return await readFile(output);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
