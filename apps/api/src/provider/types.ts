import type { ProviderCheck, TokenUsage } from "@auvra/shared";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ProviderToolCall[];
}

export interface ProviderToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface InferenceRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxOutputTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface InferenceResult {
  text: string;
  toolCalls: ProviderToolCall[];
  usage: TokenUsage;
  actualCostUsd: number | null;
  model: string;
  attemptedModels?: string[];
  finishReason: string | null;
  reasoningTokens?: number;
}

export interface InferenceProvider {
  complete(request: InferenceRequest): Promise<InferenceResult>;
  diagnose?(): Promise<ProviderDiagnosticResult>;
}

export interface ProviderDiagnosticResult {
  overall: "not_configured" | "ready" | "operational" | "degraded" | "unavailable";
  checkedAt: string;
  checks: {
    credentials: ProviderCheck;
    gateway: ProviderCheck;
    model: ProviderCheck;
    toolCalling: ProviderCheck;
    inference: ProviderCheck;
  };
}

export class ProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable = false, readonly attemptedModels: string[] = []) {
    super(message);
    this.name = "ProviderError";
  }
}
