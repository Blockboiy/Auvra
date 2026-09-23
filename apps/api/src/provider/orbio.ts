import type { ProviderCheck } from "@auvra/shared";
import type { AppConfig } from "../config.js";
import {
  ProviderError,
  type InferenceProvider,
  type InferenceRequest,
  type InferenceResult,
  type ProviderDiagnosticResult,
  type ProviderToolCall
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
};

const pass = (message: string): ProviderCheck => ({ status: "pass", message });
const fail = (message: string): ProviderCheck => ({ status: "fail", message });
const unknown = (message: string): ProviderCheck => ({ status: "unknown", message });

const sanitizeRemoteMessage = (message: unknown): string => {
  if (typeof message !== "string") return "";
  return message
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
};

export function classifyProviderError(status: number, payload: unknown): ProviderError {
  const root = asRecord(payload);
  const error = asRecord(root?.error);
  const remote = sanitizeRemoteMessage(error?.message ?? root?.message);
  const normalized = remote.toLowerCase();
  if (status === 401 || status === 403 || normalized.includes("invalid api key") || normalized.includes("authentication")) {
    return new ProviderError("Orbio rejected the server credentials. Verify ORBIO_API_KEY and restart the API.", "AUTHENTICATION_ERROR");
  }
  if (status === 402 || normalized.includes("insufficient credit") || normalized.includes("insufficient balance") || normalized.includes("payment required")) {
    return new ProviderError("The Orbio account does not have sufficient inference credit for this request.", "INSUFFICIENT_CREDITS");
  }
  if (normalized.includes("no provider is currently serving") || normalized.includes("model unavailable") || normalized.includes("unknown model") || normalized.includes("model not found")) {
    return new ProviderError("The selected Orbio model is currently unavailable on its provider route. Check model availability before retrying.", "MODEL_UNAVAILABLE");
  }
  if (normalized.includes("tool") && (normalized.includes("unsupported") || normalized.includes("not support") || normalized.includes("invalid"))) {
    return new ProviderError("The selected Orbio model route rejected the tool-calling request.", "TOOL_INCOMPATIBLE");
  }
  if (status === 429 || normalized.includes("rate limit")) {
    return new ProviderError("Orbio rate-limited the request. Wait before trying again.", "RATE_LIMITED", true);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderError(`Orbio rejected the request format${remote ? `: ${remote}` : "."}`, "INVALID_REQUEST");
  }
  if (status >= 500) {
    return new ProviderError("The Orbio gateway or its upstream provider is temporarily unavailable.", "GATEWAY_ERROR", true);
  }
  return new ProviderError(`Orbio request failed${remote ? `: ${remote}` : ` with HTTP ${status}.`}`, "PROVIDER_ERROR");
}

