/**
 * Curve StableSwap invariant math for Minswap Stableswap.
 *
 * References:
 * - vendor/reference/minswap-stableswap/stableswap-docs/formula.md
 * - vendor/reference/minswap-sdk/src/calculate.ts (StableswapCalculation)
 *
 * Invariant: A·n^n·Σx + D = A·D·n^n + D^(n+1)/(n^n·Πx)
 * where:
 *  - A: amplification coefficient
 *  - n: number of tokens
 *  - D: invariant (sum variant)
 *  - x: scaled balances (token balance * multiple)
 *
 * All calculations use Newton's method with a max iteration limit of 255.
 */

const MAX_ITERATIONS = 255;

/**
 * Compute D (the invariant) using Newton's method.
 * D is the "sum variant" that should remain roughly constant across swaps.
 *
 * Formula (from formula.md):
 * D_{n+1} = (n·DP + A·n^n·S)·D_n / ((n+1)·DP + (A·n^n - 1)·D_n)
 * where DP = D_n^(n+1) / (n^n · Π(balances))
 *       S  = Σ(balances)
 *       A·n^n is precomputed as `ann`
 *
 * @param mulBalances Balances scaled by multiples (in "calculation units")
 * @param amp Amplification coefficient A
 * @returns Invariant D
 */
export function getD(mulBalances: bigint[], amp: bigint): bigint {
  const sumMulBalances = mulBalances.reduce(
    (sum, balance) => sum + balance,
    0n
  );
  if (sumMulBalances === 0n) {
    return 0n;
  }

  const length = BigInt(mulBalances.length);
  let dPrev = 0n;
  let d = sumMulBalances;
  const ann = amp * length; // A·n^n

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Compute DP = d^(n+1) / (n^n · Π(mulBalances))
    let dp = d;
    for (const mulBalance of mulBalances) {
      dp = (dp * d) / (mulBalance * length);
    }

    dPrev = d;
    // Newton iteration: D_{n+1} = (n·DP + A·n^n·S)·D_n / ((n+1)·DP + (A·n^n - 1)·D_n)
    d =
      ((ann * sumMulBalances + dp * length) * d) /
      ((ann - 1n) * d + (length + 1n) * dp);

    // Converge when |D - D_prev| <= 1
    if (d > dPrev) {
      if (d - dPrev <= 1n) {
        break;
      }
    } else {
      if (dPrev - d <= 1n) {
        break;
      }
    }
  }
  return d;
}

/**
 * Compute the new balance y of token j after token i balance changes to x.
 * Uses Newton's method to solve the StableSwap invariant for y.
 *
 * Formula (from formula.md):
 * y_i = (y_{i-1}^2 + c) / (2·y_{i-1} + b - D)
 * where:
 *   D is computed via getD(xp, amp)
 *   S' = sum of all balances except j (after adding dx to token i)
 *   c = D^(n+1) / (A·n^n · n^n · Π'(balances except j))
 *   b = S' + D / (A·n^n)
 *
 * @param i Index of the token whose balance changed to x
 * @param j Index of the token whose new balance we compute
 * @param x New balance of token i (after adding amountIn * multiple[i])
 * @param xp Array of current scaled balances (before the swap)
 * @param amp Amplification coefficient A
 * @returns New balance y for token j
 */
export function getY(
  i: number,
  j: number,
  x: bigint,
  xp: bigint[],
  amp: bigint
): bigint {
  if (i === j || i < 0 || j < 0 || i >= xp.length || j >= xp.length) {
    throw new Error(
      "getY failed: i and j must be different and within bounds of xp"
    );
  }

  const length = BigInt(xp.length);
  const d = getD(xp, amp);
  let c = d;
  let s = 0n;
  const ann = amp * length; // A·n^n

  // Compute S' and c iteratively, skipping token j
  let _x = 0n;
  for (let index = 0; index < Number(length); index++) {
    if (index === i) {
      _x = x;
    } else if (index !== j) {
      _x = xp[index];
    } else {
      continue;
    }
    s += _x;
    c = (c * d) / (_x * length);
  }

  // Final computation of c: multiply by D / (A·n^n · n^n)
  c = (c * d) / (ann * length);
  const b = s + d / ann;

  let yPrev = 0n;
  let y = d;

  // Newton iteration for y: y_i = (y_{i-1}^2 + c) / (2·y_{i-1} + b - D)
  for (let index = 0; index < MAX_ITERATIONS; index++) {
    yPrev = y;
    y = (y * y + c) / (2n * y + b - d);

    // Converge when |y - y_prev| <= 1
    if (y > yPrev) {
      if (y - yPrev <= 1n) {
        break;
      }
    } else {
      if (yPrev - y <= 1n) {
        break;
      }
    }
  }

  return y;
}
