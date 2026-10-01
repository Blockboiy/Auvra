import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const ink = "#F7F5FF";

export const GradientField = ({ primary = "#6D35F7", accent = "#9B7CFF" }: { primary?: string; accent?: string }) => {
  const frame = useCurrentFrame(); const { durationInFrames } = useVideoConfig();
  return <AbsoluteFill style={{ background: `radial-gradient(circle at ${25 + interpolate(frame, [0, durationInFrames], [0, 18], clamp)}% 25%, ${accent}55, transparent 34%), linear-gradient(140deg, #0C0818, ${primary}33 55%, #090712)`, overflow: "hidden" }}><div style={{ position: "absolute", inset: "8%", border: `1px solid ${accent}24`, borderRadius: 80, opacity: 0.7 }} /></AbsoluteFill>;
};

export const MaskReveal = ({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) => { const frame = useCurrentFrame(); return <div style={{ ...style, clipPath: `inset(0 ${interpolate(frame, [delay, delay + 20], [100, 0], { ...clamp, easing: Easing.bezier(.16, 1, .3, 1) })}% 0 0)` }}>{children}</div>; };
export const ScaleReveal = ({ children, delay = 0 }: { children: ReactNode; delay?: number }) => { const frame = useCurrentFrame(); const { fps } = useVideoConfig(); return <div style={{ opacity: interpolate(frame, [delay, delay + 8], [0, 1], clamp), scale: spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 }, durationInFrames: 28 }) }}>{children}</div>; };
export const StaggeredText = ({ lines }: { lines: string[] }) => <div>{lines.map((line, index) => <MaskReveal key={`${line}-${index}`} delay={index * 7} style={{ fontSize: 54, lineHeight: 1.08, color: ink, fontWeight: 650 }}>{line}</MaskReveal>)}</div>;

export const HeroStatement = ({ copy, accent = "#9B7CFF" }: { copy: string; accent?: string }) => <div style={{ maxWidth: 1500, fontSize: 128, lineHeight: .92, letterSpacing: -6, fontWeight: 720, color: ink }}><MaskReveal>{copy}</MaskReveal><div style={{ height: 8, width: "36%", marginTop: 44, background: accent, borderRadius: 99 }} /></div>;
export const KineticWords = ({ words }: { words: string[] }) => <StaggeredText lines={words} />;

export const MetricCounter = ({ value, label, accent = "#9B7CFF" }: { value: string; label: string; accent?: string }) => { const frame = useCurrentFrame(); return <div style={{ borderLeft: `4px solid ${accent}`, paddingLeft: 28 }}><div style={{ color: ink, fontSize: 96, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: interpolate(frame, [4, 16], [0, 1], clamp) }}>{value}</div><div style={{ color: "#C5BED9", fontSize: 30 }}>{label}</div></div>; };

export const ModelNodes = ({ labels, accent = "#9B7CFF" }: { labels: string[]; accent?: string }) => <div style={{ display: "flex", alignItems: "center", gap: 22 }}>{labels.map((label, index) => <ScaleReveal key={label} delay={index * 6}><div style={{ color: ink, border: `1px solid ${accent}88`, borderRadius: 999, padding: "16px 28px", fontSize: 26, background: "#171027cc" }}>{label}</div></ScaleReveal>)}</div>;
export const ConnectedFlow = ({ labels, accent = "#9B7CFF" }: { labels: string[]; accent?: string }) => <div style={{ display: "flex", alignItems: "center", gap: 16 }}>{labels.map((label, index) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 16 }}><ProductCard title={label} />{index < labels.length - 1 ? <LineDraw color={accent} /> : null}</div>)}</div>;
export const PermissionChips = ({ permissions }: { permissions: string[] }) => <ModelNodes labels={permissions} accent="#43D9AD" />;
export const QuoteCard = ({ quote, attribution }: { quote: string; attribution?: string }) => <div style={{ border: "1px solid #FFFFFF22", borderRadius: 36, padding: 50, background: "#FFFFFF0D", color: ink, maxWidth: 1100 }}><div style={{ fontSize: 52, lineHeight: 1.15 }}>“{quote}”</div>{attribution ? <div style={{ color: "#AFA7C4", fontSize: 24, marginTop: 24 }}>{attribution}</div> : null}</div>;
export const ProductCard = ({ title, body }: { title: string; body?: string }) => <div style={{ border: "1px solid #FFFFFF25", borderRadius: 28, padding: "26px 32px", background: "#151022e8", color: ink, minWidth: 210 }}><div style={{ fontSize: 28, fontWeight: 650 }}>{title}</div>{body ? <div style={{ marginTop: 10, color: "#BFB8D2", fontSize: 20 }}>{body}</div> : null}</div>;
export const DiagramBuild = ({ items }: { items: string[] }) => <ConnectedFlow labels={items} />;
export const Timeline = ({ items }: { items: string[] }) => <div style={{ display: "grid", gap: 22 }}>{items.map((item, index) => <div key={item} style={{ display: "flex", gap: 20, alignItems: "center", color: ink, fontSize: 27 }}><span style={{ color: "#9B7CFF", fontVariantNumeric: "tabular-nums" }}>0{index + 1}</span><LineDraw color="#9B7CFF" /><span>{item}</span></div>)}</div>;
export const UIFrame = ({ children }: { children: ReactNode }) => <div style={{ padding: 18, border: "1px solid #FFFFFF26", borderRadius: 34, background: "#100C1CCC", boxShadow: "0 32px 90px #0008" }}>{children}</div>;
export const LogoLockup = ({ name = "Auvra" }: { name?: string }) => <div style={{ color: ink, fontSize: 54, fontWeight: 740, letterSpacing: -2 }}>{name}<span style={{ color: "#9B7CFF" }}>.</span></div>;
export const CTAEndCard = ({ cta }: { cta: string }) => <div style={{ textAlign: "center" }}><LogoLockup /><div style={{ marginTop: 45, color: ink, fontSize: 74, fontWeight: 650 }}>{cta}</div></div>;
export const LineDraw = ({ color = "#9B7CFF" }: { color?: string }) => { const frame = useCurrentFrame(); return <div style={{ width: interpolate(frame, [0, 22], [0, 90], { ...clamp, easing: Easing.bezier(.16, 1, .3, 1) }), height: 2, background: color }} />; };
