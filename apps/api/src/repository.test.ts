import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Mission } from "@auvra/shared";
import { afterEach, describe, expect, it } from "vitest";
import { JsonMissionRepository } from "./repository.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("JSON persistence", () => {
  it("survives repository recreation and persists updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "auvra-test-")); directories.push(directory);
    const filename = join(directory, "missions.json");
    const now = new Date().toISOString();
    const value: Mission = { id: "one", objective: "Persist this mission", budgetUsd: 1, permissions: [], status: "draft", currentStep: 0, maxSteps: 3, actualCostUsd: 0, estimatedCostUsd: 0, usage: { input: 0, output: 0, total: 0 }, events: [], notes: [], cancellationRequested: false, createdAt: now, updatedAt: now };
    await new JsonMissionRepository(filename).create(value);
    const reopened = new JsonMissionRepository(filename);
    await reopened.update("one", (mission) => ({ ...mission, notes: ["durable"] }));
    expect((await new JsonMissionRepository(filename).get("one"))?.notes).toEqual(["durable"]);
  });
});
