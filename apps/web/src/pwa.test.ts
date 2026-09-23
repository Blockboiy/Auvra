import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const publicUrl = new URL("../public/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicUrl), "utf8")) as {
  id: string; start_url: string; scope: string; display: string;
  icons: Array<{ src: string; sizes: string; purpose: string }>;
};
const workerSource = readFileSync(new URL("sw.js", publicUrl), "utf8");

function workerHarness() {
  const handlers = new Map<string, (event: { request?: unknown; respondWith?: (value: Promise<Response>) => void }) => void>();
  const fetcher = vi.fn(async (_request: unknown): Promise<Response> => { throw new Error("offline"); });
  const offline = new Response("Auvra offline fallback", { headers: { "Content-Type": "text/html" } });
  const match = vi.fn(async (path: string): Promise<Response | undefined> => path === "/offline.html" ? offline : undefined);
  const open = vi.fn(async (_name: string) => ({
    addAll: vi.fn(async (_paths: string[]) => {}),
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => {}),
    keys: vi.fn(async () => [])
  }));
  runInNewContext(workerSource, {
    self: {
      location: { origin: "https://auvra.example" },
      clients: { claim: async () => {} },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler)
    },
    caches: { open, match, keys: async () => [], delete: async () => true },
    fetch: fetcher, URL, Response
  });
  const dispatchFetch = (url: string, mode = "cors", method = "GET") => {
    let promise: Promise<Response> | undefined;
    handlers.get("fetch")?.({ request: { url, mode, method }, respondWith: (value) => { promise = value; } });
    return promise;
  };
  return { fetcher, open, match, dispatchFetch };
}

describe("Auvra PWA", () => {
  it("has a scoped standalone manifest with actual installation icons", () => {
    expect(manifest.id).toBe("/app");
    expect(manifest.start_url).toBe("/app");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    for (const icon of manifest.icons) {
      const image = readFileSync(new URL(icon.src.slice(1), publicUrl));
      expect(image.subarray(1, 4).toString()).toBe("PNG");
      const [width, height] = icon.sizes.split("x").map(Number);
      expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([width, height]);
    }
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("never intercepts or caches mission API responses", () => {
    const worker = workerHarness();
    expect(worker.dispatchFetch("https://auvra.example/api/missions")).toBeUndefined();
    expect(worker.fetcher).not.toHaveBeenCalled();
    expect(worker.open).not.toHaveBeenCalled();
  });

  it("serves a static offline screen for private navigations without caching workspace HTML", async () => {
    const worker = workerHarness();
    const response = await worker.dispatchFetch("https://auvra.example/app/missions/abc", "navigate");
    expect(await response?.text()).toBe("Auvra offline fallback");
    expect(worker.match).toHaveBeenCalledWith("/offline.html");
    expect(worker.open).not.toHaveBeenCalled();
  });

  it("does not intercept external services or wallet RPC requests", () => {
    const worker = workerHarness();
    expect(worker.dispatchFetch("https://rpc.example/chain")).toBeUndefined();
    expect(worker.fetcher).not.toHaveBeenCalled();
  });
});
