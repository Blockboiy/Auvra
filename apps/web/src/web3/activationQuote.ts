/** Verified Exchange implementation ABI: read-only getActivationQuote(uint256,uint256).
 * No allowance, buy, buyAndActivate, transfer, burn or signing methods exist here.
 * Interface verified for implementation 0x2d253e157d8dbf0e1c75d700e78217bfc308fbb7 on 2026-09-23.
 * Runtime proxy may upgrade: verify expected token addresses on EVERY quote.
 */
import {
  ORBIO_CREDIT_ADDRESS, ROBINHOOD_CHAIN_ID, connectedAddress,
  currentChainId, rpcQuantity, validateAddress, type Eip1193Provider
} from "./credit";
import { ORBIO_EXCHANGE_ADDRESS, ORBIO_USDG_ADDRESS, hasBytecode } from "./funding";
import { parsePositiveTokenAmount } from "./transactions";

// Ethereum Keccak-256 4-byte selectors of verified implementation functions.
export const ACTIVATION_QUOTE_SELECTOR = "0x578850c3";
const CREDIT_GETTER = "0xa06d083c";
const USDG_GETTER = "0xf5b91b7b";
const MAX_FILLS_GETTER = "0xf97e7d43";
const MAX_UINT256 = (1n << 256n) - 1n;

export interface ActivationQuote {
  usdgInput: bigint;
  maxFills: number;
  creditOut: bigint;
  usdgSpent: bigint;
  orderbookFeeAtoms: bigint;
  fills: bigint;
  stopReason: bigint;
  creditedAtoms: bigint;
  activationFeeAtoms: bigint;
  account: string;
  blockNumber: bigint;
  fetchedAt: string;
}

function word(value: bigint): string {
  if (value < 0n || value > MAX_UINT256) throw new Error("Value exceeds uint256.");
  return value.toString(16).padStart(64, "0");
}

function addressResult(value: unknown): string {
  if (typeof value !== "string" || !/^0x[\da-f]{64}$/i.test(value) || !/^0{24}$/i.test(value.slice(2, 26))) {
    throw new Error("Unexpected exchange token-address response.");
  }
  return validateAddress(`0x${value.slice(-40)}`).toLowerCase();
}

/** ABI output: (Quote{creditOut,usdgSpent,feeAtoms,fills,reason},creditedAtoms,feeAtoms).
 * Entirely static tuple: exactly seven 32-byte words. Reject malformed output.
 */
export function decodeActivationQuote(raw: unknown): Pick<ActivationQuote,
  "creditOut" | "usdgSpent" | "orderbookFeeAtoms" | "fills" | "stopReason" | "creditedAtoms" | "activationFeeAtoms"> {
  if (typeof raw !== "string" || !/^0x[\da-f]{448}$/i.test(raw)) {
    throw new Error("Unexpected activation quote response; no estimate displayed.");
  }
  const values = Array.from({ length: 7 }, (_, index) => BigInt(`0x${raw.slice(2 + index * 64, 2 + (index + 1) * 64)}`));
  const [creditOut, usdgSpent, orderbookFeeAtoms, fills, stopReason, creditedAtoms, activationFeeAtoms] = values;
  if (creditOut === undefined || usdgSpent === undefined || orderbookFeeAtoms === undefined || fills === undefined ||
      stopReason === undefined || creditedAtoms === undefined || activationFeeAtoms === undefined) {
    throw new Error("Incomplete activation quote response.");
  }
  return { creditOut, usdgSpent, orderbookFeeAtoms, fills, stopReason, creditedAtoms, activationFeeAtoms };
}

export async function readActivationQuote(
  provider: Eip1193Provider, selectedAccount: string, amount: string, maxFillsInput: number
): Promise<ActivationQuote> {
  const account = validateAddress(selectedAccount);
  if (!Number.isSafeInteger(maxFillsInput) || maxFillsInput < 1 || maxFillsInput > 256) {
    throw new Error("Max fills must be a whole number between 1 and 256.");
  }
  const usdgInput = parsePositiveTokenAmount(amount, 6);
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) throw new Error("Switch wallet to Robinhood Chain.");
  const before = await connectedAddress(provider);
  if (!before || before.toLowerCase() !== account.toLowerCase()) throw new Error("Connected wallet changed. Refresh and retry.");
  const [code, credit, usdg, maxFillsResult, quoteResult, blockResult] = await Promise.all([
    provider.request({ method: "eth_getCode", params: [ORBIO_EXCHANGE_ADDRESS, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_EXCHANGE_ADDRESS, data: CREDIT_GETTER }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_EXCHANGE_ADDRESS, data: USDG_GETTER }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_EXCHANGE_ADDRESS, data: MAX_FILLS_GETTER }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ from: account, to: ORBIO_EXCHANGE_ADDRESS,
      data: `${ACTIVATION_QUOTE_SELECTOR}${word(usdgInput)}${word(BigInt(maxFillsInput))}` }, "latest"] }),
    provider.request({ method: "eth_blockNumber" })
  ]);
  if (!hasBytecode(code)) throw new Error("Orbio Exchange bytecode is unavailable on this network.");
  if (addressResult(credit) !== ORBIO_CREDIT_ADDRESS.toLowerCase() || addressResult(usdg) !== ORBIO_USDG_ADDRESS.toLowerCase()) {
    throw new Error("Exchange token configuration differs from expected contracts. Quote blocked.");
  }
  if (BigInt(maxFillsInput) > rpcQuantity(maxFillsResult)) throw new Error("Requested max fills exceeds the contract limit.");
  const decoded = decodeActivationQuote(quoteResult);
  const after = await connectedAddress(provider);
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID || !after || after.toLowerCase() !== account.toLowerCase()) {
    throw new Error("Wallet account/network changed during quote. Refresh and retry.");
  }
  return { ...decoded, usdgInput, maxFills: maxFillsInput, account, blockNumber: rpcQuantity(blockResult),
    fetchedAt: new Date().toISOString() };
}
