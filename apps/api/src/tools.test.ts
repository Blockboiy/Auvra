import type { Mission } from "@auvra/shared";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./tools.js";

const mission = (permissions: Mission["permissions"]): Mission => ({
  id: "mission", objective: "Test objective", budgetUsd: 1, permissions, status: "running", currentStep: 1, maxSteps: 3,
  actualCostUsd: 0, estimatedCostUsd: 0, usage: { input: 0, output: 0, total: 0 }, events: [], notes: [],
  cancellationRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
});

describe("tool permission enforcement", () => {
  it("rejects a real tool without its required permission", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("calculate", { operation: "add", a: 2, b: 3 }, { mission: mission([]), saveNote: async () => undefined }))
      .rejects.toThrow("math.calculate");
  });

  it("executes allowlisted arithmetic with permission", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("calculate", { operation: "percent", a: 15, b: 200 }, { mission: mission(["math.calculate"]), saveNote: async () => undefined }))
      .resolves.toMatchObject({ result: 30 });
  });
});
