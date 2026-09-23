import { describe, expect, it, vi } from "vitest";
import {
  FUNDING_EXECUTION_ENABLED, hasBytecode, prepareFundingPlan, readFundingSnapshot,
  ORBIO_EXCHANGE_ADDRESS, ORBIO_USDG_ADDRESS
} from "./funding";
import { type CreditSnapshot, type Eip1193Provider } from "./credit";
const address = "0x1234567890123456789012345678901234567890";
const credit: CreditSnapshot = { account: address, chainId: 4663, creditRaw: 90_000_000n,
  creditDecimals: 6, ethWei: 10000000000000n, blockNumber: 2n, readAt: new Date().toISOString() };
const funding = { account: address, chainId: 4663 as const, usdgRaw: 4_000_000n,
  usdgDecimals: 6 as const, exchangeDeployed: true, blockNumber: 2n, observedAt: new Date().toISOString() };

describe("funding readiness", () => {
  it("accepts deployed bytecode, not empty code", () => {
    expect(hasBytecode("0x1234")).toBe(true);
    expect(hasBytecode("0x")).toBe(false);
    expect(hasBytecode("0x0000")).toBe(false);
    expect(hasBytecode("bad")).toBe(false);
  });
  it("calculates a precise CREDIT gap without assuming an exchange price", () => {
    const result = prepareFundingPlan("100.000001", credit, funding);
    expect(result.shortfallRaw).toBe(10_000_001n);
    expect(result.usdgAvailableRaw).toBe(4_000_000n);
    expect(result.faceValueUsdgRaw).toBe(10_000_001n);
  });
  it("reports zero shortfall when holdings exceed target", () => {
    expect(prepareFundingPlan("0.01", credit, funding).shortfallRaw).toBe(0n);
  });
  it("rejects wallet mismatches and excessive decimals", () => {
    expect(() => prepareFundingPlan("1", credit, {...funding, account: "0x0000000000000000000000000000000000000001"})).toThrow(/mismatch/);
    expect(() => prepareFundingPlan("0.1234567", credit, funding)).toThrow(/decimal/);
  });
  it("reads real RPC state without requesting a signature or transaction", async () => {
    const request = vi.fn(async ({method, params}: {method:string;params?:readonly unknown[] | Record<string, unknown>}) => {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_accounts") return [address];
      if (method === "eth_getCode") return "0x608060";
      if (method === "eth_blockNumber") return "0x7b";
      if (method === "eth_call") return (params as readonly unknown[])[0] &&
        ((params as readonly {data?:string}[])[0]?.data === "0x313ce567" ? "0x6" : "0x3d0900");
      throw new Error(`Unexpected method: ${method}`);
    });
    const result = await readFundingSnapshot({request} satisfies Eip1193Provider, address);
    expect(result.usdgRaw).toBe(4_000_000n);
    expect(result.exchangeDeployed).toBe(true);
    expect(result.blockNumber).toBe(123n);
    expect(request.mock.calls.some(([args]) => ["eth_sendTransaction","personal_sign","eth_sign"].includes(args.method))).toBe(false);
    const calls = request.mock.calls.filter(([args])=>args.method==="eth_getCode");
    expect(calls.map(([args])=>(args.params as string[])[0]?.toLowerCase())).toEqual(expect.arrayContaining([ORBIO_USDG_ADDRESS, ORBIO_EXCHANGE_ADDRESS]));
  });
  it("does not allow activation or purchasing while contract/account attribution is unverified", () => {
    expect(FUNDING_EXECUTION_ENABLED).toBe(false);
  });
});
