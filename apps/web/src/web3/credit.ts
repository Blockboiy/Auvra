/** Read-only Robinhood Chain CREDIT integration. Never sends transactions or signs. */
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = "0x1237";
export const ROBINHOOD_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_EXPLORER = "https://robinhoodchain.blockscout.com";
// Source: https://www.orbio.so/protocol (Robinhood Chain, CREDIT contract).
export const ORBIO_CREDIT_ADDRESS = "0xe33322da1380e61e5ae5dfb21e7f62924c73004c";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HEX = /^0x[0-9a-fA-F]+$/;

export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
}

declare global {
  interface Window { ethereum?: Eip1193Provider }
}

export interface WalletOption { id: string; name: string; provider: Eip1193Provider }
export interface CreditSnapshot {
  account: string;
  chainId: number;
  creditRaw: bigint;
  creditDecimals: number;
  ethWei: bigint;
  blockNumber: bigint;
  readAt: string;
}

export function walletOptions(): WalletOption[] {
  if (typeof window === "undefined" || !window.ethereum) return [];
  const injected = window.ethereum;
  const providers = Array.isArray(injected.providers) && injected.providers.length ? injected.providers : [injected];
  return [...new Set(providers)].filter((provider) => typeof provider.request === "function")
    .map((provider, index) => ({
      id: `injected-${index}`,
      name: provider.isRabby ? "Rabby" : provider.isMetaMask ? "MetaMask" : `Browser wallet ${index + 1}`,
      provider
    }));
}

export function rpcQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !HEX.test(value)) throw new Error("Wallet returned an invalid blockchain quantity.");
  return BigInt(value);
}

export function validateAddress(value: unknown): string {
  if (typeof value !== "string" || !ADDRESS.test(value)) throw new Error("Wallet returned an invalid address.");
  return value;
}

export function encodeBalanceOf(account: string): string {
  return `0x70a08231${validateAddress(account).slice(2).toLowerCase().padStart(64, "0")}`;
}

export function formatUnits(value: bigint, decimals: number, displayDigits = 6): string {
  if (value < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36 ||
      !Number.isInteger(displayDigits) || displayDigits < 0 || displayDigits > 18) {
    throw new Error("Invalid token amount or precision.");
  }
  if (decimals === 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const remainder = value % base;
  const fraction = remainder.toString().padStart(decimals, "0").slice(0, displayDigits).replace(/0+$/, "");
  if (remainder !== 0n && !fraction && displayDigits > 0) return `<0.${"0".repeat(displayDigits - 1)}1`;
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function connectedAddress(provider: Eip1193Provider): Promise<string | null> {
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts)) throw new Error("Wallet returned an invalid account list.");
  return accounts.length ? validateAddress(accounts[0]) : null;
}

export async function currentChainId(provider: Eip1193Provider): Promise<number> {
  const quantity = rpcQuantity(await provider.request({ method: "eth_chainId" }));
  if (quantity > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid chain ID.");
  return Number(quantity);
}

export async function connectWallet(provider: Eip1193Provider): Promise<string> {
  // The ONLY method here that asks the user to expose an address; it does not sign or spend.
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("No wallet account was selected.");
  return validateAddress(accounts[0]);
}

export async function switchToRobinhood(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN_HEX }] });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
    if (code !== 4902 && code !== "4902") throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: ROBINHOOD_CHAIN_HEX,
      chainName: "Robinhood Chain",
      rpcUrls: [ROBINHOOD_RPC_URL],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      blockExplorerUrls: [ROBINHOOD_EXPLORER]
    }] });
    // wallet_addEthereumChain does not guarantee selection.
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ROBINHOOD_CHAIN_HEX }] });
  }
}

export async function readCreditSnapshot(provider: Eip1193Provider, account: string): Promise<CreditSnapshot> {
  const address = validateAddress(account);
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) {
    throw new Error("Switch your wallet to Robinhood Chain to read CREDIT.");
  }
  const [code, decimalsRaw, balanceRaw, ethRaw, blockRaw] = await Promise.all([
    provider.request({ method: "eth_getCode", params: [ORBIO_CREDIT_ADDRESS, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_CREDIT_ADDRESS, data: "0x313ce567" }, "latest"] }),
    provider.request({ method: "eth_call", params: [{ to: ORBIO_CREDIT_ADDRESS, data: encodeBalanceOf(address) }, "latest"] }),
    provider.request({ method: "eth_getBalance", params: [address, "latest"] }),
    provider.request({ method: "eth_blockNumber" })
  ]);
  if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code === "0x" || /^0x0+$/.test(code)) {
    throw new Error("CREDIT contract bytecode is unavailable on the selected network.");
  }
  const decimalsBig = rpcQuantity(decimalsRaw);
  if (decimalsBig > 36n) throw new Error("CREDIT contract reported unsupported decimals.");
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) {
    throw new Error("Wallet network changed while reading. Refresh after switching back.");
  }
  return {
    account: address,
    chainId: ROBINHOOD_CHAIN_ID,
    creditRaw: rpcQuantity(balanceRaw),
    creditDecimals: Number(decimalsBig),
    ethWei: rpcQuantity(ethRaw),
    blockNumber: rpcQuantity(blockRaw),
    readAt: new Date().toISOString()
  };
}

export function walletErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const code = "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code === 4001 || code === "4001") return "Wallet request declined. Nothing was signed or spent.";
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message.slice(0, 220);
    }
  }
  return "Wallet request failed. Check your wallet and try again.";
}
