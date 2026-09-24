export type CreativeAspect = "9:16" | "16:9";
export interface CreativeScene { caption: string; direction: string; imageIndex?: number; secondImageIndex?: number; }
export interface CreativeStoryboard { headline: string; voiceoverDraft: string; scenes: [CreativeScene, CreativeScene, CreativeScene]; }
export interface CreativeJob {
  id: string;
  status: "storyboard_ready" | "rendering" | "completed" | "failed";
  productName: string;
  brief: string;
  audience: string;
  aspectRatio: CreativeAspect;
  durationSeconds?: 15 | 30;
  servingModel: string;
  tokenUsage: { input: number; output: number; total: number };
  inferenceCostUsd: number | null;
  inferenceBudgetUsd: number;
  renderCostUsd: 0;
  imageName: string;
  imageNames?: string[];
  storyboardSource?: "ai" | "manual_fallback";
  storyboard: CreativeStoryboard | null;
  error?: string;
  videoUrl?: string;
}
export interface CreativeInput {
  productName: string;
  brief: string;
  audience: string;
  aspectRatio: CreativeAspect;
  durationSeconds: 15 | 30;
  inferenceBudgetUsd: number;
  model?: string;
  imageDataUrls: string[];
}

export interface CreativeProjectSummary {
  id: string; productName: string; createdAt: string; status: CreativeJob["status"]; inferenceCostUsd: number | null;
}
