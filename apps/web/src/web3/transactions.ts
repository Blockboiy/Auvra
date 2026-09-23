/**
 * Auvra Phase 2: deliberately narrow user-signed ERC-20 CREDIT transfers.
 * No custodial key, delegated authority, automatic spending, speculative ABI,
 * token approval, activation or purchase is implemented here.
 */
import {
  ORBIO_CREDIT_ADDRESS, ROBINHOOD_CHAIN_ID, currentChainId, connectedAddress,
  readCreditSnapshot, validateAddress, rpcQuantity,
  type CreditSnapshot, type Eip1193Provider
} from "./credit";

const TX_HASH = /^0x[a-f\d]{64}$/i;
const ZERO = /^0x0{40}$/i;
const TRANSFER_SELECTOR = "0xa9059cbb"; // ERC-20 transfer(address,uint256)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TRANSFER_QUOTE_LIFETIME_MS = 120_000;
const LEDGER_PREFIX = "auvra.credit-transactions.v1";

export type TransferStatus = "submitted" | "confirmed" | "reverted" | "verification_needed";
export interface TransferQuote {
  from: string;
  recipient: string;
  creditRaw: bigint;
  decimals: number;
  data: string;
  contract: string;
  gasUnits: bigint;
  gasPriceWei: bigint;
  estimatedFeeWei: bigint;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  createdAt: number;
}
export interface TransferRecord {
  hash: string;
  from: string;
  recipient: string;
  creditRaw: string;
  decimals: number;
  chainId: typeof ROBINHOOD_CHAIN_ID;
  contract: string;
  status: TransferStatus;
  submittedAt: string;
  checkedAt?: string;
  blockNumber?: string;
  gasUsed?: string;
  effectiveGasPriceWei?: string;
}

export function parsePositiveTokenAmount(input: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Unsupported CREDIT precision.");
  if (typeof input !== "string" || !/^\d+(?:\.\d+)?$/.test(input.trim())) {
    throw new Error("Enter a positive token amount without commas or symbols.");
  }
  const [whole, fraction = ""] = input.trim().split(".");
  if (fraction.length > decimals) throw new Error(`CREDIT supports up to ${decimals} decimal places.`);
  const quantity = BigInt(whole ?? "0") * (10n ** BigInt(decimals)) + BigInt((fraction.padEnd(decimals, "0") || "0"));
  if (quantity <= 0n) throw new Error("Amount must be greater than zero.");
  if (quantity >= 2n ** 256n) throw new Error("Amount exceeds the contract's supported range.");
  return quantity;
}

export function encodeCreditTransfer(recipient: string, quantity: bigint): string {
  const target = validateAddress(recipient);
  if (ZERO.test(target)) throw new Error("The zero address cannot receive a transfer.");
  if (quantity <= 0n || quantity >= 2n ** 256n) throw new Error("Invalid transfer amount.");
  return `${TRANSFER_SELECTOR}${target.slice(2).toLowerCase().padStart(64, "0")}${quantity.toString(16).padStart(64, "0")}`;
}

function quantityHex(value: bigint): string { return `0x${value.toString(16)}`; }

async function assertSelectedWallet(provider: Eip1193Provider, expected: string): Promise<void> {
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) throw new Error("Switch to Robinhood Chain before proceeding.");
  const actual = await connectedAddress(provider);
  if (!actual || actual.toLowerCase() !== validateAddress(expected).toLowerCase()) {
    throw new Error("The selected wallet account changed. Prepare a new transaction.");
  }
}

