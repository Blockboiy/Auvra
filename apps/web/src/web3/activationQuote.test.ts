import { describe, expect, it } from "vitest";
import { ACTIVATION_QUOTE_SELECTOR, decodeActivationQuote, readActivationQuote } from "./activationQuote";
import { ORBIO_CREDIT_ADDRESS, type Eip1193Provider } from "./credit";
import { ORBIO_EXCHANGE_ADDRESS, ORBIO_USDG_ADDRESS } from "./funding";
const account = "0x1111111111111111111111111111111111111111";
const word = (v: bigint) => v.toString(16).padStart(64, "0");
const addr = (v: string) => `0x${v.slice(2).padStart(64, "0")}`;
const quote = `0x${[10_000_000n, 8_000_000n, 100_000n, 2n, 0n, 9_800_000n, 200_000n].map(word).join("")}`;
function provider(overrides: Record<string, unknown> = {}): Eip1193Provider {
  return { request: async ({ method, params }) => {
    if (method in overrides) return overrides[method];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_accounts") return [account];
    if (method === "eth_getCode") return "0x6001";
    if (method === "eth_blockNumber") return "0x2a";
    if (method === "eth_call") {
      const tx = (params as [{to: string; data: string}])[0];
      expect(tx.to.toLowerCase()).toBe(ORBIO_EXCHANGE_ADDRESS);
      if (tx.data === "0xa06d083c") return addr(ORBIO_CREDIT_ADDRESS);
      if (tx.data === "0xf5b91b7b") return addr(ORBIO_USDG_ADDRESS);
      if (tx.data === "0xf97e7d43") return `0x${word(16n)}`;
      expect(tx.data.startsWith(ACTIVATION_QUOTE_SELECTOR)).toBe(true);
      return quote;
    }
    throw new Error(`Unexpected wallet operation ${method}`);
  }};
}
describe("verified read-only activation quote", () => {
  it("decodes static tuple and preserves integer token units", () => {
    expect(decodeActivationQuote(quote)).toMatchObject({ creditOut: 10_000_000n, creditedAtoms: 9_800_000n, activationFeeAtoms: 200_000n });
  });
  it("rejects malformed ABI output", () => expect(() => decodeActivationQuote("0x")).toThrow());
  it("reads live quote without a wallet transaction", async () => {
    const result = await readActivationQuote(provider(), account, "12.5", 8);
    expect(result.usdgInput).toBe(12_500_000n);
    expect(result.fills).toBe(2n);
    expect(result.blockNumber).toBe(42n);
  });
  it("rejects wrong network and invalid amount", async () => {
    await expect(readActivationQuote(provider({eth_chainId: "0x1"}), account, "1", 8)).rejects.toThrow("Robinhood Chain");
    await expect(readActivationQuote(provider(), account, "0", 8)).rejects.toThrow("greater than zero");
  });
});
