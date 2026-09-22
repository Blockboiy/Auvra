import type { Mission } from "@auvra/shared";
import { CheckCircle2, Clipboard, FileText, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

type Block = { kind: "heading" | "paragraph" | "list" | "ordered" | "code" | "quote" | "table"; text?: string; level?: number; items?: string[]; language?: string; headers?: string[]; rows?: string[][] };

// A small, safe renderer for common model-output Markdown. React escapes all text;
// no HTML is interpreted and no untrusted Markdown plugins run in the browser.
export function parseOutputBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }
    if (/^\s*```/.test(line)) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index] ?? "")) code.push(lines[index++] ?? "");
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", text: code.join("\n"), language });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?[-]{3,}/.test(lines[index + 1] ?? "")) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] ?? "")) rows.push(cells(lines[index++] ?? ""));
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) { blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! }); index += 1; continue; }
    const bullet = /^\s*[-*+]\s+/.test(line);
    const numbered = /^\s*\d+[.)]\s+/.test(line);
    if (bullet || numbered) {
      const items: string[] = [];
      const pattern = bullet ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
      while (index < lines.length && pattern.test(lines[index] ?? "")) items.push((lines[index++] ?? "").replace(pattern, "").trim());
      blocks.push({ kind: bullet ? "list" : "ordered", items });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) quote.push((lines[index++] ?? "").replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? "").trim() && !/^\s*```|^#{1,4}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|^\s*>\s?/.test(lines[index] ?? "")) paragraph.push(lines[index++]!.trim());
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    else index += 1;
  }
  return blocks;
}

function inlineText(value: string): ReactNode[] {
  const chunks = value.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return chunks.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-violet/[.07] px-1.5 py-0.5 font-mono text-[.9em] text-violet">{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-medium text-violet underline underline-offset-2">{link[1]}</a>;
    return part;
  });
}

export function OutputDocument({ value }: { value: string }) {
  const blocks = parseOutputBlocks(value);
  return <div className="space-y-4 break-words text-sm leading-7 text-ink sm:text-[15px]">
    {blocks.map((block, index) => {
      if (block.kind === "table") return <div key={index} className="max-w-full overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[360px] text-left text-xs sm:text-sm"><thead className="bg-canvas"><tr>{block.headers?.map((cell, column) => <th key={column} className="border-b border-line px-3 py-2 font-semibold text-night">{inlineText(cell)}</th>)}</tr></thead><tbody>{block.rows?.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-line last:border-0">{row.map((cell, column) => <td key={column} className="px-3 py-2 align-top text-ink">{inlineText(cell)}</td>)}</tr>)}</tbody></table></div>;
      if (block.kind === "heading") return <h3 key={index} className={`${block.level === 1 ? "text-xl" : "text-base"} font-bold tracking-tight text-night`}>{inlineText(block.text ?? "")}</h3>;
      if (block.kind === "code") return <pre key={index} className="max-w-full overflow-x-auto rounded-xl bg-night p-4 font-mono text-xs leading-6 text-white"><code>{block.text}</code></pre>;
      if (block.kind === "quote") return <blockquote key={index} className="border-l-2 border-violet/40 bg-canvas px-4 py-2 text-muted">{inlineText(block.text ?? "")}</blockquote>;
      if (block.kind === "list" || block.kind === "ordered") {
        const Tag = block.kind === "list" ? "ul" : "ol";
        return <Tag key={index} className={`space-y-2 pl-5 ${block.kind === "list" ? "list-disc" : "list-decimal"}`}>{(block.items ?? []).map((item, itemIndex) => <li key={itemIndex} className="pl-1">{inlineText(item)}</li>)}</Tag>;
      }
      return <p key={index} className="whitespace-pre-wrap">{inlineText(block.text ?? "")}</p>;
    })}
  </div>;
}

export function MissionResult({ mission }: { mission: Mission }) {
  const [copied, setCopied] = useState(false);
  const final = mission.finalOutput?.trim();
  const copy = async () => {
    if (!final) return;
    try { await navigator.clipboard.writeText(final); setCopied(true); }
    catch { setCopied(false); }
  };
  if (!final && !mission.notes.length && mission.status === "draft") return null;
  return <section className="card mb-6 overflow-hidden" aria-labelledby="auvra-result-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-violet/[.055] to-white px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-white p-2.5 text-violet shadow-sm"><FileText className="h-5 w-5" /></span><div><h2 id="auvra-result-heading" className="font-semibold text-ink">Mission result</h2><p className="mt-0.5 text-xs text-muted">Your outcome, in a readable format</p></div></div>
      {final ? <button type="button" onClick={() => void copy()} className="button-secondary text-xs"><Clipboard className="h-4 w-4" />{copied ? "Copied" : "Copy result"}</button> : null}
    </div>
    <div className="px-5 py-6 sm:px-7">
      {final ? <><div className="mb-5 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Final response saved</div><OutputDocument value={final} /></> : <div className="flex gap-3 text-sm"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet" /><div><p className="font-semibold text-ink">{mission.status === "failed" || mission.status === "budget_exhausted" || mission.status === "cancelled" ? "No final answer was produced" : "Auvra is working on your result"}</p><p className="mt-1 leading-6 text-muted">{mission.status === "failed" || mission.status === "budget_exhausted" || mission.status === "cancelled" ? "Any completed actions and their recorded costs remain available below. A partial result is not presented as a completed answer." : "The final response will appear here once the mission completes."}</p></div></div>}
      {mission.notes.length ? <div className="mt-6 border-t border-line pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-muted">Saved mission notes</h3><ul className="mt-3 space-y-2">{mission.notes.map((note, index) => <li key={index} className="rounded-xl bg-canvas p-3 text-sm leading-6 text-ink">{note}</li>)}</ul></div> : null}
    </div>
  </section>;
}
