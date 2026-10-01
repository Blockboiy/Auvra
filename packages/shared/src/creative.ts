export type CreativeAspectRatio = "16:9" | "9:16";
export type CreativeAssetRole = "source" | "logo" | "wordmark" | "reference_video" | "audio";
export type CreativeVisualMode = "motion_graphic" | "generative_video" | "product_proof" | "hybrid";
export type VideoGenerationStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";

export interface CreativeAsset {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  size: number;
  role: CreativeAssetRole;
  createdAt: string;
  analysisStatus: "pending" | "completed" | "unavailable" | "failed";
}

export interface BrandSystem {
  primaryColor: string;
  accentColors: string[];
  backgroundPreference: "light" | "dark" | "adaptive";
  logoAssetId?: string;
  wordmarkAssetId?: string;
  typographyDirection: string;
  cornerLanguage: string;
  visualKeywords: string[];
  prohibitedMutations: string[];
}

export interface CreativeBrief {
  objective: string;
  audience: string;
  keyMessage: string;
  cta?: string;
  durationSeconds: 15 | 30;
  aspectRatio: CreativeAspectRatio;
  toneNotes: string;
  referenceAssetId?: string;
  qualityTarget: "standard" | "premium";
}

export interface AssetInsight {
  assetId: string;
  visibleCopy: string[];
  keyMetrics: string[];
  productConcepts: string[];
  uiHierarchy: string[];
  visualMotifs: string[];
  likelyBrandColors: string[];
  logoPresent: boolean;
  mustRemainExact: string[];
  mayReimagine: string[];
  analysisNote?: string;
}

export interface CreativeShot {
  id: string;
  order: number;
  purpose: string;
  durationSeconds: number;
  exactCopy: string[];
  visualConcept: string;
  visualMode: CreativeVisualMode;
  assetRefs: string[];
  motionDirection: string;
  transitionIn: string;
  transitionOut: string;
  generativePrompt?: string;
  recommendedCapability?: string;
  audioCue?: string;
  brandConstraints: string[];
  generativeReason?: string;
  allowGenerativeVideo: boolean;
}

export interface CreativeAudioPlan {
  musicBed?: string;
  foley: string[];
  uiCues: string[];
  transitions: string[];
  voiceover?: string;
}

export interface CreativePlan {
  version: number;
  conceptTitle: string;
  conceptSummary: string;
  openingHook: string;
  narrativeArc: string;
  brandSystem: BrandSystem;
  durationSeconds: 15 | 30;
  aspectRatio: CreativeAspectRatio;
  shots: CreativeShot[];
  audioPlan: CreativeAudioPlan;
  closingCTA?: string;
  qualityRisks: string[];
  createdAt: string;
}

export interface CreativeQuoteItem {
  shotId: string;
  mode: CreativeVisualMode;
  model?: string;
  seconds: number;
  estimatedProviderCostUsd: number;
  reservedCostUsd: number;
  quoteUnavailable?: boolean;
  reason?: string;
}

export interface CreativeQuote {
  id: string;
  projectId: string;
  planFingerprint: string;
  version: number;
  items: CreativeQuoteItem[];
  estimatedProviderCostUsd: number;
  reservedCostUsd: number;
  deterministicProviderCostUsd: 0;
  safetyMultiplier: number;
  pricingAsOf: string;
  status: "pending" | "approved" | "invalidated";
  createdAt: string;
  approvedAt?: string;
}

export interface VideoGeneration {
  id: string;
  projectId: string;
  shotId: string;
  model: string;
  provider: "Orbio";
  upstreamJobId?: string;
  request: Record<string, unknown>;
  status: VideoGenerationStatus;
  submittedAt?: string;
  lastPolledAt?: string;
  completedAt?: string;
  attempt: number;
  quotedCostUsd: number;
  reservedCostUsd: number;
  actualProviderCostUsd?: number;
  costStatus: "reserved" | "verified" | "unverified";
  outputAssetId?: string;
  outputStorageKey?: string;
  providerError?: { code: string; message: string };
}

export interface CreativeEvent {
  id: string;
  projectId: string;
  type: string;
  at: string;
  data?: Record<string, unknown>;
}

export interface CreativeProject {
  id: string;
  name: string;
  brief: CreativeBrief;
  brandSystem: BrandSystem;
  assets: CreativeAsset[];
  insights: AssetInsight[];
  plan?: CreativePlan;
  quotes: CreativeQuote[];
  generations: VideoGeneration[];
  events: CreativeEvent[];
  outputAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoModelProfile {
  id: string;
  enabled: boolean;
  provider: "Orbio";
  capabilities: {
    durations: number[] | { min: number; max: number };
    aspectRatios: Array<CreativeAspectRatio | "1:1">;
    resolutions: string[];
    audio: boolean;
    imageConditioning: boolean;
    presenter: boolean;
  };
  pricing: { asOf: string; conservative: boolean; note: string };
  reasonUnavailable?: string;
}

export interface CreateCreativeProjectInput {
  name: string;
  brief: CreativeBrief;
  brandSystem?: Partial<BrandSystem>;
}
