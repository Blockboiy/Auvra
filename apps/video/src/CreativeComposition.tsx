import type { CreativePlan } from "@auvra/shared";
import { Audio, Video } from "@remotion/media";
import { AbsoluteFill, Img, Series, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type CaptionCue = { text: string; startMs: number; endMs: number };
export type CreativeCompositionProps = {
  plan: CreativePlan;
  generatedClipSources?: Record<string, string>;
  voiceoverSource?: string;
  captions?: CaptionCue[];
  logoSource?: string;
};

export const timelineDurationInFrames = (plan: Pick<CreativePlan, "shots">, fps = 30): number => plan.shots.reduce((frames, shot) => frames + Math.round(shot.durationSeconds * fps), 0);

export const captionsFromScript = (script: string, durationSeconds: number): CaptionCue[] => {
  const words = script.trim().split(/\s+/).filter(Boolean); if (!words.length) return [];
  const chunks = Array.from({ length: Math.ceil(words.length / 6) }, (_, index) => words.slice(index * 6, index * 6 + 6).join(" "));
  const durationMs = durationSeconds * 1000;
  return chunks.map((text, index) => ({ text, startMs: Math.round(index * durationMs / chunks.length), endMs: Math.round((index + 1) * durationMs / chunks.length) }));
};

const mediaSource = (source: string) => /^(?:https?:|data:|blob:)/i.test(source) ? source : staticFile(source);

const PrecisionOverlay = ({ plan, captions, logoSource }: { plan: CreativePlan; captions: CaptionCue[]; logoSource: string | undefined }) => {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig(); const nowMs = frame / fps * 1000;
  const caption = plan.finishing?.captionsEnabled ? captions.find((item) => nowMs >= item.startMs && nowMs < item.endMs) : undefined;
  const finishing = plan.finishing;
  const cta = finishing?.ctaEnabled ? finishing.ctaText?.trim() || plan.closingCTA : undefined;
  const showCta = Boolean(cta) && frame >= Math.max(0, plan.durationSeconds * fps - 2 * fps);
  return <AbsoluteFill style={{ fontFamily: "Inter, Arial, sans-serif", pointerEvents: "none" }}>
    {logoSource && finishing?.logoEnabled ? <Img src={mediaSource(logoSource)} style={{ position: "absolute", right: plan.aspectRatio === "9:16" ? 54 : 64, top: 54, width: plan.aspectRatio === "9:16" ? 130 : 150, maxHeight: 72, objectFit: "contain" }} /> : null}
    {showCta ? <div style={{ position: "absolute", left: plan.aspectRatio === "9:16" ? 54 : 64, right: plan.aspectRatio === "9:16" ? 54 : 64, top: 64, color: "white", fontSize: plan.aspectRatio === "9:16" ? 46 : 42, fontWeight: 700, textShadow: "0 2px 18px rgba(0,0,0,.65)" }}>{cta}</div> : null}
    {caption ? <div style={{ position: "absolute", left: "12%", right: "12%", bottom: plan.aspectRatio === "9:16" ? 180 : 88, textAlign: "center", color: "white", fontSize: plan.finishing?.captionStyle === "bold" ? 54 : 42, fontWeight: plan.finishing?.captionStyle === "bold" ? 800 : 650, lineHeight: 1.18, textShadow: "0 3px 20px rgba(0,0,0,.8)" }}>{caption.text}</div> : null}
  </AbsoluteFill>;
};

export const CreativeComposition = ({ plan, generatedClipSources = {}, voiceoverSource, captions = [], logoSource }: CreativeCompositionProps) => {
  const resolvedCaptions = captions.length ? captions : plan.finishing?.captionsEnabled && plan.finishing.voiceoverScript ? captionsFromScript(plan.finishing.voiceoverScript, plan.durationSeconds) : [];
  return <AbsoluteFill style={{ backgroundColor: "#110c21" }}>
    <Series>{[...plan.shots].sort((a, b) => a.order - b.order).map((shot) => { const source = generatedClipSources[shot.id]; return <Series.Sequence key={shot.id} name={`Generated shot ${shot.order}`} durationInFrames={Math.round(shot.durationSeconds * 30)} premountFor={30}>{source ? <Video src={mediaSource(source)} muted={Boolean(voiceoverSource)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: "#a88cff", fontFamily: "Inter, Arial, sans-serif", fontSize: 34 }}>Generated footage</AbsoluteFill>}</Series.Sequence>; })}</Series>
    {voiceoverSource && plan.finishing?.voiceoverEnabled ? <Audio src={mediaSource(voiceoverSource)} /> : null}
    <PrecisionOverlay plan={plan} captions={resolvedCaptions} logoSource={logoSource} />
  </AbsoluteFill>;
};
