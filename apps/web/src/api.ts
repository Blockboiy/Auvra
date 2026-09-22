import type { ApiError, CreateMissionInput, DashboardSummary, Mission, ProviderStatus } from "@auvra/shared";

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
  providerStatus: () => request<ProviderStatus>("/provider/status")
};
