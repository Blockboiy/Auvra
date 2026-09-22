import { describe, expect, it } from "vitest";
import { parseOutputBlocks } from "./MissionResult";

describe("Auvra result formatting", () => {
  it("keeps headings, paragraphs, and lists separate", () => {
    const blocks = parseOutputBlocks("# Findings\nA concise result.\n\n- First point\n- Second point");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list"]);
    expect(blocks[2]?.items).toEqual(["First point", "Second point"]);
  });
  it("displays Markdown tables as structured rows", () => {
    const blocks = parseOutputBlocks("| Item | Amount |\n| --- | ---: |\n| Total | $131 |");
    expect(blocks[0]).toMatchObject({ kind: "table", headers: ["Item", "Amount"], rows: [["Total", "$131"]] });
  });
  it("preserves code blocks as literal text", () => {
    const blocks = parseOutputBlocks("```json\n{\"value\":131}\n```");
    expect(blocks[0]).toMatchObject({ kind: "code", language: "json", text: '{"value":131}' });
  });
});
