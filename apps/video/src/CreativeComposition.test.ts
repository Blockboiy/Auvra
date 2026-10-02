import { describe, expect, it } from "vitest";
import { captionsFromScript, timelineDurationInFrames } from "./CreativeComposition";

describe("deterministic finishing captions", () => {
  it("derives bounded caption cues from the final narration script", () => {
    const cues = captionsFromScript("Turn ideas and images into cinematic AI video with Auvra", 4);
    expect(cues).toEqual([
      { text: "Turn ideas and images into cinematic", startMs: 0, endMs: 2000 },
      { text: "AI video with Auvra", startMs: 2000, endMs: 4000 }
    ]);
  });
});

describe("assembled timeline duration", () => {
  it.each([[15, [8, 7]], [30, [6, 6, 6, 6, 6]], [60, Array.from({ length: 10 }, () => 6)]] as const)("renders the %s-second target from ordered short shots", (seconds, durations) => {
    const shots = durations.map((durationSeconds, index) => ({ durationSeconds, order: index + 1 }));
    expect(timelineDurationInFrames({ shots: shots as never[] })).toBe(seconds * 30);
  });
});
