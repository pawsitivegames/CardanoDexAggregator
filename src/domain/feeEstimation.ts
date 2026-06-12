import type { FeeBreakdown } from "./fees";
import { totalNonDexFeesAda } from "./quoteEngine";

// Cardano protocol fee parameters (approximate, updated periodically)
const TX_FEE_PER_BYTE = 44n;       // lovelace/byte
const TX_FEE_FIXED = 155_381n;     // lovelace

// Typical Cardano swap transaction size estimate
const ESTIMATED_SWAP_TX_SIZE = 950n;

// Script execution estimates for a typical DEX swap
const MEM_PRICE = 577n;            // Scaled for computation
const STEP_PRICE = 721n;           // Scaled for computation
const EST_MEM_UNITS = 300_000_000n;
const EST_CPU_STEPS = 600_000_000n;

export type FeeEstimate = {
  estimatedAda: number;
  estimatedLovelace: bigint;
  breakdown: {
    baseFee: bigint;
    scriptFee: bigint;
    batcherFee: bigint;
  };
  source: "server" | "estimated" | "unknown";
};

/**
 * Conservative fee estimate for a Cardano DEX swap transaction.
 * Since ClearRoute uses the Minswap Aggregator API for transaction building,
 * the exact fee is determined server-side. This provides a UI estimate.
 */
export function estimateSwapFee(fees: FeeBreakdown): FeeEstimate {
  const baseFee = TX_FEE_PER_BYTE * ESTIMATED_SWAP_TX_SIZE + TX_FEE_FIXED;

  const scriptFee =
    (MEM_PRICE * EST_MEM_UNITS + STEP_PRICE * EST_CPU_STEPS) / 10_000_000n;

  const batcherFee = BigInt(Math.round(fees.batcherFeeAda * 1_000_000));

  const totalLovelace = baseFee + scriptFee + batcherFee + 2_000_000n; // +2 ADA safety margin

  return {
    estimatedAda: Number(totalLovelace) / 1e6,
    estimatedLovelace: totalLovelace,
    breakdown: {
      baseFee,
      scriptFee,
      batcherFee,
    },
    source: "estimated",
  };
}

/**
 * Format a fee estimate for UI display.
 * Example: "~0.18 ADA (estimated)"
 */
export function formatFeeEstimate(estimate: FeeEstimate): string {
  const prefix = estimate.source === "estimated" ? "~" : "";
  const suffix = estimate.source === "estimated" ? " (estimated)" : "";
  return `${prefix}${estimate.estimatedAda.toFixed(2)} ADA${suffix}`;
}

/**
 * Compare total non-dex fees across adapter results for cost transparency.
 */
export function compareRouteFees(
  results: { adapterId: string; fees: FeeBreakdown }[],
): Map<string, number> {
  const feeMap = new Map<string, number>();
  for (const result of results) {
    feeMap.set(result.adapterId, totalNonDexFeesAda(result.fees));
  }
  return feeMap;
}
