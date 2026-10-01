import type { VideoGenerationStatus } from "@auvra/shared";

type Fetch = typeof fetch;
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const cost = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

export interface SubmitVideoRequest { model: string; prompt: string; durationSeconds: number; aspectRatio: string; resolution: string; audio: boolean; }
export interface VideoJobResult { id: string; status: VideoGenerationStatus; usageCostUsd?: number; outputs: number; error?: { code: string; message: string }; }
export interface VideoProvider {
  submitVideo(request: SubmitVideoRequest): Promise<{ jobId: string; status: VideoGenerationStatus }>;
  getVideoJob(jobId: string): Promise<VideoJobResult>;
  downloadVideo(jobId: string, index: number): Promise<Response>;
}

export class VideoProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable = false) { super(message); this.name = "VideoProviderError"; }
}

export function validateJobId(jobId: string): string {
  if (!JOB_ID.test(jobId)) throw new VideoProviderError("Provider returned an invalid video job identifier.", "INVALID_JOB_ID");
  return jobId;
}

export function normalizeVideoProviderError(status: number, payload: unknown): VideoProviderError {
  const root = record(payload); const nested = record(root?.error); const raw = typeof nested?.message === "string" ? nested.message : typeof root?.message === "string" ? root.message : "";
  const message = raw.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/sk-[\w-]+/gi, "[redacted]").slice(0, 240);
  if (status === 401 || status === 403) return new VideoProviderError("Orbio rejected the server credentials.", "AUTHENTICATION_ERROR");
  if (status === 402 || /credit|balance|payment/i.test(message)) return new VideoProviderError("The Orbio account has insufficient video-generation credit.", "INSUFFICIENT_CREDITS");
  if (/pricing_unavailable/i.test(message)) return new VideoProviderError("Orbio has no usable price for this video configuration.", "PRICING_UNAVAILABLE");
  if (status === 429) return new VideoProviderError("Orbio rate-limited video status access.", "RATE_LIMITED", true);
  if (status >= 500) return new VideoProviderError("The Orbio video gateway is temporarily unavailable.", "GATEWAY_ERROR", true);
  return new VideoProviderError(message ? `Orbio rejected the video request: ${message}` : `Orbio video request failed with HTTP ${status}.`, "VIDEO_PROVIDER_ERROR");
}

const normalizeStatus = (value: unknown): VideoGenerationStatus => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (["pending", "queued"].includes(normalized)) return "pending";
  if (["in_progress", "processing", "running"].includes(normalized)) return "in_progress";
  if (["completed", "succeeded", "success"].includes(normalized)) return "completed";
  if (["failed", "cancelled", "expired"].includes(normalized)) return normalized as VideoGenerationStatus;
  return "pending";
};

export class OrbioVideoProvider implements VideoProvider {
  private readonly baseUrl: string;
  constructor(private readonly configuration: { apiKey: string; baseUrl: string; timeoutMs: number }, private readonly fetcher: Fetch = fetch) {
    this.baseUrl = configuration.baseUrl.replace(/\/$/, "");
  }
  private headers(json = false) { return { Authorization: `Bearer ${this.configuration.apiKey}`, Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}) }; }
  async submitVideo(request: SubmitVideoRequest) {
    if (!this.configuration.apiKey) throw new VideoProviderError("Orbio video generation is not configured.", "NOT_CONFIGURED");
    const response = await this.fetcher(`${this.baseUrl}/videos`, { method: "POST", headers: this.headers(true), body: JSON.stringify({ model: request.model, prompt: request.prompt, duration: request.durationSeconds, aspect_ratio: request.aspectRatio, resolution: request.resolution, audio: request.audio }), signal: AbortSignal.timeout(this.configuration.timeoutMs) });
    const payload = await response.json().catch(() => undefined); if (!response.ok) throw normalizeVideoProviderError(response.status, payload);
    const root = record(payload); const job = record(root?.data) ?? root; const rawId = job?.id ?? job?.job_id;
    if (typeof rawId !== "string") throw new VideoProviderError("Orbio returned no persistent video job identifier.", "INVALID_RESPONSE");
    return { jobId: validateJobId(rawId), status: normalizeStatus(job?.status) };
  }
  async getVideoJob(jobId: string): Promise<VideoJobResult> {
    const id = validateJobId(jobId);
    // Provider-returned polling URLs are intentionally ignored.
    const response = await this.fetcher(`${this.baseUrl}/videos/${encodeURIComponent(id)}`, { headers: this.headers(), signal: AbortSignal.timeout(this.configuration.timeoutMs) });
    const payload = await response.json().catch(() => undefined); if (!response.ok) throw normalizeVideoProviderError(response.status, payload);
    const root = record(payload); const job = record(root?.data) ?? root; const usage = record(job?.usage) ?? record(root?.usage); const outputs = Array.isArray(job?.outputs) ? job.outputs.length : Array.isArray(job?.videos) ? job.videos.length : 1;
    const usageCostUsd = cost(usage?.cost);
    return { id, status: normalizeStatus(job?.status), ...(usageCostUsd === undefined ? {} : { usageCostUsd }), outputs };
  }
  async downloadVideo(jobId: string, index: number) {
    const id = validateJobId(jobId); if (!Number.isInteger(index) || index < 0 || index > 20) throw new VideoProviderError("Invalid video output index.", "INVALID_OUTPUT_INDEX");
    // Always reconstruct against the configured gateway; never follow arbitrary content_url fields.
    const response = await this.fetcher(`${this.baseUrl}/videos/${encodeURIComponent(id)}/content?index=${index}`, { headers: this.headers(), redirect: "error", signal: AbortSignal.timeout(this.configuration.timeoutMs) });
    if (!response.ok) { const payload = await response.json().catch(() => undefined); throw normalizeVideoProviderError(response.status, payload); }
    return response;
  }
}