export function parseProviderCost(payload: unknown): number | null {
  const root = asRecord(payload);
  if (!root) return null;
  const usage = asRecord(root.usage);
  const costDetails = asRecord(usage?.cost_details);
  const candidates = [
    root.cost,
    root.total_cost,
    usage?.cost,
    usage?.total_cost,
    costDetails?.total_cost,
    costDetails?.cost,
    costDetails?.upstream_inference_cost,
    asRecord(root.provider)?.cost
  ];
  for (const candidate of candidates) {
    const parsed = finiteNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseOrbioResponse(payload: unknown, fallbackModel: string): InferenceResult {
  const root = asRecord(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  const usage = asRecord(root?.usage);
  if (!message) throw new ProviderError("Orbio returned an invalid chat completion payload.", "INVALID_RESPONSE");
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls = rawCalls.map((call): ProviderToolCall => {
    const record = asRecord(call);
    const fn = asRecord(record?.function);
    if (record?.type !== undefined && record.type !== "function") {
      throw new ProviderError("Orbio returned an unsupported tool-call type.", "INVALID_TOOL_CALL");
    }
    if (typeof record?.id !== "string" || !record.id || typeof fn?.name !== "string" || !fn.name || typeof fn.arguments !== "string") {
      throw new ProviderError("Orbio returned a malformed tool call.", "INVALID_TOOL_CALL");
    }
    return { id: record.id, type: "function", function: { name: fn.name, arguments: fn.arguments } };
  });
  const input = finiteNumber(usage?.prompt_tokens) ?? finiteNumber(usage?.input_tokens) ?? 0;
  const output = finiteNumber(usage?.completion_tokens) ?? finiteNumber(usage?.output_tokens) ?? 0;
  return {
    text: typeof message.content === "string" ? message.content : "",
    toolCalls,
    usage: { input, output, total: finiteNumber(usage?.total_tokens) ?? input + output },
    actualCostUsd: parseProviderCost(payload),
    model: typeof root?.model === "string" ? root.model : fallbackModel,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    ...(finiteNumber(asRecord(usage?.completion_tokens_details)?.reasoning_tokens) !== null
      ? { reasoningTokens: finiteNumber(asRecord(usage?.completion_tokens_details)?.reasoning_tokens)! } : {})
  };
}

export class OrbioProvider implements InferenceProvider {
  private inferenceCheck: ProviderCheck = unknown("No inference request has completed since the API started.");

  constructor(private readonly config: AppConfig["provider"]) {}

  async diagnose(): Promise<ProviderDiagnosticResult> {
    const checkedAt = new Date().toISOString();
    if (!this.config.apiKey) {
      return {
        overall: "not_configured",
        checkedAt,
        checks: {
          credentials: fail("ORBIO_API_KEY is not configured on the server."),
          gateway: unknown("Gateway was not contacted."),
          model: unknown("Model availability was not checked."),
          toolCalling: unknown("Tool support was not checked."),
          inference: this.inferenceCheck
        }
      };
    }
    const timeout = AbortSignal.timeout(Math.min(this.config.timeoutMs, 10_000));
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" },
        signal: timeout
      });
      const payload = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = classifyProviderError(response.status, payload);
        const authFailure = error.code === "AUTHENTICATION_ERROR";
        return {
          overall: "unavailable",
          checkedAt,
          checks: {
            credentials: authFailure ? fail(error.message) : pass("A server-side credential is configured."),
            gateway: pass(`Orbio gateway responded with HTTP ${response.status}.`),
            model: unknown("Model availability could not be determined."),
            toolCalling: unknown("Tool support could not be determined."),
            inference: this.inferenceCheck
          }
        };
      }
      const root = asRecord(payload);
      const models = Array.isArray(root?.data) ? root.data.map(asRecord).filter((model): model is UnknownRecord => Boolean(model)) : [];
      const selected = models.find((model) => model.id === this.config.model);
      if (!selected) {
        return {
          overall: "unavailable",
          checkedAt,
          checks: {
            credentials: pass("Orbio accepted the server credential."),
            gateway: pass("Orbio model metadata is reachable."),
            model: fail(`The configured model '${this.config.model}' is not present in current gateway metadata.`),
            toolCalling: unknown("Tool support is unknown because the model was not found."),
            inference: this.inferenceCheck
          }
        };
      }
      const supported = Array.isArray(selected.supported_parameters)
        ? selected.supported_parameters.filter((value): value is string => typeof value === "string")
        : [];
      const toolCheck = supported.length === 0
        ? unknown("Gateway metadata does not declare supported parameters for this model.")
        : supported.some((value) => ["tools", "tool_choice", "function_calling"].includes(value))
          ? pass("Gateway metadata declares tool-calling support.")
          : fail("Gateway metadata does not declare tool-calling support for this model.");
      const overall = this.inferenceCheck.status === "pass"
        ? toolCheck.status === "fail" ? "degraded" : "operational"
        : this.inferenceCheck.status === "fail" ? "unavailable" : toolCheck.status === "fail" ? "degraded" : "ready";
      return {
        overall,
        checkedAt,
        checks: {
          credentials: pass("Orbio accepted the server credential."),
          gateway: pass("Orbio model metadata is reachable."),
          model: pass(`The configured model '${this.config.model}' is listed by the gateway.`),
          toolCalling: toolCheck,
          inference: this.inferenceCheck
        }
      };
    } catch (error) {
      const message = (error as Error).name === "TimeoutError" || (error as Error).name === "AbortError"
        ? "The Orbio metadata check timed out."
        : "The Orbio gateway could not be reached.";
      return {
        overall: "unavailable",
        checkedAt,
        checks: {
          credentials: pass("A server-side credential is configured, but it could not be validated."),
          gateway: fail(message),
          model: unknown("Model availability could not be determined."),
          toolCalling: unknown("Tool support could not be determined."),
          inference: this.inferenceCheck
        }
      };
    }
  }

  async complete(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.config.apiKey) throw new ProviderError("Orbio is not configured on the server.", "NOT_CONFIGURED");
    // Exact IDs from the configured pool only; no speculative model names or silent provider switch.
    const models = [...new Set([this.config.model, ...(this.config.models ?? [])].map((model) => model.trim()).filter(Boolean))].slice(0, 4);
    const attemptedModels: string[] = [];
    for (const model of models) {
      if (request.signal?.aborted) throw new ProviderError("Mission execution was cancelled.", "CANCELLED", false, attemptedModels);
      attemptedModels.push(model);
      const timeout = AbortSignal.timeout(this.config.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      try {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: request.messages,
            ...(request.tools?.length ? { tools: request.tools, tool_choice: "auto" } : {}),
            max_tokens: request.maxOutputTokens,
            ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
          }),
          signal
        });
        const payload = await response.json().catch(() => undefined);
        if (!response.ok) throw classifyProviderError(response.status, payload);
        const result = parseOrbioResponse(payload, model);
        this.inferenceCheck = pass(`A Chat Completions request succeeded with model '${result.model}'.`);
        return { ...result, attemptedModels };
      } catch (error) {
        if (request.signal?.aborted) throw new ProviderError("Mission execution was cancelled.", "CANCELLED", false, attemptedModels);
        let failure: ProviderError;
        if (error instanceof ProviderError) failure = error;
        else if ((error as Error).name === "TimeoutError" || (error as Error).name === "AbortError") {
          failure = new ProviderError("The AI provider took longer than the configured request window. Earlier completed work is saved. To avoid possible duplicate charges, Auvra did not automatically retry this uncertain request.", "PROVIDER_TIMEOUT");
        } else failure = new ProviderError("The Orbio gateway could not be reached. No fallback was attempted because upstream billing is uncertain.", "GATEWAY_UNREACHABLE");

        // Only a definitive pre-execution 'no provider serving this model' response
        // permits another model. Never fall back after timeout, unknown charges,
        // authentication errors, missing cost, invalid tool output, or parse failures.
        if (failure.code === "MODEL_UNAVAILABLE" && attemptedModels.length < models.length) continue;
        const terminal = failure.code === "MODEL_UNAVAILABLE"
          ? new ProviderError(`No configured Orbio route served this request. Tried: ${attemptedModels.join(", ")}.`, "MODEL_UNAVAILABLE", false, attemptedModels)
          : new ProviderError(failure.message, failure.code, false, attemptedModels);
        this.inferenceCheck = fail(terminal.message);
        throw terminal;
      }
    }
    const terminal = new ProviderError("No configured Orbio model was available.", "MODEL_UNAVAILABLE", false, attemptedModels);
    this.inferenceCheck = fail(terminal.message);
    throw terminal;
  }
}
