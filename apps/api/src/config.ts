import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";

loadDotEnv({ path: resolve(process.cwd(), ".env"), quiet: true });
loadDotEnv({ path: resolve(process.cwd(), "../../.env"), override: false, quiet: true });

const numberFromEnv = (name: string, fallback: number, minimum: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
};

export interface AppConfig {
  port: number;
  webOrigin: string;
  dataFile: string;
  maxSteps: number;
  missionTimeoutMs: number;
  preflightCostUsd: number;
  maxOutputTokens: number;
  executionOutputTokens: number;
  planningOutputTokens: number;
  finalOutputTokens: number;
  webSearch?: { apiKey: string };
  provider: {
    apiKey: string;
    baseUrl: string;
    model: string;
    models?: string[];
    timeoutMs: number;
    retries: number;
    reasoningEffort?: "none" | "low" | "high" | "max";
  };
}

export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const defaults: AppConfig = {
    port: numberFromEnv("API_PORT", 4000, 1),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    dataFile: resolve(process.env.AUVRA_DATA_FILE ?? "./data/missions.json"),
    maxSteps: Math.min(12, numberFromEnv("AUVRA_MAX_STEPS", 6, 1)),
    missionTimeoutMs: numberFromEnv("AUVRA_MISSION_TIMEOUT_MS", 360_000, 5_000),
    preflightCostUsd: numberFromEnv("AUVRA_PREFLIGHT_COST_USD", 0.002, 0.000001),
    maxOutputTokens: Math.min(2_000, numberFromEnv("AUVRA_MAX_OUTPUT_TOKENS", 700, 64)),
    executionOutputTokens: Math.min(4_096, Math.floor(numberFromEnv("AUVRA_EXECUTION_OUTPUT_TOKENS", 2_048, 701))),
    planningOutputTokens: Math.min(8_192, Math.floor(numberFromEnv("AUVRA_PLANNING_OUTPUT_TOKENS", 3_072, 512))),
    finalOutputTokens: Math.min(16_384, Math.floor(numberFromEnv("AUVRA_FINAL_OUTPUT_TOKENS", 8_192, 1_200))),
    webSearch: { apiKey: process.env.BRAVE_SEARCH_API_KEY?.trim() ?? "" },
    provider: {
      apiKey: process.env.ORBIO_API_KEY?.trim() ?? "",
      baseUrl: (process.env.ORBIO_BASE_URL ?? "https://api.orbio.so/api/v1").replace(/\/$/, ""),
      model: process.env.ORBIO_MODEL?.trim() || "deepseek/deepseek-v4.1-flash",
      // Optional ordered fallback pool. Only models explicitly configured here are tried.
      models: (process.env.ORBIO_MODELS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      timeoutMs: numberFromEnv("AUVRA_PROVIDER_TIMEOUT_MS", 90_000, 1_000),
      retries: Math.min(2, numberFromEnv("AUVRA_PROVIDER_RETRIES", 0, 0)),
      ...(process.env.ORBIO_REASONING_EFFORT && ["none", "low", "high", "max"].includes(process.env.ORBIO_REASONING_EFFORT.trim())
        ? { reasoningEffort: process.env.ORBIO_REASONING_EFFORT.trim() as "none" | "low" | "high" | "max" }
        : {})
    }
  };
  return {
    ...defaults,
    ...overrides,
    provider: { ...defaults.provider, ...overrides.provider }
  };
}
