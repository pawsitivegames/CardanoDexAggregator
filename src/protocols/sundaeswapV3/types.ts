/**
 * SundaeSwap V3 pool representation in normalized form.
 * Reserves are sourced from the datum, not the UTxO value.
 * Fees are directional (bidFeePer10k and askFeePer10k per 10000 denominator).
 *
 * Quirk 1: Directional fees — pick the right fee per direction (bidFeePer10k or askFeePer10k).
 * Quirk 2: Decaying fees — if a fee-decay schedule is present (openFee, finalFee, startSlot, endSlot),
 *          the effective fee at slot s = linear interpolation: floor-division in bigint arithmetic.
 *          If no decay schedule, use the flat directional fee.
 * Quirk 3: Protocol fees — subtract accumulated protocol_fees from the ADA-side reserve before quoting.
 */
export type SundaeSwapV3Pool = {
  poolId: string;
  assetA: string;
  assetB: string;
  reserveA: bigint;
  reserveB: bigint;
  bidFeePer10k: bigint;   // Fee per 10000 for B->A swap
  askFeePer10k: bigint;   // Fee per 10000 for A->B swap
  protocolFees: bigint;   // Accumulated protocol fees (typically on ADA side if adaIsAssetA)
  adaIsAssetA: boolean;   // True if assetA is lovelace, used to know which reserve has protocol_fees
  feeDecay?: {
    openFee: bigint;      // Opening fee per 10000
    finalFee: bigint;     // Final fee per 10000
    startSlot: number;    // Slot when decay starts
    endSlot: number;      // Slot when decay ends (final fee takes effect)
    direction?: 'bid' | 'ask' | 'both'; // Which direction the decay applies to (if absent, applies to the directional fee)
  };
};