/** Read latest balances again immediately before preparing. Never trust a stale UI snapshot. */
export async function prepareCreditTransfer(
  provider: Eip1193Provider, snapshot: CreditSnapshot, recipientInput: string, amountInput: string,
  now = Date.now()
): Promise<TransferQuote> {
  const from = validateAddress(snapshot.account);
  const recipient = validateAddress(recipientInput.trim());
  if (recipient.toLowerCase() === from.toLowerCase()) throw new Error("Choose a different recipient account.");
  if (snapshot.chainId !== ROBINHOOD_CHAIN_ID) throw new Error("Wrong network in wallet snapshot.");
  await assertSelectedWallet(provider, from);
  const latest = await readCreditSnapshot(provider, from);
  if (latest.creditDecimals !== 6) throw new Error("CREDIT decimals differ from the documented 6. Transfers disabled pending review.");
  const creditRaw = parsePositiveTokenAmount(amountInput, latest.creditDecimals);
  if (creditRaw > latest.creditRaw) throw new Error("Insufficient CREDIT balance.");
  const data = encodeCreditTransfer(recipient, creditRaw);
  const tx = { from, to: ORBIO_CREDIT_ADDRESS, data, value: "0x0" };
  const [gasEstimate, gasPrice] = await Promise.all([
    provider.request({ method: "eth_estimateGas", params: [tx] }),
    provider.request({ method: "eth_gasPrice" })
  ]);
  const gasUnits = rpcQuantity(gasEstimate);
  const gasPriceWei = rpcQuantity(gasPrice);
  if (!gasUnits || !gasPriceWei) throw new Error("Wallet returned an invalid gas estimate.");
  const estimatedFeeWei = gasUnits * gasPriceWei;
  // A buffer is used only to reject likely unfundable transactions, not as a promised final fee.
  if (latest.ethWei < estimatedFeeWei * 12n / 10n) {
    throw new Error("ETH balance may be insufficient for the estimated network fee and buffer.");
  }
  await assertSelectedWallet(provider, from);
  return {
    from, recipient, creditRaw, decimals: latest.creditDecimals, data,
    contract: ORBIO_CREDIT_ADDRESS, gasUnits, gasPriceWei, estimatedFeeWei,
    chainId: ROBINHOOD_CHAIN_ID, createdAt: now
  };
}

/** Exactly one wallet prompt. No retry on timeout or uncertain submission. */
export async function submitCreditTransfer(
  provider: Eip1193Provider, quote: TransferQuote, now = Date.now()
): Promise<TransferRecord> {
  if (now < quote.createdAt || now - quote.createdAt > TRANSFER_QUOTE_LIFETIME_MS) {
    throw new Error("Transaction preview expired. Prepare it again.");
  }
  if (quote.contract.toLowerCase() !== ORBIO_CREDIT_ADDRESS || quote.chainId !== ROBINHOOD_CHAIN_ID ||
      quote.data !== encodeCreditTransfer(quote.recipient, quote.creditRaw)) {
    throw new Error("Transaction preview was modified. Prepare it again.");
  }
  await assertSelectedWallet(provider, quote.from);
  // Refresh immediately before signing; if amount or gas availability has changed, fail closed.
  const latest = await readCreditSnapshot(provider, quote.from);
  if (latest.creditRaw < quote.creditRaw || latest.creditDecimals !== quote.decimals) {
    throw new Error("Balance or token precision changed. Prepare a new transaction.");
  }
  if (latest.ethWei < quote.estimatedFeeWei * 12n / 10n) {
    throw new Error("ETH balance may no longer cover the network fee. Prepare again.");
  }
  await assertSelectedWallet(provider, quote.from);
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{
    from: quote.from, to: ORBIO_CREDIT_ADDRESS, data: quote.data, value: "0x0",
    gas: quantityHex(quote.gasUnits)
  }] });
  if (typeof hash !== "string" || !TX_HASH.test(hash)) {
    throw new Error("Wallet did not return a valid transaction hash. Check your wallet activity before trying again.");
  }
  return {
    hash, from: quote.from, recipient: quote.recipient,
    creditRaw: quote.creditRaw.toString(), decimals: quote.decimals,
    chainId: ROBINHOOD_CHAIN_ID, contract: ORBIO_CREDIT_ADDRESS,
    status: "submitted", submittedAt: new Date(now).toISOString()
  };
}

