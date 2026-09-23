import { requiresWebResearch } from "./web-search.js";
import { randomUUID } from "node:crypto";
import {
  isTerminalStatus,
  validateCreateMission,
  type CreateMissionInput,
  type DashboardSummary,
  type Mission,
  type MissionEvent,
  type ProviderStatus
} from "@auvra/shared";
import type { AppConfig } from "./config.js";
import type { InferenceProvider } from "./provider/types.js";
import type { MissionRepository } from "./repository.js";

export class DomainError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400, readonly details?: unknown) {
    super(message);
    this.name = "DomainError";
  }
}

const event = (missionId: string, values: Omit<MissionEvent, "id" | "missionId" | "createdAt">): MissionEvent => ({
  id: randomUUID(),
  missionId,
  createdAt: new Date().toISOString(),
  ...values
});

export class MissionService {
  private runner?: { run: (id: string) => void; cancel: (id: string) => void };

  constructor(
    private readonly repository: MissionRepository,
    private readonly config: AppConfig,
    private readonly provider?: InferenceProvider
  ) {}

  attachRunner(runner: { run: (id: string) => void; cancel: (id: string) => void }): void {
    this.runner = runner;
  }

  async create(input: unknown): Promise<Mission> {
    const validation = validateCreateMission(input);
    if (!validation.success) throw new DomainError("Mission input is invalid.", "VALIDATION_ERROR", 422, validation.errors);
    return this.createValidated(validation.data);
  }

  private async createValidated(input: CreateMissionInput): Promise<Mission> {
    const allowedModels = new Set([this.config.provider.model, ...(this.config.provider.models ?? [])]);
    for (const [stage, model] of Object.entries(input.modelRoute ?? {})) {
      if (model && !allowedModels.has(model)) {
        throw new DomainError(`The selected ${stage} model is not in Auvra's configured Orbio model pool.`, "MODEL_NOT_CONFIGURED", 422);
      }
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const mission: Mission = {
      id,
      objective: input.objective,
      budgetUsd: input.budgetUsd,
      permissions: input.permissions,
      ...(input.modelRoute ? { modelRoute: input.modelRoute } : {}),
      status: "draft",
      currentStep: 0,
      maxSteps: this.config.maxSteps,
      actualCostUsd: 0,
      estimatedCostUsd: 0,
      usage: { input: 0, output: 0, total: 0 },
      events: [event(id, { type: "mission.created", status: "info", title: "Mission created", detail: "Waiting for explicit start approval." })],
      notes: [],
      cancellationRequested: false,
      createdAt: now,
      updatedAt: now
    };
    return this.repository.create(mission);
  }

  async list(): Promise<Mission[]> {
    return this.repository.list();
  }

  async get(id: string): Promise<Mission> {
    const mission = await this.repository.get(id);
    if (!mission) throw new DomainError("Mission not found.", "NOT_FOUND", 404);
    return mission;
  }

  async start(id: string): Promise<Mission> {
    if (!this.config.provider.apiKey) throw new DomainError("Configure ORBIO_API_KEY before starting a mission.", "PROVIDER_NOT_CONFIGURED", 503);
    const updated = await this.repository.update(id, (mission) => {
      if (mission.status !== "draft") throw new DomainError("Only a draft mission can be started.", "INVALID_STATE", 409);
      if (requiresWebResearch(mission.objective) && !mission.permissions.includes("web.search")) {
        throw new DomainError("This objective needs current public information. Approve Research the public web before starting.", "WEB_RESEARCH_PERMISSION_REQUIRED", 422);
      }
      if (mission.permissions.includes("web.search") && !this.config.webSearch?.apiKey) {
        throw new DomainError("Web research is not configured. Add BRAVE_SEARCH_API_KEY to the server .env first.", "WEB_RESEARCH_NOT_CONFIGURED", 503);
      }
      const reserve = this.config.preflightCostUsd * Math.min(4, Math.max(1, new Set([this.config.provider.model, ...(this.config.provider.models ?? [])]).size));
      if (mission.budgetUsd < reserve) throw new DomainError(`Budget must cover the $${reserve.toFixed(6)} provider-call reserve.`, "INSUFFICIENT_BUDGET", 422);
      const now = new Date().toISOString();
      return {
        ...mission,
        status: "queued",
        startedAt: now,
        updatedAt: now,
        events: [...mission.events, event(id, { type: "mission.started", status: "success", title: "Mission started", detail: "Execution queued with explicit approval." })]
      };
    });
    if (!updated) throw new DomainError("Mission not found.", "NOT_FOUND", 404);
    this.runner?.run(id);
    return updated;
  }

  async cancel(id: string): Promise<Mission> {
    const updated = await this.repository.update(id, (mission) => {
      if (isTerminalStatus(mission.status)) throw new DomainError("Mission has already finished.", "INVALID_STATE", 409);
      const now = new Date().toISOString();
      return {
        ...mission,
        status: "cancelled",
        cancellationRequested: true,
        completedAt: now,
        updatedAt: now,
        events: [...mission.events, event(id, { type: "mission.cancelled", status: "info", title: "Mission cancelled", detail: "No further actions or provider calls will be started." })]
      };
    });
    if (!updated) throw new DomainError("Mission not found.", "NOT_FOUND", 404);
    this.runner?.cancel(id);
    return updated;
  }

  async dashboard(): Promise<DashboardSummary> {
    const missions = await this.repository.list();
    const active = missions.filter((mission) => ["queued", "planning", "running"].includes(mission.status)).length;
    const recentEvents = missions.flatMap((mission) => mission.events).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
    return {
      totals: {
        missions: missions.length,
        active,
        completed: missions.filter((mission) => mission.status === "completed").length,
        actualCostUsd: missions.reduce((sum, mission) => sum + mission.actualCostUsd, 0)
      },
      recentEvents,
      recentMissions: missions.slice(0, 5)
    };
  }

  async providerStatus(): Promise<ProviderStatus> {
    const key = this.config.provider.apiKey;
    const diagnostic = this.provider?.diagnose
      ? await this.provider.diagnose()
      : {
          overall: key ? "ready" as const : "not_configured" as const,
          checkedAt: new Date().toISOString(),
          checks: {
            credentials: key
              ? { status: "unknown" as const, message: "A credential is configured but was not validated by this provider adapter." }
              : { status: "fail" as const, message: "ORBIO_API_KEY is not configured on the server." },
            gateway: { status: "unknown" as const, message: "Gateway metadata check is unavailable." },
            model: { status: "unknown" as const, message: "Model availability is unknown." },
            toolCalling: { status: "unknown" as const, message: "Tool support is unknown." },
            inference: { status: "unknown" as const, message: "Inference has not been validated." }
          }
        };
    return {
      provider: "Orbio",
      configured: key.length > 0,
      baseUrl: this.config.provider.baseUrl,
      model: this.config.provider.model,
      models: [...new Set([this.config.provider.model, ...(this.config.provider.models ?? [])])].slice(0, 4),
      keyHint: key ? `ends in ${key.slice(-4)}` : null,
      mode: "server-side",
      costPolicy: "provider-reported-required",
      creditMonitoring: "planned",
      ...diagnostic,
      requestProfile: {
        protocol: "OpenAI-compatible Chat Completions",
        endpoint: `${this.config.provider.baseUrl}/chat/completions`,
        parameters: ["model", "messages", "max_tokens"],
        toolPolicy: "Tools and tool_choice=auto are sent only during execution when the mission has approved tools; planning sends no tools."
      }
    };
  }
}

export { event as createEvent };
