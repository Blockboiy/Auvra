import type { Mission, PermissionId } from "@auvra/shared";
import type { ToolDefinition } from "./provider/types.js";
import { BraveWebSearch } from "./web-search.js";

interface ToolContext {
  mission: Mission;
  saveNote: (note: string) => Promise<void>;
  webSearch?: (query: string) => ReturnType<BraveWebSearch["search"]>;
}

interface ToolSpec {
  permission: PermissionId;
  definition: ToolDefinition;
  execute: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

const finite = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
};

const specs: Record<string, ToolSpec> = {
  web_search: {
    permission: "web.search",
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the current public web and return up to eight sourced links and snippets. Use for discovery or current facts; do not treat search snippets as proof of checkout capability.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Concise search query, including location when relevant." } },
          required: ["query"],
          additionalProperties: false
        }
      }
    },
    execute: async (input, context) => {
      if (typeof input.query !== "string") throw new Error("Web search query must be a string.");
      if (!context.webSearch) throw new Error("Web research service is unavailable.");
      return context.webSearch(input.query);
    }
  },
  get_current_time: {
    permission: "time.read",
    definition: {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Read the current server time in UTC.",
        parameters: { type: "object", properties: {}, additionalProperties: false }
      }
    },
    execute: async () => ({ utc: new Date().toISOString(), timezone: "UTC" })
  },
  calculate: {
    permission: "math.calculate",
    definition: {
      type: "function",
      function: {
        name: "calculate",
        description: "Perform one safe arithmetic operation.",
        parameters: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["add", "subtract", "multiply", "divide", "percent"] },
            a: { type: "number" },
            b: { type: "number" }
          },
          required: ["operation", "a", "b"],
          additionalProperties: false
        }
      }
    },
    execute: async (input) => {
      const a = finite(input.a, "a");
      const b = finite(input.b, "b");
      let result: number;
      switch (input.operation) {
        case "add": result = a + b; break;
        case "subtract": result = a - b; break;
        case "multiply": result = a * b; break;
        case "divide":
          if (b === 0) throw new Error("Cannot divide by zero.");
          result = a / b;
          break;
        case "percent": result = (a / 100) * b; break;
        default: throw new Error("Unsupported calculation operation.");
      }
      if (!Number.isFinite(result)) throw new Error("Calculation result is not finite.");
      return { operation: input.operation, a, b, result };
    }
  },
  record_note: {
    permission: "notes.write",
    definition: {
      type: "function",
      function: {
        name: "record_note",
        description: "Save a concise note in the mission's durable audit record.",
        parameters: {
          type: "object",
          properties: { note: { type: "string", minLength: 1, maxLength: 500 } },
          required: ["note"],
          additionalProperties: false
        }
      }
    },
    execute: async (input, context) => {
      if (typeof input.note !== "string" || input.note.trim().length === 0 || input.note.length > 500) {
        throw new Error("Note must contain between 1 and 500 characters.");
      }
      const note = input.note.trim();
      await context.saveNote(note);
      return { saved: true, note };
    }
  }
};

export class ToolRegistry {
  constructor(private readonly searchProvider = new BraveWebSearch("")) {}

  definitions(permissions: PermissionId[]): ToolDefinition[] {
    return Object.values(specs)
      .filter((spec) => permissions.includes(spec.permission))
      .map((spec) => spec.definition);
  }

  async execute(name: string, input: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    const spec = specs[name];
    if (!spec) throw new Error(`Tool '${name}' is not available.`);
    if (!context.mission.permissions.includes(spec.permission)) {
      throw new Error(`Permission '${spec.permission}' is required for tool '${name}'.`);
    }
    return spec.execute(input, { ...context, webSearch: (query) => this.searchProvider.search(query) });
  }
}
