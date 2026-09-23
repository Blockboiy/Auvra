import { describe, expect, it } from "vitest";
import { getConfig } from "./config.js";

describe("Phase 2f bounded output settings", () => {
  it("allows longer planning and synthesis while keeping ordinary action limits", () => {
    const c = getConfig();
    expect(c.planningOutputTokens).toBeGreaterThanOrEqual(512);
    expect(c.planningOutputTokens).toBeLessThanOrEqual(8192);
    expect(c.finalOutputTokens).toBeGreaterThanOrEqual(1200);
    expect(c.finalOutputTokens).toBeLessThanOrEqual(16384);
    expect(c.maxOutputTokens).toBeLessThanOrEqual(2000);
  });
});
