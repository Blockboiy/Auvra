/** Trusted facts about this Auvra product, not retrieved third-party search snippets. */
export function auvraProductContext(objective: string): string {
  if (!/\b(auvra|our (?:platform|product|app|services?)|your (?:platform|product|app|services?))\b/i.test(objective)) return "";
  return [
    "Product identity: Auvra is THIS autonomous AI execution platform, not an unrelated organization with the same name. If the user explicitly identifies a different Auvra, follow their stated referent instead.",
    "Auvra lets users define a mission objective, approve permitted tools, set a USD inference-spend limit, and explicitly start a bounded agent workflow.",
    "The app uses the Orbio gateway for inference, stores mission events, source links when searches run, provider-reported costs and token usage.",
    "Its resource page displays connected-wallet CREDIT, USDG, and ETH on Robinhood Chain; separate read-only exchange quotes and user-approved CREDIT transfers are available.",
    "Existing wallet CREDIT is NOT proven to be activated inference balance, and direct activation into Auvra's server API-key account is not integrated.",
    "Product URL: https://auvra.up.railway.app . Code: https://github.com/Blockboiy/Auvra .",
    "For public research about this product, search for the target industries, customer needs, and evidence of agent-workflow demand, not unrelated businesses that happen to be named Auvra.",
    "Treat these as product capabilities, not as evidence of market adoption, customers, pricing, or external demand; research claims require actual sources."
  ].join(" ");
}

/** For public market discovery, search for use cases and demand rather than namesakes. */
export function auvraDiscoveryQuery(objective: string): string {
  const location = /\blagos\b/i.test(objective) ? " Lagos Nigeria" : /\bnigeria\b/i.test(objective) ? " Nigeria" : "";
  return "small business AI agent automation workflow use cases budget governance" + location;
}
