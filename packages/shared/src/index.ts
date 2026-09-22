export const PERMISSIONS = [
  {
    id: "time.read",
    name: "Read current time",
    description: "Allow the agent to read the current UTC time from the Auvra server."
  },
  {
    id: "math.calculate",
    name: "Run calculations",
    description: "Allow arithmetic through Auvra's restricted calculator tool."
  },
  {
    id: "web.search",
    name: "Research the public web",
    description: "Allow public web searches with cited source links. Results need independent verification."
  },
  {
    id: "notes.write",
    name: "Record mission notes",
    description: "Allow the agent to save short notes in this mission's audit record."
  }
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];
export type MissionStatus =
  | "draft"
  | "queued"
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "budget_exhausted";
export type EventType =
  | "mission.created"
  | "mission.started"
  | "mission.cancelled"
  | "plan.created"
  | "inference.completed"
  | "model.fallback"
  | "model.routing.failed"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "mission.completed"
  | "mission.failed";

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface CostRecord {
  currency: "USD";
  amount: number;
  kind: "actual" | "estimate";
  source: "provider" | "preflight";
}

export interface MissionEvent {
  id: string;
  missionId: string;
  type: EventType;
  status: "info" | "success" | "error";
  title: string;
  detail?: string;
  createdAt: string;
  step?: number;
  model?: string;
  usage?: TokenUsage;
  cost?: CostRecord;
  tool?: {
    name: string;
    input: Record<string, unknown>;
    output?: unknown;
  };
}

export interface MissionPlan {
  summary: string;
  steps: string[];
}

export interface Mission {
  id: string;
  objective: string;
  budgetUsd: number;
  permissions: PermissionId[];
  status: MissionStatus;
  currentStep: number;
  maxSteps: number;
  plan?: MissionPlan;
  finalOutput?: string;
  error?: string;
  actualCostUsd: number;
  estimatedCostUsd: number;
  usage: TokenUsage;
  events: MissionEvent[];
  notes: string[];
  cancellationRequested: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateMissionInput {
  objective: string;
  budgetUsd: number;
  permissions: PermissionId[];
}

export interface DashboardSummary {
  totals: {
    missions: number;
    active: number;
    completed: number;
    actualCostUsd: number;
  };
  recentEvents: MissionEvent[];
  recentMissions: Mission[];
}

export interface ProviderStatus {
  provider: "Orbio";
  configured: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  keyHint: string | null;
  mode: "server-side";
  costPolicy: "provider-reported-required";
  creditMonitoring: "planned";
  overall: "not_configured" | "checking" | "ready" | "operational" | "degraded" | "unavailable";
  checkedAt: string | null;
  checks: {
    credentials: ProviderCheck;
    gateway: ProviderCheck;
    model: ProviderCheck;
    toolCalling: ProviderCheck;
    inference: ProviderCheck;
  };
  requestProfile: {
    protocol: "OpenAI-compatible Chat Completions";
    endpoint: string;
    parameters: string[];
    toolPolicy: string;
  };
}

export interface ProviderCheck {
  status: "pass" | "fail" | "unknown";
  message: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const permissionIds = new Set<string>(PERMISSIONS.map((permission) => permission.id));

export function validateCreateMission(input: unknown):
  | { success: true; data: CreateMissionInput }
  | { success: false; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, errors: ["Request body must be an object."] };
  }
  const candidate = input as Record<string, unknown>;
  const errors: string[] = [];
  const objective = typeof candidate.objective === "string" ? candidate.objective.trim() : "";
  if (objective.length < 10) errors.push("Objective must contain at least 10 characters.");
  if (objective.length > 2_000) errors.push("Objective must not exceed 2,000 characters.");
  const budgetUsd = candidate.budgetUsd;
  if (typeof budgetUsd !== "number" || !Number.isFinite(budgetUsd) || budgetUsd < 0.001 || budgetUsd > 100) {
    errors.push("Budget must be a finite USD amount between 0.001 and 100.");
  }
  const rawPermissions = candidate.permissions;
  if (!Array.isArray(rawPermissions)) errors.push("Permissions must be an array.");
  const permissions = Array.isArray(rawPermissions)
    ? [...new Set(rawPermissions.filter((value): value is PermissionId => typeof value === "string" && permissionIds.has(value)))]
    : [];
  if (Array.isArray(rawPermissions) && permissions.length !== rawPermissions.length) {
    errors.push("One or more permissions are not supported.");
  }
  if (errors.length > 0 || typeof budgetUsd !== "number") return { success: false, errors };
  return { success: true, data: { objective, budgetUsd, permissions } };
}

export const isTerminalStatus = (status: MissionStatus): boolean =>
  ["completed", "failed", "cancelled", "budget_exhausted"].includes(status);
