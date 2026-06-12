import { describe, it, expect } from "vitest";
import { decode, encode } from "cborg";
import { quoteExactIn } from "./quote";
import { decodePool } from "./decode";
import type { MinswapV2Pool } from "./types";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import poolFixtures from "./__fixtures__/pools.json";

// Convert fixture JSON (with string bigints) to properly typed pools
const fixturePools: MinswapV2Pool[] = poolFixtures.map((f: any) => ({
  poolId: f.poolId,
  assetA: f.assetA,
  assetB: f.assetB,
  reserveA: BigInt(f.reserveA),
  reserveB: BigInt(f.reserveB),
  baseFeeANumerator: BigInt(f.baseFeeANumerator),
  baseFeeBNumerator: BigInt(f.baseFeeBNumerator),
  feeDenominator: BigInt(f.feeDenominator),
}));

describe("MinswapV2 quoteExactIn", () => {
  describe("(a) Reference formula verification", () => {
    it("ADA->MIN should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n; // 1 ADA in lovelace

      // Compute using the public function
      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Independently compute the formula inline to verify
      const fd = pool.feeDenominator;
      const fn = pool.baseFeeANumerator; // A->B uses A fee
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const numerator = (fd - fn) * amountIn * reserveOut;
      const denominator = reserveIn * fd + (fd - fn) * amountIn;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("MIN->ADA should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 500000000000n; // 500 MIN in base units

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      // Independently compute
      const fd = pool.feeDenominator;
      const fn = pool.baseFeeBNumerator; // B->A uses B fee
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;

      const numerator = (fd - fn) * amountIn * reserveOut;
      const denominator = reserveIn * fd + (fd - fn) * amountIn;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("SNEK->ADA should match hand-computed reference", () => {
      const pool = fixturePools[1]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      const fd = pool.feeDenominator;
      const fn = pool.baseFeeBNumerator;
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;

      const numerator = (fd - fn) * amountIn * reserveOut;
      const denominator = reserveIn * fd + (fd - fn) * amountIn;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(b) Constant-product k-invariant property", () => {
    it("ADA->MIN: k-invariant (reserveIn*fd + (fd-fn)*amountIn) * (reserveOut - out) >= reserveIn * reserveOut * fd", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n, 500000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.baseFeeANumerator;

        const leftSide = (pool.reserveA * fd + (fd - fn) * amountIn) * (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("MIN->ADA: k-invariant holds for multiple amounts", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [50000000000n, 100000000000n, 250000000000n, 500000000000n, 750000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.baseFeeBNumerator;

        const leftSide = (pool.reserveB * fd + (fd - fn) * amountIn) * (pool.reserveA - output);
        const rightSide = pool.reserveB * pool.reserveA * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("SNEK pool: k-invariant holds across fee structure", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [10000000000n, 50000000000n, 100000000000n, 500000000000n, 1000000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.baseFeeANumerator;

        const leftSide = (pool.reserveA * fd + (fd - fn) * amountIn) * (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });
  });

  describe("(c) Monotonicity and bounds", () => {
    it("larger amountIn -> larger-or-equal amountOut", () => {
      const pool = fixturePools[0]!;
      const amounts = [100000000n, 500000000n, 1000000000n, 5000000000n, 10000000000n];

      const outputs = amounts.map((amt) => quoteExactIn(pool, pool.assetA, amt));

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
      }
    });

    it("amountOut < reserveOut always", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n, 500000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);
        expect(output).toBeLessThan(pool.reserveA);
      });
    });

    it("throws on amountIn <= 0", () => {
      const pool = fixturePools[0]!;
      expect(() => quoteExactIn(pool, pool.assetA, 0n)).toThrow("amountIn must be > 0");
      expect(() => quoteExactIn(pool, pool.assetA, -100n)).toThrow("amountIn must be > 0");
    });

    it("throws on unknown assetIn", () => {
      const pool = fixturePools[0]!;
      const unknownAsset = "unknown.asset.unit";
      expect(() => quoteExactIn(pool, unknownAsset, 1000n)).toThrow("not found in pool");
    });
  });

  describe("(d) Cross-check vs Dexter flat-fee formula", () => {
    it("with equal per-direction fee, our result <= Dexter's within rounding", () => {
      // Dexter uses a single flat poolFeePercent expressed as basis points
      // estimatedReceive: (swapInAmount * reserveOut * poolFeeModifier) / (swapInAmount * poolFeeModifier + reserveIn * poolFeeMultiplier)
      // where poolFeeModifier = poolFeeMultiplier - feeBps, and poolFeeMultiplier = 10000

      const pool = fixturePools[0]!;
      const amountIn = 1000000000n;

      // Our formula
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter's flat-fee equivalent (assuming both directions have same fee)
      const poolFeeMultiplier = 10000n;
      const feeBps = pool.baseFeeANumerator; // assume equal fees
      const poolFeeModifier = poolFeeMultiplier - feeBps;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const dexterNumerator = amountIn * reserveOut * poolFeeModifier;
      const dexterDenominator = amountIn * poolFeeModifier + reserveIn * poolFeeMultiplier;
      const dexterOutput = dexterNumerator / dexterDenominator;

      // Should match exactly when fees are equal and structure is the same
      expect(ourOutput).toBe(dexterOutput);
    });

    it("Dexter formula expanded form matches our computation", () => {
      const pool = fixturePools[2]!; // USDM pool with balanced fee
      const amountIn = 50000000000n;

      // Our computation
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter style: expand the formula differently
      // swapOutNumerator = swapInAmount * reserveOut * poolFeeModifier
      // swapOutDenominator = swapInAmount * poolFeeModifier + reserveIn * poolFeeMultiplier
      const fd = 10000n;
      const fn = pool.baseFeeANumerator;
      const modifier = fd - fn;

      const dexterNum = amountIn * pool.reserveB * modifier;
      const dexterDen = amountIn * modifier + pool.reserveA * fd;
      const dexterOut = dexterNum / dexterDen;

      // Must match or be within 1 unit (floating point / rounding)
      expect(Math.abs(Number(ourOutput - dexterOut))).toBeLessThanOrEqual(1);
    });
  });

  describe("(e) Decode test: datum reserves override UTxO values", () => {
    it("should extract reserves from datum, not from UTxO assets", () => {
      // Build a synthetic pool datum
      // Pool datum structure (as Constr array):
      // [stakeCred, assetA, assetB, totalLiquidity, reserveA, reserveB, feeAN, feeBN, feeSharingOpt, dynFeeOpt]

      // For testing, create a minimal datum with known reserves
      const datumReserveA = 1500000000000n;
      const datumReserveB = 750000000000n;
      const datumFeeANum = 30n;
      const datumFeeBNum = 30n;

      // Build a Constr-style CBOR datum
      // Minswap V2 datum is Constr(0, [fields])
      const datumFields = [
        null, // stakeCred (simplified)
        ["", ""], // assetA as [policyId, assetName]
        ["", ""], // assetB as [policyId, assetName]
        100000000000n, // totalLiquidity
        datumReserveA, // reserveA
        datumReserveB, // reserveB
        datumFeeANum, // baseFeeANumerator
        datumFeeBNum, // baseFeeBNumerator
        null, // feeSharingNumerator
        false, // allowDynamicFee
      ];

      // Encode to CBOR hex using cborg
      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Create a UTxO with DIFFERENT reserve values in assets
      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "test-address",
        assets: [
          { unit: "lovelace", quantity: 5000000000n }, // Different from datum!
          { unit: "mock-asset-a", quantity: 999999999999n }, // Different from datum!
          { unit: "mock-asset-b", quantity: 111111111111n }, // Different from datum!
        ],
        inlineDatum: cborHex,
      };

      // Decode the pool
      const decodedPool = decodePool(utxo, cborHex);

      // ASSERT: reserves come from DATUM, not UTxO assets
      expect(decodedPool.reserveA).toBe(datumReserveA);
      expect(decodedPool.reserveB).toBe(datumReserveB);
      expect(decodedPool.baseFeeANumerator).toBe(datumFeeANum);
      expect(decodedPool.baseFeeBNumerator).toBe(datumFeeBNum);

      // Verify they DON'T match UTxO assets
      expect(decodedPool.reserveA).not.toBe(utxo.assets[1]?.quantity);
      expect(decodedPool.reserveB).not.toBe(utxo.assets[2]?.quantity);
    });

    it("decodePool extracts all required fields from datum", () => {
      const datumFields = [
        null,
        ["", ""],
        ["", ""],
        50000000000n,
        2000000000000n,
        1000000000000n,
        25n,
        35n,
        null,
        false,
      ];

      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [],
        inlineDatum: cborHex,
      };

      const pool = decodePool(utxo, cborHex);

      expect(pool.poolId).toBeDefined();
      expect(pool.assetA).toBeDefined();
      expect(pool.assetB).toBeDefined();
      expect(pool.reserveA).toBe(2000000000000n);
      expect(pool.reserveB).toBe(1000000000000n);
      expect(pool.baseFeeANumerator).toBe(25n);
      expect(pool.baseFeeBNumerator).toBe(35n);
      expect(pool.feeDenominator).toBe(10000n);
    });
  });
});
