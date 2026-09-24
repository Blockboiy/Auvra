import { describe, expect, it } from "vitest";
import { makeCaptionOverlay } from "./creative-captions";

describe("browser caption overlays", () => {
  it("returns a PNG image matching the vertical video size", () => {
    const calls: string[] = [];
    const context = {
      fillStyle: "", font: "", textAlign: "", textBaseline: "",
      fillRect: () => {},
      fillText: (value: string) => { calls.push(value); },
      measureText: (value: string) => ({ width: value.length * 9 })
    };
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context, toDataURL: () => "data:image/png;base64,example" })
    } });
    try {
      expect(makeCaptionOverlay("Find the leak.", "9:16")).toMatch(/^data:image\/png;base64,/);
      expect(calls).toContain("Find the leak.");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });
});
