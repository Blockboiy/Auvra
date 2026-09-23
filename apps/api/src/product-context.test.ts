import { describe, expect, it } from "vitest";
import { auvraProductContext, auvraDiscoveryQuery } from "./product-context.js";

describe("trusted Auvra product grounding", () => {
  it("grounds this platform without conflating unrelated companies or wallet funds", () => {
    expect(auvraProductContext("Highlight businesses who benefit from Auvra services")).toContain("autonomous AI execution platform");
    expect(auvraProductContext("Highlight businesses who benefit from Auvra services")).toContain("NOT proven");
    expect(auvraProductContext("Calculate 10 percent of 20")).toBe("");
  });
  it("searches for market use cases, not an unrelated Auvra namesake", () => {
    expect(auvraDiscoveryQuery("Identify Auvra users in Lagos")).toContain("Lagos Nigeria");
    expect(auvraDiscoveryQuery("Identify Auvra users in Lagos")).not.toMatch(/Auvra/i);
  });
});
