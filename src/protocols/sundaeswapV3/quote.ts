import type { SundaeSwapV3Pool } from "./types";

/**
 * Quote an exact-in swap using the SundaeSwap V3 formula.
 *
 * Formula (from vendor/reference/dexter/src/dex/sundaeswap-v3.ts estimatedReceive):
 *   swapFee = (amountIn * feeBps + 9999) / 10000   // ceiling division, bigint
 *   out     = reserveOut - (reserveIn * reserveOut) / (reserveIn + amountIn - swapFee)
 *
 * Where feeBps is the directional fee per 10_000.
 *
 * Quirk 1 (Directional fees): A→B (ask) and B→A (bid) can differ.
 *   Pick the right fee per direction (bidFeePer10k / askFeePer10k).
 *
 * Quirk 2 (Decaying fees): If the datum has a fee-decay schedule (openFee, finalFee, startSlot, endSlot),
 *   the effective fee at slot s = linear interpolation:
 *     if s <= startSlot -> openFee
 *     if s >= endSlot -> finalFee
 *     else openFee + (finalFee - openFee) * (s - startSlot) / (endSlot - startSlot)  (floor division)
 *
 * Quirk 3 (Protocol fees): Subtract accumulated protocol_fees from the ADA-side reserve
 *   before applying the swap formula (the datum reserve is inflated by collected protocol fees).
 *
 * @param pool Pool state with reserves, directional fees, and optional decay schedule
 * @param assetIn Unit string of the input asset
 * @param amountIn Amount of input asset in smallest units
 * @param currentSlot Current blockchain slot (optional, for fee decay evaluation)
 * @returns Amount of output asset in smallest units, floored
 * @throws Error if amountIn <= 0 or assetIn is not in the pool
 */
export function quoteExactIn(
  pool: SundaeSwapV3Pool,
  assetIn: string,
  amountIn: bigint,
  currentSlot?: number,
): bigint {
  if (amountIn <= 0n) {
    throw new Error("amountIn must be > 0");
  }

  const isAtoB = assetIn === pool.assetA;
  const isBtoA = assetIn === pool.assetB;

  if (!isAtoB && !isBtoA) {
    throw new Error(`assetIn ${assetIn} not found in pool`);
  }

  // Determine reserves and directional fee
  let reserveIn: bigint;
  let reserveOut: bigint;
  let feePer10k: bigint;

  if (isAtoB) {
    // A -> B swap (ask)
    reserveIn = pool.reserveA;
    reserveOut = pool.reserveB;
    feePer10k = pool.askFeePer10k;
  } else {
    // B -> A swap (bid)
    reserveIn = pool.reserveB;
    reserveOut = pool.reserveA;
    feePer10k = pool.bidFeePer10k;
  }

  // Apply fee decay if a schedule is present
  feePer10k = computeEffectiveFee(pool, feePer10k, isAtoB ? "ask" : "bid", currentSlot);

  // Quirk 3: Subtract protocol_fees from the ADA-side reserve
  // If ADA is reserveOut, we need to reduce it; if ADA is reserveIn, reduce it
  if (pool.adaIsAssetA && isAtoB) {
    // A (ADA) is input, so reserveIn is the one with accumulated protocol_fees
    reserveIn = reserveIn - pool.protocolFees;
  } else if (pool.adaIsAssetA && isBtoA) {
    // A (ADA) is output, so reserveOut has accumulated protocol_fees
    reserveOut = reserveOut - pool.protocolFees;
  } else if (!pool.adaIsAssetA && isAtoB) {
    // B (ADA) is output
    reserveOut = reserveOut - pool.protocolFees;
  } else if (!pool.adaIsAssetA && isBtoA) {
    // B (ADA) is input
    reserveIn = reserveIn - pool.protocolFees;
  }

  // Compute swap fee: ceiling division
  // swapFee = (amountIn * feePer10k + 9999) / 10000
  const swapFee = (amountIn * feePer10k + 9999n) / 10000n;

  // Compute output:
  // out = reserveOut - (reserveIn * reserveOut) / (reserveIn + amountIn - swapFee)
  const denominator = reserveIn + amountIn - swapFee;
  const numerator = reserveIn * reserveOut;
  const out = reserveOut - numerator / denominator;

  return out;
}

/**
 * Compute effective fee accounting for any fee decay schedule.
 *
 * If no decay schedule or currentSlot is not provided, returns the base feePer10k.
 * Otherwise, linearly interpolates the fee between openFee and finalFee.
 *
 * @param pool The pool with optional feeDecay schedule
 * @param baseFee The base directional fee per 10000
 * @param direction The swap direction: 'ask' (A->B) or 'bid' (B->A)
 * @param currentSlot Current blockchain slot (optional)
 * @returns Effective fee per 10000
 */
function computeEffectiveFee(
  pool: SundaeSwapV3Pool,
  baseFee: bigint,
  direction: "ask" | "bid",
  currentSlot?: number,
): bigint {
  if (!pool.feeDecay || currentSlot === undefined) {
    return baseFee;
  }

  const decay = pool.feeDecay;

  // Check if decay applies to this direction
  if (decay.direction && decay.direction !== "both" && decay.direction !== direction) {
    return baseFee;
  }

  // Linear interpolation with floor division
  if (currentSlot <= decay.startSlot) {
    return decay.openFee;
  }

  if (currentSlot >= decay.endSlot) {
    return decay.finalFee;
  }

  // Interpolate: openFee + (finalFee - openFee) * (currentSlot - startSlot) / (endSlot - startSlot)
  const slotDelta = BigInt(currentSlot - decay.startSlot);
  const slotRange = BigInt(decay.endSlot - decay.startSlot);
  const feeDelta = decay.finalFee - decay.openFee;

  const interpolated = decay.openFee + (feeDelta * slotDelta) / slotRange;
  return interpolated;
}
