/** Auvra 2b: on-chain funding readiness. No state-changing contract calls in this module. */
import {
  ORBIO_CREDIT_ADDRESS, ROBINHOOD_CHAIN_ID, connectedAddress, currentChainId,
  encodeBalanceOf, rpcQuantity, validateAddress, type CreditSnapshot, type Eip1193Provider
} from "./credit";
import { parsePositiveTokenAmount } from "./transactions";

// Official Orbio protocol addresses (Robinhood Chain mainnet, chain 4663).
export const ORBIO_USDG_ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const ORBIO_EXCHANGE_ADDRESS = "0x6951ffd32630b05e06f50062aea801625a58ebc0";
export const USDG_DECIMALS = 6;

export interface FundingSnapshot {
  account: string;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  usdgRaw: bigint;
  usdgDecimals: typeof USDG_DECIMALS;
  exchangeDeployed: boolean;
  blockNumber: bigint;
  observedAt: string;
}

/** Live RPC reads of USDG and exchange code. Does not infer exchange liquidity or an Orbio API balance. */
export async function readFundingSnapshot(provider: Eip1193Provider, address: string): Promise<FundingSnapshot> {
  const account = validateAddress(address);
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) throw new Error("Switch to Robinhood Chain before checking funding.");
  const selected = await connectedAddress(provider);
  if (!selected || selected.toLowerCase() !== account.toLowerCase()) throw new Error("Wallet account changed. Refresh to continue.");
  const [usdgCode, exchangeCode, decimalsResult, balanceResult, blockResult] = await Promise.all([
    provider.request({ method: "eth_getCode", params: [ORBIO_USDG_ADDRESS, "latest"] }),
    provider.request({ method: "eth_getCode", params: [ORBIO_EXCHANGE_ADDRESS, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_USDG_ADDRESS, data: "0x313ce567" }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_USDG_ADDRESS, data: encodeBalanceOf(account) }, "latest"] }),
    provider.request({ method: "eth_blockNumber" })
  ]);
  if (!hasBytecode(usdgCode)) throw new Error("USDG contract has no bytecode on the selected network.");
  const decimals = rpcQuantity(decimalsResult);
  if (decimals !== 6n) throw new Error("USDG decimals differ from the documented 6. Funding readiness disabled.");
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) throw new Error("Wallet network changed during funding check.");
  const currentAccount = await connectedAddress(provider);
  if (!currentAccount || currentAccount.toLowerCase() !== account.toLowerCase()) throw new Error("Wallet account changed during funding check.");
  return { account, chainId: ROBINHOOD_CHAIN_ID, usdgRaw: rpcQuantity(balanceResult),
    usdgDecimals: USDG_DECIMALS, exchangeDeployed: hasBytecode(exchangeCode),
    blockNumber: rpcQuantity(blockResult), observedAt: new Date().toISOString() };
}

export function hasBytecode(value: unknown): boolean {
  return typeof value === "string" && /^0x[\da-f]+$/i.test(value) && !/^0x0+$/i.test(value);
}

export interface FundingPlan {
  targetCreditRaw: bigint;
  currentCreditRaw: bigint;
  shortfallRaw: bigint;
  usdgAvailableRaw: bigint;
  /** Hypothetical face-value comparison only, not an exchange price, order-book quote or transaction estimate. */
  faceValueUsdgRaw: bigint;
}

/** Prepare a transparent target/shortfall; never treat USDG holdings as an executable quote. */
export function prepareFundingPlan(target: string, credit: CreditSnapshot, funding: FundingSnapshot): FundingPlan {
  if (credit.account.toLowerCase() !== funding.account.toLowerCase() ||
      credit.chainId !== ROBINHOOD_CHAIN_ID || funding.chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error("Wallet or network mismatch. Refresh both balances.");
  }
  if (credit.creditDecimals !== 6 || funding.usdgDecimals !== 6) throw new Error("Unexpected token precision.");
  const targetCreditRaw = parsePositiveTokenAmount(target, 6);
  const shortfallRaw = targetCreditRaw > credit.creditRaw ? targetCreditRaw - credit.creditRaw : 0n;
  return { targetCreditRaw, currentCreditRaw: credit.creditRaw, shortfallRaw,
    usdgAvailableRaw: funding.usdgRaw, faceValueUsdgRaw: shortfallRaw };
}

export const FUNDING_EXECUTION_ENABLED = false;
export const FUNDING_DISABLED_REASON =
  "Activation and purchases are disabled until the exact verified contract ABI, wallet-to-Orbio account attribution and authoritative activated-balance check are integrated. No approval or transaction is sent.";
