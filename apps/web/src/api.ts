import type { ApiError, CreateMissionInput, DashboardSummary, Mission, ProviderStatus } from "@auvra/shared";
import type { CreativeInput, CreativeJob, CreativeProjectSummary } from "./creative-types";

export class ApiClientError extends Error {
  constructor(message: string, readonly code: string, readonly details?: unknown) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (response.status === 401 && !window.location.pathname.startsWith("/demo-login")) {
    window.location.replace("/demo-login");
    return new Promise<T>(() => {});
  }
  const payload = await response.json().catch(() => undefined) as T | ApiError | undefined;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new ApiClientError(error?.message ?? "Auvra could not complete the request.", error?.code ?? "REQUEST_FAILED", error?.details);
  }
  return payload as T;
}

export const api = {
  dashboard: () => request<DashboardSummary>("/dashboard"),
  missions: () => request<Mission[]>("/missions"),
  mission: (id: string) => request<Mission>(`/missions/${encodeURIComponent(id)}`),
  createMission: (input: CreateMissionInput) => request<Mission>("/missions", { method: "POST", body: JSON.stringify(input) }),
  startMission: (id: string) => request<Mission>(`/missions/${encodeURIComponent(id)}/start`, { method: "POST" }),
  cancelMission: (id: string) => request<Mission>(`/missions/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  providerStatus: () => request<ProviderStatus>("/provider/status"),
  creativeStatus: () => request<{ enabled: boolean; mode: string; externalGeneration: boolean }>("/creative/status"),
  creativeProjects: () => request<CreativeProjectSummary[]>("/creative/projects"),
  createCreativeStoryboard: (input: CreativeInput) => request<CreativeJob>("/creative/storyboard", { method: "POST", body: JSON.stringify(input) }),
  creativeProject: (id: string) => request<CreativeJob>(`/creative/${encodeURIComponent(id)}`),
  editCreativeStoryboard: (id: string, scenes: string[], imageIndexes: number[], secondImageIndexes: Array<number | null>) => request<CreativeJob>(`/creative/${encodeURIComponent(id)}/storyboard`, { method: "PATCH", body: JSON.stringify({ scenes, imageIndexes, secondImageIndexes }) }),
  recoverCreativeStoryboard: (id: string) => request<CreativeJob>(`/creative/${encodeURIComponent(id)}/manual-storyboard`, { method: "POST" }),
  renderCreativeVideo: (id: string, captionOverlays: string[]) => request<CreativeJob>(`/creative/${encodeURIComponent(id)}/render`, { method: "POST", body: JSON.stringify({ captionOverlays }) })
};
