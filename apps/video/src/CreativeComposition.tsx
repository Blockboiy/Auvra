import type { CreativePlan, CreativeShot } from "@auvra/shared";
import { AbsoluteFill, Series } from "remotion";
import { Video } from "@remotion/media";
import { CTAEndCard, ConnectedFlow, GradientField, HeroStatement, KineticWords, MetricCounter, ProductCard, UIFrame } from "./primitives";

const ShotScene = ({ shot, plan, generatedClipSource }: { shot: CreativeShot; plan: CreativePlan; generatedClipSource?: string }) => {
  const copy = shot.exactCopy.length ? shot.exactCopy : [shot.purpose];
  const accent = plan.brandSystem.accentColors[0] ?? plan.brandSystem.primaryColor;
  return <AbsoluteFill style={{ fontFamily: "Inter, Arial, sans-serif" }}>{generatedClipSource ? <Video src={generatedClipSource} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <GradientField primary={plan.brandSystem.primaryColor} accent={accent} />}<AbsoluteFill style={{ padding: plan.aspectRatio === "9:16" ? "150px 90px" : "100px 120px", justifyContent: "center", background: generatedClipSource ? "linear-gradient(90deg, #090712CC, transparent 75%)" : undefined }}>
    {shot.order === 1 ? <HeroStatement copy={copy[0]!} accent={accent} /> : shot.order === plan.shots.length ? <CTAEndCard cta={plan.closingCTA ?? copy[0]!} /> : <UIFrame><div style={{ display: "grid", gap: 42 }}><KineticWords words={[shot.purpose]} />{copy.length > 1 ? <ConnectedFlow labels={copy.slice(0, 4)} /> : <ProductCard title={copy[0]!} body={shot.visualConcept} />}{copy.find((item) => /\d/.test(item)) ? <MetricCounter value={copy.find((item) => /\d/.test(item))!} label="Exact product proof" /> : null}</div></UIFrame>}
  </AbsoluteFill></AbsoluteFill>;
};

export type CreativeCompositionProps = { plan: CreativePlan; generatedClipSources?: Record<string, string> };
export const CreativeComposition = ({ plan, generatedClipSources = {} }: CreativeCompositionProps) => <AbsoluteFill><Series>{plan.shots.map((shot) => <Series.Sequence key={shot.id} name={`Shot ${shot.order}: ${shot.purpose}`} durationInFrames={Math.round(shot.durationSeconds * 30)} premountFor={30}><ShotScene shot={shot} plan={plan} {...(generatedClipSources[shot.id] ? { generatedClipSource: generatedClipSources[shot.id] } : {})} /></Series.Sequence>)}</Series></AbsoluteFill>;
