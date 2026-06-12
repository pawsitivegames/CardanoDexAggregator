import { describe, it, expect } from "vitest";
import { decode, encode } from "cborg";
import { quoteExactIn, trueReserves } from "./quote";
import { decodePool } from "./decode";
import type { WingRidersV2Pool } from "./types";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import poolFixtures from "./__fixtures__/pools.json";

// Convert fixture JSON (with string bigints) to properly typed pools
const fixturePools: WingRidersV2Pool[] = poolFixtures.map((f: any) => ({
  poolId: f.poolId,
  assetA: f.assetA,
  assetB: f.assetB,
  reserveA: BigInt(f.reserveA),
  reserveB: BigInt(f.reserveB),
  treasuryA: BigInt(f.treasuryA),
  treasuryB: BigInt(f.treasuryB),
  stakingRewardsAda: BigInt(f.stakingRewardsAda),
  feeBasisPoints: BigInt(f.feeBasisPoints),
  adaIsAssetA: f.adaIsAssetA,
  adaIsAssetB: f.adaIsAssetB,
}));

describe("WingRidersV2 quoteExactIn", () => {
  describe("(a) Reference formula verification", () => {
    it("ADA->USDM should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n; // 1 ADA in lovelace

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Independently compute using the formula
      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;
      const numerator = amountIn * reserves.b * feeMod;
      const denominator = amountIn * feeMod + reserves.a * 10000n;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("USDM->ADA should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 500000000000n; // 500 USDM in base units

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;
      const numerator = amountIn * reserves.a * feeMod;
      const denominator = amountIn * feeMod + reserves.b * 10000n;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("WMT->ADA should match hand-computed reference", () => {
      const pool = fixturePools[1]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;
      const numerator = amountIn * reserves.a * feeMod;
      const denominator = amountIn * feeMod + reserves.b * 10000n;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(b) True-reserve subtraction test", () => {
    it("quoting against true reserves differs from quoting against raw reserves", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n;

      // Quote using the function (which uses trueReserves internally)
      const outputWithTrueReserves = quoteExactIn(pool, pool.assetA, amountIn);

      // Manually compute quote with RAW reserves (no treasury/staking subtraction)
      const feeMod = 10000n - pool.feeBasisPoints;
      const rawNumerator = amountIn * pool.reserveB * feeMod;
      const rawDenominator = amountIn * feeMod + pool.reserveA * 10000n;
      const outputWithRawReserves = rawNumerator / rawDenominator;

      // They should be different because treasury/staking is subtracted
      expect(outputWithTrueReserves).not.toBe(outputWithRawReserves);

      // True reserves are smaller (after subtracting treasury), so output should be LARGER
      // (smaller reserve out denominator -> larger output)
      expect(outputWithTrueReserves).toBeGreaterThan(outputWithRawReserves);
    });

    it("staking rewards ADA subtraction affects ADA-side reserve", () => {
      const pool = fixturePools[1]!; // Has stakingRewardsAda > 0

      const reserves = trueReserves(pool);

      // ADA side should have staking rewards subtracted
      const expectedTrueA = pool.reserveA - pool.treasuryA - pool.stakingRewardsAda;
      expect(reserves.a).toBe(expectedTrueA);

      // Non-ADA side should only have treasury subtracted
      const expectedTrueB = pool.reserveB - pool.treasuryB;
      expect(reserves.b).toBe(expectedTrueB);
    });

    it("zero treasury and staking has no effect on quote", () => {
      const pool: WingRidersV2Pool = {
        ...fixturePools[0]!,
        treasuryA: 0n,
        treasuryB: 0n,
        stakingRewardsAda: 0n,
      };

      const output = quoteExactIn(pool, pool.assetA, 1000000000n);

      // With zero treasury, true reserves = raw reserves
      const feeMod = 10000n - pool.feeBasisPoints;
      const numerator = 1000000000n * pool.reserveB * feeMod;
      const denominator = 1000000000n * feeMod + pool.reserveA * 10000n;
      const expected = numerator / denominator;

      expect(output).toBe(expected);
    });
  });

  describe("(c) k-invariant property on true reserves", () => {
    it("ADA->USDM: k-invariant (amountIn*feeMod + trueReserveIn*10000) * (trueReserveOut - out) >= trueReserveIn*trueReserveOut*10000", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n, 500000000000n];

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);

        // k-invariant: (x' * feeMod + x0 * 10000) * (y0 - y') >= x0 * y0 * 10000
        const leftSide = (amountIn * feeMod + reserves.a * 10000n) * (reserves.b - output);
        const rightSide = reserves.a * reserves.b * 10000n;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("USDM->ADA: k-invariant holds for multiple amounts", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [50000000000n, 100000000000n, 250000000000n, 500000000000n, 750000000000n];

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);

        const leftSide = (amountIn * feeMod + reserves.b * 10000n) * (reserves.a - output);
        const rightSide = reserves.b * reserves.a * 10000n;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("WMT pool with staking rewards: k-invariant across multiple amounts", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [10000000000n, 50000000000n, 100000000000n, 500000000000n, 1000000000000n];

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);

        const leftSide = (amountIn * feeMod + reserves.a * 10000n) * (reserves.b - output);
        const rightSide = reserves.a * reserves.b * 10000n;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });
  });

  describe("(d) Monotonicity and bounds", () => {
    it("larger amountIn -> larger amountOut", () => {
      const pool = fixturePools[0]!;
      const amounts = [100000000n, 500000000n, 1000000000n, 5000000000n, 10000000000n];

      const outputs = amounts.map((amt) => quoteExactIn(pool, pool.assetA, amt));

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThan(outputs[i - 1]);
      }
    });

    it("amountOut < trueReserveOut always", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n, 500000000000n];

      const reserves = trueReserves(pool);

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);
        expect(output).toBeLessThan(reserves.a);
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

  describe("(e) Cross-check vs Dexter's estimatedReceive formula", () => {
    it("our result matches Dexter's expanded form exactly", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n;

      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter formula (using our true reserves):
      // out = (amountIn * reserveOut * feeMod) / (amountIn * feeMod + reserveIn * 10000)
      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;
      const dexterNumerator = amountIn * reserves.b * feeMod;
      const dexterDenominator = amountIn * feeMod + reserves.a * 10000n;
      const dexterOutput = dexterNumerator / dexterDenominator;

      expect(ourOutput).toBe(dexterOutput);
    });

    it("Dexter equivalent across different pool", () => {
      const pool = fixturePools[2]!;
      const amountIn = 50000000000n;

      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      const reserves = trueReserves(pool);
      const feeMod = 10000n - pool.feeBasisPoints;
      const dexterNumerator = amountIn * reserves.b * feeMod;
      const dexterDenominator = amountIn * feeMod + reserves.a * 10000n;
      const dexterOutput = dexterNumerator / dexterDenominator;

      expect(ourOutput).toBe(dexterOutput);
    });
  });

  describe("(f) Decode test", () => {
    it("decodePool extracts reserves from UTxO assets, not datum", () => {
      // Asset policy ID as hex string
      const assetBPolicyHex = "70d44e1a92ff0a6f2f37144877e59bc313ce007b3b560717e2e6e78755534443004";

      // Create a synthetic UTxO with different asset amounts than what might be in datum
      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "addr1...",
        assets: [
          { unit: "lovelace", quantity: 5000000000000n },
          {
            unit: assetBPolicyHex, // Match this with the asset unit built from datum
            quantity: 4950000000000n,
          },
        ],
      };

      // Create a synthetic CBOR datum with the WingRiders V2 structure
      // For testing, use simple numbers that can be encoded
      const datumFields = [
        new Uint8Array([0]), // requestValidatorHash (placeholder)
        "", // assetA policy id (empty = lovelace)
        "", // assetA asset name (empty = lovelace)
        assetBPolicyHex, // assetB policy id (hex string that CBOR will treat as bytes)
        "", // assetB asset name
        35, // feeBasisPoints
        25, // protocolFeeInBasis
        10, // projectFeeInBasis
        25, // feeBasis (not used)
        0, // agentFeeAda
        0, // lastInteraction
        100000000, // treasuryA
        50000000, // treasuryB
      ];

      const datumConstr = {
        tag: 0,
        fields: datumFields,
      };

      const datumCbor = Buffer.from(encode(datumConstr)).toString("hex");

      const pool = decodePool(utxo, datumCbor, 0n);

      // Verify reserves come from UTxO assets
      expect(pool.reserveA).toBe(5000000000000n);
      expect(pool.reserveB).toBe(4950000000000n);

      // Verify treasury from datum
      expect(pool.treasuryA).toBe(100000000n);
      expect(pool.treasuryB).toBe(50000000n);

      // Verify asset identification
      expect(pool.assetA).toBe("lovelace");
      expect(pool.adaIsAssetA).toBe(true);
      expect(pool.adaIsAssetB).toBe(false);
    });

    it("decodePool with staking rewards parameter", () => {
      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "addr1...",
        assets: [
          { unit: "lovelace", quantity: 10000000000000n },
          {
            unit: "7efd3857144b2d91e7b853bcd34faf50b2e723220c83112caa55e1414d5d4d54",
            quantity: 5000000000000n,
          },
        ],
      };

      const datumFields = [
        new Uint8Array([0]),
        "",
        "",
        Buffer.from("7efd3857144b2d91e7b853bcd34faf50b2e723220c83112caa55e1414d5d4d54", "hex"),
        "",
        35,
        25,
        10,
        25,
        0,
        0,
        50000000,
        100000000,
      ];

      const datumConstr = {
        tag: 0,
        fields: datumFields,
      };

      const datumCbor = Buffer.from(encode(datumConstr)).toString("hex");
      const stakingRewards = 500000000n;

      const pool = decodePool(utxo, datumCbor, stakingRewards);

      expect(pool.stakingRewardsAda).toBe(stakingRewards);
      expect(pool.adaIsAssetA).toBe(true);

      // Verify true reserves computation
      const reserves = trueReserves(pool);
      expect(reserves.a).toBe(10000000000000n - 50000000n - stakingRewards);
      expect(reserves.b).toBe(5000000000000n - 100000000n);
    });
  });

  describe("(g) Integration: quote with decoded pool", () => {
    it("quote works correctly with decoded pool", () => {
      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "addr1...",
        assets: [
          { unit: "lovelace", quantity: 1500000000000n },
          {
            unit: "e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed724d494e",
            quantity: 750000000000n,
          },
        ],
      };

      const datumFields = [
        new Uint8Array([0]),
        "",
        "",
        Buffer.from("e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed724d494e", "hex"),
        "",
        35,
        25,
        10,
        25,
        0,
        0,
        200000000,
        150000000,
      ];

      const datumConstr = {
        tag: 0,
        fields: datumFields,
      };

      const datumCbor = Buffer.from(encode(datumConstr)).toString("hex");
      const pool = decodePool(utxo, datumCbor, 250000000n);

      const amountIn = 1000000000n;
      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Should produce a positive output less than true reserve of output asset
      expect(output).toBeGreaterThan(0n);

      const reserves = trueReserves(pool);
      expect(output).toBeLessThan(reserves.b);
    });
  });
});
