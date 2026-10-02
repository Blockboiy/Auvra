import { describe, expect, it } from "vitest";
import { captionsFromScript } from "./CreativeComposition";

describe("deterministic finishing captions", () => {
  it("derives bounded caption cues from the final narration script", () => {
    const cues = captionsFromScript("Turn ideas and images into cinematic AI video with Auvra", 4);
    expect(cues).toEqual([
      { text: "Turn ideas and images into cinematic", startMs: 0, endMs: 2000 },
      { text: "AI video with Auvra", startMs: 2000, endMs: 4000 }
    ]);
  });
});
