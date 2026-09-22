/** An application-side, explicitly permissioned public web-search tool.
 * Search results are candidate sources, not proof of a business's checkout integration.
 * No arbitrary user-supplied URLs are fetched by the Auvra server.
 */
export interface PublicSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface PublicSearchResponse {
  query: string;
  searchedAt: string;
  results: PublicSearchResult[];
  note: string;
}

export function requiresWebResearch(objective: string): boolean {
  return /\b(find|list|identify|research|search|look\s*up|look\s*for|verify|get\s+me\s+a\s+list)\b/i.test(objective)
    && /\b(restaurants?|resturants?|business(?:es)?|compan(?:y|ies)|vendors?|shops?|stores?|places?|websites?|sources?|news|online|nearby)\b/i.test(objective);
}

export class BraveWebSearch {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  get configured(): boolean { return this.apiKey.trim().length > 0; }

  async search(query: string): Promise<PublicSearchResponse> {
    const cleaned = query.trim();
    if (!cleaned || cleaned.length > 250) throw new Error("Web search query must contain 1–250 characters.");
    if (!this.configured) throw new Error("Web research is not configured. Add BRAVE_SEARCH_API_KEY to the server .env.");

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", cleaned);
    url.searchParams.set("count", "8");
    url.searchParams.set("search_lang", "en");
    const response = await this.fetcher(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Web search key was rejected. Check BRAVE_SEARCH_API_KEY.");
      if (response.status === 429) throw new Error("Web search provider rate-limited the request. Please try again later.");
      throw new Error(`Web search provider returned HTTP ${response.status}.`);
    }
    const data: unknown = await response.json();
    const root = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const web = root.web && typeof root.web === "object" && !Array.isArray(root.web) ? root.web as Record<string, unknown> : {};
    const entries = Array.isArray(web.results) ? web.results : [];
    const results = entries.flatMap((entry): PublicSearchResult[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const result = entry as Record<string, unknown>;
      if (typeof result.url !== "string" || typeof result.title !== "string") return [];
      let parsed: URL;
      try { parsed = new URL(result.url); } catch { return []; }
      if (!["https:", "http:"].includes(parsed.protocol)) return [];
      return [{ title: result.title.slice(0, 200), url: parsed.toString(), description: typeof result.description === "string" ? result.description.slice(0, 750) : "" }];
    }).slice(0, 8);
    return {
      query: cleaned,
      searchedAt: new Date().toISOString(),
      results,
      note: "Search snippets are leads, not verified facts. Cite the linked sources and mark unconfirmed checkout capability as requiring verification."
    };
  }
}
