import { describe, expect, it } from "vitest";
import { getConfig } from "./config.js";

describe("normal execution output allowance", () => {
  it("has a separate, bounded output cap above the previous 700-token limit", () => {
    const config = getConfig();
    expect(config.executionOutputTokens).toBeGreaterThan(700);
    expect(config.executionOutputTokens).toBeLessThanOrEqual(4096);
    expect(config.finalOutputTokens).toBeGreaterThan(config.executionOutputTokens);
  });
});
