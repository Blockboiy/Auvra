import { describe, expect, it, vi } from "vitest";
import {
  ROBINHOOD_CHAIN_HEX, ORBIO_CREDIT_ADDRESS, connectWallet, encodeBalanceOf,
  formatUnits, readCreditSnapshot, rpcQuantity, switchToRobinhood, type Eip1193Provider
} from "./credit";

const ACCOUNT = "0x1111111111111111111111111111111111111111";

function provider(overrides: Record<string, unknown> = {}): Eip1193Provider & { request: ReturnType<typeof vi.fn> } {
  const request = vi.fn(async ({ method, params }: { method: string; params?: readonly unknown[] | Record<string, unknown> }) => {
    if (method in overrides) return overrides[method];
    if (method === "eth_chainId") return ROBINHOOD_CHAIN_HEX;
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_getBalance") return "0xde0b6b3a7640000";
    if (method === "eth_blockNumber") return "0x1234";
    if (method === "eth_call") {
      const first = (params as readonly unknown[])[0] as { data: string };
      return first.data === "0x313ce567" ? "0x6" : "0x5f5e100";
    }
    if (method === "eth_requestAccounts") return [ACCOUNT];
    return null;
  });
  return { request };
}

describe("CREDIT read-only wallet integration", () => {
  it("validates ABI input and formats exact integer units", () => {
    expect(encodeBalanceOf(ACCOUNT)).toBe(`0x70a08231${"1".repeat(40).padStart(64, "0")}`);
    expect(() => encodeBalanceOf("invalid")).toThrow();
    expect(rpcQuantity("0x12")).toBe(18n);
    expect(() => rpcQuantity("1.2")).toThrow();
    expect(formatUnits(1234500000000000000n, 18)).toBe("1.2345");
    expect(formatUnits(1n, 18)).toBe("<0.000001");
  });

  it("reads the official CREDIT contract without requesting a signature or transaction", async () => {
    const wallet = provider();
    const balance = await readCreditSnapshot(wallet, ACCOUNT);
    expect(balance.creditDecimals).toBe(6);
    expect(balance.creditRaw).toBe(100000000n);
    expect(balance.ethWei).toBe(1000000000000000000n);
    const methods = wallet.request.mock.calls.map((call) => (call[0] as { method: string }).method);
    expect(methods).not.toContain("eth_sendTransaction");
    expect(methods).not.toContain("personal_sign");
    expect(wallet.request.mock.calls.some((call) => (call[0] as { params?: readonly unknown[] }).params?.[0] && JSON.stringify(call[0]).includes(ORBIO_CREDIT_ADDRESS))).toBe(true);
  });

  it("refuses a wrong chain and missing bytecode", async () => {
    const wrong = provider({ eth_chainId: "0x1" });
    await expect(readCreditSnapshot(wrong, ACCOUNT)).rejects.toThrow(/Switch your wallet/);
    expect(wrong.request).toHaveBeenCalledTimes(1);
    await expect(readCreditSnapshot(provider({ eth_getCode: "0x" }), ACCOUNT)).rejects.toThrow(/bytecode/);
  });

  it("asks for wallet permission only on explicit connect", async () => {
    const wallet = provider();
    expect(await connectWallet(wallet)).toBe(ACCOUNT);
    expect(wallet.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("supports network switching and adding a missing network without signing", async () => {
    const request = vi.fn().mockRejectedValueOnce({ code: 4902 }).mockResolvedValue(undefined);
    await switchToRobinhood({ request });
    expect(request.mock.calls.map((call) => call[0].method)).toEqual([
      "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"
    ]);
  });
});
