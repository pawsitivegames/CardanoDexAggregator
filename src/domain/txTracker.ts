import { TX_POLL_INTERVAL_MS, TX_POLL_TIMEOUT_MS, BLOCKFROST_BASE_URLS } from "../config/networks";

export type TxStatus =
  | { status: "building" }
  | { status: "awaiting_signature" }
  | { status: "submitted"; txHash: string; submittedAt: string }
  | { status: "pending"; txHash: string; confirmations: number; blockHeight?: number }
  | { status: "confirmed"; txHash: string; blockHeight: number; slot: number }
  | { status: "failed"; txHash?: string; error: string }
  | { status: "expired"; txHash?: string; error: string };

export type TxTracker = {
  status: TxStatus;
  txHash: string | null;
  error: string | null;
  startedAt: string;
};

export function createTxTracker(): TxTracker {
  return {
    status: { status: "building" },
    txHash: null,
    error: null,
    startedAt: new Date().toISOString(),
  };
}

type BlockfrostTxResponse = {
  hash: string;
  block: string | null;
  block_height: number | null;
  block_time: number | null;
  slot: number | null;
  index: number | null;
  output_amount: Array<{ unit: string; quantity: string }>;
  fees: string;
  deposit: string;
  size: number;
  invalid_before: string | null;
  invalid_hereafter: string | null;
  utxo_count: number;
  withdrawal_count: number;
  mir_cert_count: number;
  delegation_count: number;
  stake_cert_count: number;
  pool_update_count: number;
  pool_retire_count: number;
  asset_mint_or_burn_count: number;
  redeemer_count: number;
  valid_contract: boolean;
};

async function fetchTxInfo(network: string, txHash: string): Promise<BlockfrostTxResponse | null> {
  const baseUrl = BLOCKFROST_BASE_URLS[network];
  if (!baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl}/txs/${txHash}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      return null;
    }
    return (await response.json()) as BlockfrostTxResponse;
  } catch {
    return null;
  }
}

export type TxUpdateCallback = (status: TxStatus, txTracker: TxTracker) => void;

export async function trackTransaction(
  tracker: TxTracker,
  network: string,
  txHash: string,
  onUpdate: TxUpdateCallback,
): Promise<TxTracker> {
  const startTime = Date.now();
  tracker.txHash = txHash;
  tracker.status = { status: "submitted", txHash, submittedAt: new Date().toISOString() };
  onUpdate(tracker.status, tracker);

  while (Date.now() - startTime < TX_POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL_MS));

    const txInfo = await fetchTxInfo(network, txHash);
    if (!txInfo) continue;

    if (txInfo.block_height !== null && txInfo.block_height > 0) {
      tracker.status = {
        status: "confirmed",
        txHash,
        blockHeight: txInfo.block_height,
        slot: txInfo.slot ?? 0,
      };
      onUpdate(tracker.status, tracker);
      return tracker;
    }

    tracker.status = {
      status: "pending",
      txHash,
      confirmations: 0,
    };
    onUpdate(tracker.status, tracker);
  }

  tracker.status = { status: "expired", txHash, error: "Transaction confirmation timed out." };
  tracker.error = "Transaction confirmation timed out.";
  onUpdate(tracker.status, tracker);
  return tracker;
}
