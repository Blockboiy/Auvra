import { describe, expect, it, vi } from "vitest";
import { ORBIO_CREDIT_ADDRESS, ROBINHOOD_CHAIN_ID, type CreditSnapshot, type Eip1193Provider } from "./credit";
import {
  encodeCreditTransfer, parsePositiveTokenAmount, prepareCreditTransfer,
  submitCreditTransfer, checkTransferReceipt, transferExplorerUrl, type TransferRecord
} from "./transactions";

const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const hash = "0x" + "b".repeat(64);
const snapshot: CreditSnapshot = {
  account: sender, chainId: ROBINHOOD_CHAIN_ID, creditRaw: 90_000_000n,
  creditDecimals: 6, ethWei: 10n ** 16n, blockNumber: 100n,
  readAt: "2026-09-23T00:00:00Z"
};
function provider(options: { chain?: string; account?: string; eth?: string; credit?: string; rejectSend?: boolean } = {}) {
  const calls: string[] = [];
  const p: Eip1193Provider = {
    request: vi.fn(async ({ method, params }) => {
      calls.push(method);
      switch (method) {
        case "eth_chainId": return options.chain ?? "0x1237";
        case "eth_accounts": return [options.account ?? sender];
        case "eth_getCode": return "0x60806040";
        case "eth_call": return (params as unknown[])[0] &&
          ((params as Array<{ data: string }>)[0]?.data === "0x313ce567" ? "0x6" : options.credit ?? "0x55d4a80");
        case "eth_getBalance": return options.eth ?? "0x2386f26fc10000";
        case "eth_blockNumber": return "0x64";
        case "eth_estimateGas": return "0xc350";
        case "eth_gasPrice": return "0x3b9aca00";
        case "eth_sendTransaction": if (options.rejectSend) throw { code: 4001, message: "Rejected" }; return hash;
        default: throw new Error(`Unexpected ${method}`);
      }
    })
  };
  return { p, calls };
}
const record: TransferRecord = {
  hash, from: sender, recipient, creditRaw: "1000000", decimals: 6,
  chainId: ROBINHOOD_CHAIN_ID, contract: ORBIO_CREDIT_ADDRESS,
  status: "submitted", submittedAt: "2026-09-23T00:00:00.000Z"
};
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

describe("CREDIT transaction guardrails", () => {
  it("parses exact six-decimal quantities and rejects invalid inputs", () => {
    expect(parsePositiveTokenAmount("0.000001", 6)).toBe(1n);
    expect(parsePositiveTokenAmount("90", 6)).toBe(90_000_000n);
    for (const input of ["0", "-1", "1e4", "1,000", "0.0000001", "  "]) {
      expect(() => parsePositiveTokenAmount(input, 6)).toThrow();
    }
  });
  it("encodes the ERC20 recipient and amount without floating point math", () => {
    const data = encodeCreditTransfer(recipient, 1_000_000n);
    expect(data).toMatch(/^0xa9059cbb[0-9a-f]{128}$/);
    expect(data.slice(10, 74)).toBe(recipient.slice(2).padStart(64, "0"));
    expect(data.slice(74)).toBe((1_000_000n).toString(16).padStart(64, "0"));
    expect(() => encodeCreditTransfer("0x" + "0".repeat(40), 1n)).toThrow();
  });
  it("preflights chain, recipient, token balance and gas without sending", async () => {
    const { p, calls } = provider();
    const quote = await prepareCreditTransfer(p, snapshot, recipient, "1");
    expect(quote.creditRaw).toBe(1_000_000n);
    expect(quote.estimatedFeeWei).toBe(50_000n * 1_000_000_000n);
    expect(calls).not.toContain("eth_sendTransaction");
    await expect(prepareCreditTransfer(provider({ chain: "0x1" }).p, snapshot, recipient, "1")).rejects.toThrow("Robinhood Chain");
    await expect(prepareCreditTransfer(provider({ credit: "0x0" }).p, snapshot, recipient, "1")).rejects.toThrow("Insufficient CREDIT");
    await expect(prepareCreditTransfer(provider({ eth: "0x1" }).p, snapshot, recipient, "1")).rejects.toThrow("ETH balance");
  });
  it("sends once after a fresh check; enforces expiry and no automatic retry", async () => {
    const { p, calls } = provider();
    const quote = await prepareCreditTransfer(p, snapshot, recipient, "1", 100_000);
    const created = await submitCreditTransfer(p, quote, 100_001);
    expect(created.hash).toBe(hash);
    expect(calls.filter(method => method === "eth_sendTransaction")).toHaveLength(1);
    await expect(submitCreditTransfer(p, quote, 220_001)).rejects.toThrow("expired");
    const denied = provider({ rejectSend: true });
    await expect(submitCreditTransfer(denied.p, quote, 100_001)).rejects.toMatchObject({ code: 4001 });
    expect(denied.calls.filter(method => method === "eth_sendTransaction")).toHaveLength(1);
  });
  it("does not claim success without the expected Transfer event", async () => {
    const p: Eip1193Provider = { request: vi.fn(async ({ method }) => {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_getTransactionReceipt") return { transactionHash: hash, to: ORBIO_CREDIT_ADDRESS,
        from: sender, status: "0x1", blockNumber: "0x65", gasUsed: "0x10",
        logs: [{ address: ORBIO_CREDIT_ADDRESS, topics: [transferTopic,
          `0x${sender.slice(2).padStart(64, "0")}`, `0x${recipient.slice(2).padStart(64, "0")}`], data: "0xf4240" }] };
      throw new Error(method);
    }) };
    expect((await checkTransferReceipt(p, record)).status).toBe("confirmed");
    const suspicious: Eip1193Provider = { request: vi.fn(async ({ method }) => method === "eth_chainId" ? "0x1237" : {
      transactionHash: hash, to: ORBIO_CREDIT_ADDRESS, from: sender,
      status: "0x1", blockNumber: "0x65", gasUsed: "0x10", logs: []
    }) };
    expect((await checkTransferReceipt(suspicious, record)).status).toBe("verification_needed");
    expect(transferExplorerUrl(hash)).toContain(hash);
  });
});
