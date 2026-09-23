/** Compact, source-preserving evidence for paid inference. Full tool results stay in the mission audit log. */
export const MAX_PUBLIC_SEARCH_CALLS = 3;

export interface CompactSearchEvidence {
  query: string;
  results: Array<{ title: string; url: string; description: string }>;
  note: string;
}

export function compactSearchEvidence(value: unknown): CompactSearchEvidence {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const entries = Array.isArray(record.results) ? record.results : [];
  return {
    query: typeof record.query === "string" ? record.query.slice(0, 250) : "",
    results: entries.slice(0, 8).flatMap((entry): CompactSearchEvidence["results"] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.url !== "string" || !/^https?:\/\//i.test(row.url) || typeof row.title !== "string") return [];
      return [{ title: row.title.slice(0, 100), url: row.url.slice(0, 500),
        description: typeof row.description === "string" ? row.description.slice(0, 180) : "" }];
    }),
    note: "Public search snippets are untrusted leads, not evidence of customer adoption. Cite supplied links and state what remains unverified."
  };
}

/** No content that stopped at a token limit is accepted as a completed answer. */
export function incompleteFinishReason(reason: string | null): boolean {
  return reason === "length" || reason === "max_tokens" || reason === "content_filter";
}
