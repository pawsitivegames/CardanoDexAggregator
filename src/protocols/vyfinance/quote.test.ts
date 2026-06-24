import { describe, it, expect } from "vitest";
import { quoteExactIn } from "./quote";
import { decodePool } from "./decode";
import type { VyFinancePool } from "./types";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import poolFixtures from "./__fixtures__/pools.json";

// Convert fixture JSON (with string bigints) to properly typed pools
const fixturePools: VyFinancePool[] = poolFixtures.map((f: any) => ({
  poolId: f.poolId,
  assetA: f.assetA,
  assetB: f.assetB,
  reserveA: BigInt(f.reserveA),
  reserveB: BigInt(f.reserveB),
  feeBasisPoints: BigInt(f.feeBasisPoints),
}));

describe("VyFinance quoteExactIn", () => {
  describe("(a) Reference formula verification", () => {
    it("ADA->VYFI should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n; // 1 ADA in lovelace

      // Compute using the public function
      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Independently compute the formula inline to verify
      // feeMod = 10000 - feeBasisPoints
      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const numerator = amountIn * reserveOut * feeMod;
      const denominator = amountIn * feeMod + reserveIn * FEE_DENOMINATOR;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("VYFI->ADA should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 500000000000n; // 500 VYFI in base units

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      // Independently compute
      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;

      const numerator = amountIn * reserveOut * feeMod;
      const denominator = amountIn * feeMod + reserveIn * FEE_DENOMINATOR;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("ADA->USDV (balanced pool) should match hand-computed reference", () => {
      const pool = fixturePools[1]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const numerator = amountIn * reserveOut * feeMod;
      const denominator = amountIn * feeMod + reserveIn * FEE_DENOMINATOR;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(b) Constant-product k-invariant property", () => {
    it("ADA->VYFI: k-invariant holds for multiple amounts", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [
        100000000n,
        1000000000n,
        10000000000n,
        100000000000n,
        500000000000n,
      ];

      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);

        // k-invariant: (reserveIn * feeMod + amountIn * feeMod) * (reserveOut - out) >= reserveIn * reserveOut * feeMod
        const leftSide = (pool.reserveA * feeMod + amountIn * feeMod) *
          (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * feeMod;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("VYFI->ADA: k-invariant holds for multiple amounts", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [
        50000000000n,
        100000000000n,
        250000000000n,
        500000000000n,
        750000000000n,
      ];

      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);

        const leftSide = (pool.reserveB * feeMod + amountIn * feeMod) *
          (pool.reserveA - output);
        const rightSide = pool.reserveB * pool.reserveA * feeMod;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("VYFI->USDV (cross-token): k-invariant holds across fee structure", () => {
      const pool = fixturePools[2]!;
      const testAmounts = [
        10000000000n,
        50000000000n,
        100000000000n,
        500000000000n,
        1000000000000n,
      ];

      const FEE_DENOMINATOR = 10000n;
      const feeMod = FEE_DENOMINATOR - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);

        const leftSide = (pool.reserveA * feeMod + amountIn * feeMod) *
          (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * feeMod;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });
  });

  describe("(c) Monotonicity and bounds", () => {
    it("larger amountIn -> larger-or-equal amountOut", () => {
      const pool = fixturePools[0]!;
      const amounts = [
        100000000n,
        500000000n,
        1000000000n,
        5000000000n,
        10000000000n,
      ];

      const outputs = amounts.map((amt) =>
        quoteExactIn(pool, pool.assetA, amt)
      );

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
      }
    });

    it("amountOut < reserveOut always", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [
        100000000n,
        1000000000n,
        10000000000n,
        100000000000n,
        500000000000n,
      ];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);
        expect(output).toBeLessThan(pool.reserveA);
      });
    });

    it("throws on amountIn <= 0", () => {
      const pool = fixturePools[0]!;
      expect(() => quoteExactIn(pool, pool.assetA, 0n)).toThrow(
        "amountIn must be > 0"
      );
      expect(() => quoteExactIn(pool, pool.assetA, -100n)).toThrow(
        "amountIn must be > 0"
      );
    });

    it("throws on unknown assetIn", () => {
      const pool = fixturePools[0]!;
      const unknownAsset = "unknown.asset.unit";
      expect(() => quoteExactIn(pool, unknownAsset, 1000n)).toThrow(
        "not found in pool"
      );
    });
  });

  describe("(d) Cross-check vs Dexter vyfinance.ts estimatedReceive()", () => {
    it("should match Dexter's formula with feeMod calculation", () => {
      // Dexter uses poolFeePercent / 100, converted to basis points
      // For 0.3% fee: poolFeePercent = 0.3, feeBps = 30
      // poolFeeMultiplier = 1000 (in Dexter), feeMod = 1000 - 30 = 970
      // But we use 10000 as denominator for consistency:
      // feeBasisPoints = 30, feeMod = 10000 - 30 = 9970

      const pool = fixturePools[0]!;
      const amountIn = 1000000000n;

      // Our formula
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter formula (using our 10000 denominator for alignment):
      // swapOutNumerator = swapInAmount * reserveOut * poolFeeModifier
      // swapOutDenominator = swapInAmount * poolFeeModifier + reserveIn * poolFeeMultiplier
      // where poolFeeMultiplier = 10000, poolFeeModifier = 10000 - feeBasisPoints
      const poolFeeMultiplier = 10000n;
      const feeBasisPoints = pool.feeBasisPoints;
      const poolFeeModifier = poolFeeMultiplier - feeBasisPoints;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const dexterNumerator = amountIn * reserveOut * poolFeeModifier;
      const dexterDenominator =
        amountIn * poolFeeModifier + reserveIn * poolFeeMultiplier;
      const dexterOutput = dexterNumerator / dexterDenominator;

      // Should match exactly when fees and structure are the same
      expect(ourOutput).toBe(dexterOutput);
    });

    it("Dexter formula expanded form matches our computation", () => {
      const pool = fixturePools[1]!;
      const amountIn = 50000000000n;

      // Our computation
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter style: expand the formula
      // swapOutNumerator = swapInAmount * reserveOut * poolFeeModifier
      // swapOutDenominator = swapInAmount * poolFeeModifier + reserveIn * poolFeeMultiplier
      const fd = 10000n;
      const fn = pool.feeBasisPoints;
      const modifier = fd - fn;

      const dexterNum = amountIn * pool.reserveB * modifier;
      const dexterDen = amountIn * modifier + pool.reserveA * fd;
      const dexterOut = dexterNum / dexterDen;

      // Must match or be within 1 unit (rounding)
      expect(Math.abs(Number(ourOutput - dexterOut))).toBeLessThanOrEqual(1);
    });
  });

  describe("(e) Decode test: pool from UTxO value", () => {
    it("should extract reserves from UTxO assets, not from opaque datum", () => {
      // Build a synthetic UTxO with known asset reserves
      const assetA = "lovelace";
      const assetB = "d3edfe5eec201a78cde0f8b5e6a0a4f1e1b1c8c8c8c8c8c8c8c8c8c8c8c8c8c";
      const reserveA = 10000000000000n;
      const reserveB = 5000000000000n;
      const feeBasisPoints = 30n;

      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "test-pool-address",
        assets: [
          { unit: assetA, quantity: reserveA },
          { unit: assetB, quantity: reserveB },
        ],
        // NOTE: VyFinance datum is opaque and not decoded.
        // Pool discovery via api.vyfi.io/lp?networkId=1 (live concern, out of scope).
      };

      // Decode the pool
      const decodedPool = decodePool(utxo, {
        assetA,
        assetB,
        feeBasisPoints,
      });

      // ASSERT: reserves come from UTxO assets
      expect(decodedPool.reserveA).toBe(reserveA);
      expect(decodedPool.reserveB).toBe(reserveB);
      expect(decodedPool.feeBasisPoints).toBe(feeBasisPoints);
      expect(decodedPool.assetA).toBe(assetA);
      expect(decodedPool.assetB).toBe(assetB);
    });

    it("decodePool extracts reserves from UTxO.assets correctly", () => {
      const assetA = "lovelace";
      const assetB = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0";

      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [
          { unit: assetA, quantity: 50000000000000n },
          { unit: assetB, quantity: 50000000000000n },
        ],
      };

      const pool = decodePool(utxo, {
        assetA,
        assetB,
        feeBasisPoints: 30n,
      });

      expect(pool.poolId).toBeDefined();
      expect(pool.assetA).toBe(assetA);
      expect(pool.assetB).toBe(assetB);
      expect(pool.reserveA).toBe(50000000000000n);
      expect(pool.reserveB).toBe(50000000000000n);
      expect(pool.feeBasisPoints).toBe(30n);
    });

    it("throws if assetA not found in UTxO.assets", () => {
      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [
          { unit: "lovelace", quantity: 50000000000000n },
          // missing assetB
        ],
      };

      const unknownAsset =
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0";

      expect(() =>
        decodePool(utxo, {
          assetA: unknownAsset,
          assetB: "lovelace",
        })
      ).toThrow("not found in UTxO assets");
    });

    it("throws if assetB not found in UTxO.assets", () => {
      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [{ unit: "lovelace", quantity: 50000000000000n }],
      };

      const unknownAsset =
        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0";

      expect(() =>
        decodePool(utxo, {
          assetA: "lovelace",
          assetB: unknownAsset,
        })
      ).toThrow("not found in UTxO assets");
    });

    it("uses default feeBasisPoints of 30 if not provided", () => {
      const assetA = "lovelace";
      const assetB = "d3edfe5eec201a78cde0f8b5e6a0a4f1e1b1c8c8c8c8c8c8c8c8c8c8c8c8c8c";

      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [
          { unit: assetA, quantity: 10000000000000n },
          { unit: assetB, quantity: 5000000000000n },
        ],
      };

      // Call without feeBasisPoints
      const pool = decodePool(utxo, { assetA, assetB });

      expect(pool.feeBasisPoints).toBe(30n);
    });
  });
});
