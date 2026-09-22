import { describe, expect, it } from "vitest";
import { getConfig } from "../config.js";
import { OrbioProvider } from "./orbio.js";

const enabled = process.env.AUVRA_LIVE_TEST === "true";

describe.skipIf(!enabled)("Orbio live smoke test", () => {
  it("returns one inexpensive provider-reported completion", async () => {
    const config = getConfig();
    expect(config.provider.apiKey, "ORBIO_API_KEY is required").not.toBe("");
    const result = await new OrbioProvider({ ...config.provider, retries: 0 }).complete({
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      maxOutputTokens: 8,
      temperature: 0
    });
    expect(result.text.toUpperCase()).toContain("OK");
    expect(result.actualCostUsd).not.toBeNull();
  });
});