/** Chain-confirmed means transaction succeeded, not that any off-chain inference was activated. */
export async function checkTransferReceipt(provider: Eip1193Provider, record: TransferRecord): Promise<TransferRecord> {
  if (!TX_HASH.test(record.hash) || record.chainId !== ROBINHOOD_CHAIN_ID ||
      record.contract.toLowerCase() !== ORBIO_CREDIT_ADDRESS) throw new Error("Invalid saved transaction metadata.");
  if (await currentChainId(provider) !== ROBINHOOD_CHAIN_ID) throw new Error("Switch to Robinhood Chain to check the transaction.");
  const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [record.hash] });
  if (receipt === null) return { ...record, checkedAt: new Date().toISOString() };
  if (!receipt || typeof receipt !== "object") throw new Error("Wallet returned an invalid receipt.");
  const value = receipt as Record<string, unknown>;
  if (typeof value.transactionHash !== "string" || value.transactionHash.toLowerCase() !== record.hash.toLowerCase() ||
      typeof value.to !== "string" || value.to.toLowerCase() !== ORBIO_CREDIT_ADDRESS ||
      typeof value.from !== "string" || value.from.toLowerCase() !== record.from.toLowerCase()) {
    return { ...record, status: "verification_needed", checkedAt: new Date().toISOString() };
  }
  const code = rpcQuantity(value.status);
  if (code !== 0n && code !== 1n) throw new Error("Unexpected transaction receipt status.");
  if (code === 1n) {
    const logs: unknown = value.logs;
    const expectedFrom = `0x${record.from.slice(2).toLowerCase().padStart(64, "0")}`;
    const expectedTo = `0x${record.recipient.slice(2).toLowerCase().padStart(64, "0")}`;
    const expectedAmount = BigInt(record.creditRaw);
    // A successful receipt alone does not establish that the intended recipient got CREDIT.
    if (!Array.isArray(logs) || !logs.some((item) => {
      if (!item || typeof item !== "object") return false;
      const log = item as Record<string, unknown>;
      if (typeof log.address !== "string" || log.address.toLowerCase() !== ORBIO_CREDIT_ADDRESS || !Array.isArray(log.topics)) return false;
      const topics = log.topics as unknown[];
      if (topics.length !== 3 || topics.some((topic) => typeof topic !== "string")) return false;
      if ((topics[0] as string).toLowerCase() !== TRANSFER_TOPIC ||
          (topics[1] as string).toLowerCase() !== expectedFrom ||
          (topics[2] as string).toLowerCase() !== expectedTo) return false;
      try { return rpcQuantity(log.data) === expectedAmount; } catch { return false; }
    })) return { ...record, status: "verification_needed", checkedAt: new Date().toISOString() };
  }
  const blockNumber = rpcQuantity(value.blockNumber).toString();
  const gasUsed = rpcQuantity(value.gasUsed).toString();
  const gasPrice = value.effectiveGasPrice === undefined ? undefined : rpcQuantity(value.effectiveGasPrice).toString();
  return { ...record, status: code === 1n ? "confirmed" : "reverted",
    checkedAt: new Date().toISOString(), blockNumber, gasUsed, ...(gasPrice ? { effectiveGasPriceWei: gasPrice } : {}) };
}

export function transferExplorerUrl(hash: string): string {
  if (!TX_HASH.test(hash)) throw new Error("Invalid transaction hash.");
  return `https://robinhoodchain.blockscout.com/tx/${hash}`;
}

function ledgerKey(account: string): string { return `${LEDGER_PREFIX}.${ROBINHOOD_CHAIN_ID}.${validateAddress(account).toLowerCase()}`; }
export function loadTransferRecords(account: string): TransferRecord[] {
  try {
    const raw = window.localStorage.getItem(ledgerKey(account));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is TransferRecord =>
      x && typeof x === "object" && typeof x.hash === "string" && TX_HASH.test(x.hash) &&
      typeof x.from === "string" && x.from.toLowerCase() === account.toLowerCase() &&
      typeof x.contract === "string" && x.contract.toLowerCase() === ORBIO_CREDIT_ADDRESS &&
      x.chainId === ROBINHOOD_CHAIN_ID && typeof x.creditRaw === "string" && /^\d+$/.test(x.creditRaw) &&
      typeof x.recipient === "string" && /^0x[0-9a-f]{40}$/i.test(x.recipient) &&
      ["submitted", "confirmed", "reverted", "verification_needed"].includes(x.status)
    ).slice(0, 25);
  } catch { return []; }
}
export function saveTransferRecord(record: TransferRecord): void {
  try {
    const previous = loadTransferRecords(record.from);
    const unique = [record, ...previous.filter(item => item.hash.toLowerCase() !== record.hash.toLowerCase())].slice(0, 25);
    window.localStorage.setItem(ledgerKey(record.from), JSON.stringify(unique));
  } catch { /* Storage may be blocked. The tx hash must remain visible in the UI. */ }
}
