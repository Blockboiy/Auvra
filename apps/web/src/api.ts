import type { ApiError, CreateCreativeProjectInput, CreateMissionInput, CreativeFinishing, CreativePlan, CreativeProject, CreativeQuote, DashboardSummary, Mission, ProviderStatus } from "@auvra/shared";

export class ApiClientError extends Error {
  constructor(message: string, readonly code: string, readonly details?: unknown) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const form = init?.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...init?.headers }
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
  creativeProjects: () => request<CreativeProject[]>("/creative/projects"),
  creativeProject: (id: string) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}`),
  creativeAssetUrl: (projectId: string, assetId: string) => `/api/creative/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/content`,
  createCreativeProject: (input: CreateCreativeProjectInput) => request<CreativeProject>("/creative/projects", { method: "POST", body: JSON.stringify(input) }),
  uploadCreativeAssets: (id: string, files: File[], role: string) => { const body = new FormData(); files.forEach((file) => body.append("assets", file)); body.append("role", role); return request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/assets`, { method: "POST", body }); },
  selectCreativeReference: (id: string, assetId: string) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/reference`, { method: "POST", body: JSON.stringify({ assetId }) }),
  analyzeCreativeProject: (id: string) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/analyze`, { method: "POST", body: "{}" }),
  directCreativeProject: (id: string, plan?: CreativePlan) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/direct`, { method: "POST", body: JSON.stringify(plan ? { plan } : {}) }),
  updateCreativeFinishing: (id: string, finishing: CreativeFinishing) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/finishing`, { method: "POST", body: JSON.stringify(finishing) }),
  prepareCreativeNarrationScript: (id: string) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/finishing/prepare-script`, { method: "POST", body: "{}" }),
  renderCreativeFinal: (id: string) => request<CreativeProject>(`/creative/projects/${encodeURIComponent(id)}/render`, { method: "POST", body: "{}" }),
  quoteCreativeProject: (id: string) => request<CreativeQuote>(`/creative/projects/${encodeURIComponent(id)}/quote`, { method: "POST", body: "{}" }),
  approveCreativeQuote: (id: string, quoteId: string) => request<CreativeQuote>(`/creative/projects/${encodeURIComponent(id)}/quotes/${encodeURIComponent(quoteId)}/approve`, { method: "POST", body: "{}" }),
  generateCreativeProject: (id: string, quoteId: string) => request<{ accepted: boolean; generationIds: string[] }>(`/creative/projects/${encodeURIComponent(id)}/generate`, { method: "POST", body: JSON.stringify({ quoteId }) })
};
