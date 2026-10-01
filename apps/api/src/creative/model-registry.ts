import type { CreativeAspectRatio, CreativeShot, VideoModelProfile } from "@auvra/shared";

export const VIDEO_PRICING_AS_OF = "2026-10-01";

type PriceContext = { durationSeconds: number; aspectRatio: CreativeAspectRatio; resolution: "720p" | "1080p"; audio: boolean };
type InternalProfile = VideoModelProfile & { quote: (context: PriceContext) => number | null };

const perSecond = (rates: Partial<Record<`${"720p" | "1080p"}:${"audio" | "silent"}`, number>>) =>
  (context: PriceContext): number | null => {
    const rate = rates[`${context.resolution}:${context.audio ? "audio" : "silent"}`];
    return rate === undefined ? null : Number((rate * context.durationSeconds).toFixed(6));
  };

export const videoModelRegistry: readonly InternalProfile[] = [
  {
    id: "google/veo-3.1-lite", enabled: true, provider: "Orbio",
    capabilities: { durations: [4, 6, 8], aspectRatios: ["16:9", "9:16"], resolutions: ["720p", "1080p"], audio: true, imageConditioning: true, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: true, note: "OpenRouter face-value rate; local safety reserve applies." },
    quote: perSecond({ "720p:silent": 0.03, "720p:audio": 0.05, "1080p:silent": 0.05, "1080p:audio": 0.08 })
  },
  {
    id: "google/veo-3.1-fast", enabled: true, provider: "Orbio",
    capabilities: { durations: [4, 6, 8], aspectRatios: ["16:9", "9:16"], resolutions: ["720p"], audio: true, imageConditioning: true, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: true, note: "Only trusted 720p configurations are quoteable." },
    quote: perSecond({ "720p:silent": 0.08, "720p:audio": 0.10 })
  },
  {
    id: "runway/gen-4.5", enabled: true, provider: "Orbio",
    capabilities: { durations: { min: 2, max: 10 }, aspectRatios: ["16:9", "9:16"], resolutions: ["720p"], audio: false, imageConditioning: true, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: true, note: "720p face-value rate." }, quote: perSecond({ "720p:silent": 0.12 })
  },
  {
    id: "kwaivgi/kling-v3.0-pro", enabled: true, provider: "Orbio",
    capabilities: { durations: { min: 3, max: 15 }, aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["720p"], audio: true, imageConditioning: true, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: true, note: "Face-value rate, audio priced separately." }, quote: perSecond({ "720p:silent": 0.112, "720p:audio": 0.168 })
  },
  {
    id: "alibaba/wan-3.0-prime", enabled: true, provider: "Orbio",
    capabilities: { durations: { min: 1, max: 15 }, aspectRatios: ["16:9", "9:16"], resolutions: ["720p"], audio: false, imageConditioning: true, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: false, note: "Starting price is not a trusted upper bound; quote unavailable." }, quote: () => null
  },
  {
    id: "heygen/heygen-video-1", enabled: true, provider: "Orbio",
    capabilities: { durations: { min: 1, max: 30 }, aspectRatios: ["16:9", "9:16"], resolutions: ["720p"], audio: true, imageConditioning: false, presenter: true },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: false, note: "Reserved for presenter workflows; no trusted V1 quote." }, quote: () => null
  },
  ...["bytedance/seedance-2.5", "bytedance/seedance-2.0-mini", "bytedance/seedance-2.0-fast"].map((id): InternalProfile => ({
    id, enabled: false, provider: "Orbio",
    capabilities: { durations: { min: 1, max: 15 }, aspectRatios: ["16:9", "9:16"], resolutions: [], audio: false, imageConditioning: false, presenter: false },
    pricing: { asOf: VIDEO_PRICING_AS_OF, conservative: false, note: "No quote: Orbio reports pricing_unavailable." },
    reasonUnavailable: "Orbio POST /videos currently reports pricing_unavailable.", quote: () => null
  }))
];

export const publicVideoModels = (): VideoModelProfile[] => videoModelRegistry.map(({ quote: _quote, ...profile }) => profile);

const supportsDuration = (profile: InternalProfile, seconds: number) => Array.isArray(profile.capabilities.durations)
  ? profile.capabilities.durations.includes(seconds)
  : seconds >= profile.capabilities.durations.min && seconds <= profile.capabilities.durations.max;

export function quoteModel(model: string, context: PriceContext): number | null {
  const profile = videoModelRegistry.find((candidate) => candidate.id === model);
  if (!profile?.enabled || !profile.capabilities.aspectRatios.includes(context.aspectRatio) || !profile.capabilities.resolutions.includes(context.resolution)) return null;
  if (!supportsDuration(profile, context.durationSeconds) || (context.audio && !profile.capabilities.audio)) return null;
  return profile.quote(context);
}

export function routeShot(shot: CreativeShot, aspectRatio: CreativeAspectRatio, quality: "standard" | "premium") {
  if (!shot.allowGenerativeVideo || !["generative_video", "hybrid"].includes(shot.visualMode)) return { kind: "deterministic" as const };
  const candidates = quality === "premium"
    ? ["runway/gen-4.5", "kwaivgi/kling-v3.0-pro", "google/veo-3.1-lite", "google/veo-3.1-fast"]
    : ["google/veo-3.1-lite", "google/veo-3.1-fast", "runway/gen-4.5", "kwaivgi/kling-v3.0-pro"];
  const exact = candidates.find((model) => quoteModel(model, { durationSeconds: shot.durationSeconds, aspectRatio, resolution: "720p", audio: false }) !== null);
  return exact ? { kind: "generative" as const, model: exact, resolution: "720p" as const, audio: false } : { kind: "unquoteable" as const, reason: "No enabled model has a trusted price and compatible duration/aspect ratio." };
}

// Generic /models prompt/completion zeros are deliberately absent from this module.
// Video quotes are derived only from this reviewed, versioned registry.
