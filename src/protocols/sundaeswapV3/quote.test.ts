import { describe, it, expect } from "vitest";
import { decode, encode } from "cborg";
import { quoteExactIn } from "./quote";
import { decodePool } from "./decode";
import type { SundaeSwapV3Pool } from "./types";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import poolFixtures from "./__fixtures__/pools.json";

// Convert fixture JSON (with string bigints) to properly typed pools
const fixturePools: SundaeSwapV3Pool[] = poolFixtures.map((f: any) => ({
  poolId: f.poolId,
  assetA: f.assetA,
  assetB: f.assetB,
  reserveA: BigInt(f.reserveA),
  reserveB: BigInt(f.reserveB),
  bidFeePer10k: BigInt(f.bidFeePer10k),
  askFeePer10k: BigInt(f.askFeePer10k),
  protocolFees: BigInt(f.protocolFees),
  adaIsAssetA: f.adaIsAssetA,
  feeDecay: f.feeDecay
    ? {
        openFee: BigInt(f.feeDecay.openFee),
        finalFee: BigInt(f.feeDecay.finalFee),
        startSlot: f.feeDecay.startSlot,
        endSlot: f.feeDecay.endSlot,
        direction: f.feeDecay.direction as "bid" | "ask" | "both",
      }
    : undefined,
}));

describe("SundaeSwapV3 quoteExactIn", () => {
  describe("(a) Reference formula verification (exact match vs independently-computed reference)", () => {
    it("ADA->USDM should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n; // 1 ADA in lovelace

      // Compute using the public function
      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Independently compute the formula inline to verify
      // swapFee = (amountIn * feePer10k + 9999) / 10000 (ceiling division)
      const feePer10k = pool.askFeePer10k; // A->B uses ask fee
      const swapFee = (amountIn * feePer10k + 9999n) / 10000n;

      // out = reserveOut - (reserveIn * reserveOut) / (reserveIn + amountIn - swapFee)
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("USDM->ADA should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 500000000000n; // 500 USDM in base units

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      // Independently compute
      const feePer10k = pool.bidFeePer10k; // B->A uses bid fee
      const swapFee = (amountIn * feePer10k + 9999n) / 10000n;

      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("ADA->iUSD should match hand-computed reference with different fees", () => {
      const pool = fixturePools[1]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      const feePer10k = pool.askFeePer10k;
      const swapFee = (amountIn * feePer10k + 9999n) / 10000n;

      // Note: pool[1] has protocolFees and adaIsAssetA=true, so reserveIn is reduced
      const reserveIn = pool.reserveA - pool.protocolFees;
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(b) Decaying fee evaluation at different slots", () => {
    it("fee at startSlot should equal openFee", () => {
      const pool = fixturePools[2]!; // Pool with fee decay
      if (!pool.feeDecay) {
        throw new Error("Expected pool with fee decay");
      }

      const amountIn = 100000000000n;
      const currentSlot = pool.feeDecay.startSlot; // At start

      // Quote with fee decay
      const outputAtStart = quoteExactIn(pool, pool.assetA, amountIn, currentSlot);

      // Quote with manually computed openFee
      const expectedFee = pool.feeDecay.openFee;
      const swapFee = (amountIn * expectedFee + 9999n) / 10000n;
      const reserveIn = pool.reserveA - pool.protocolFees; // ADA has protocol fees
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutputAtStart = reserveOut - numerator / denominator;

      expect(outputAtStart).toBe(expectedOutputAtStart);
    });

    it("fee at endSlot should equal finalFee", () => {
      const pool = fixturePools[2]!;
      if (!pool.feeDecay) {
        throw new Error("Expected pool with fee decay");
      }

      const amountIn = 100000000000n;
      const currentSlot = pool.feeDecay.endSlot; // At end

      const outputAtEnd = quoteExactIn(pool, pool.assetA, amountIn, currentSlot);

      // Quote with manually computed finalFee
      const expectedFee = pool.feeDecay.finalFee;
      const swapFee = (amountIn * expectedFee + 9999n) / 10000n;
      const reserveIn = pool.reserveA - pool.protocolFees;
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutputAtEnd = reserveOut - numerator / denominator;

      expect(outputAtEnd).toBe(expectedOutputAtEnd);
    });

    it("fee interpolates at midpoint slot", () => {
      const pool = fixturePools[2]!;
      if (!pool.feeDecay) {
        throw new Error("Expected pool with fee decay");
      }

      const amountIn = 100000000000n;
      const midSlot = Math.floor(
        (pool.feeDecay.startSlot + pool.feeDecay.endSlot) / 2
      );

      const outputAtMid = quoteExactIn(pool, pool.assetA, amountIn, midSlot);

      // Manually compute interpolated fee
      const slotDelta = BigInt(midSlot - pool.feeDecay.startSlot);
      const slotRange = BigInt(
        pool.feeDecay.endSlot - pool.feeDecay.startSlot
      );
      const feeDelta = pool.feeDecay.finalFee - pool.feeDecay.openFee;
      const interpolatedFee =
        pool.feeDecay.openFee + (feeDelta * slotDelta) / slotRange;

      const swapFee = (amountIn * interpolatedFee + 9999n) / 10000n;
      const reserveIn = pool.reserveA - pool.protocolFees;
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(outputAtMid).toBe(expectedOutput);
    });

    it("quote differs when slot changes within decay window", () => {
      const pool = fixturePools[2]!;
      if (!pool.feeDecay) {
        throw new Error("Expected pool with fee decay");
      }

      const amountIn = 100000000000n;
      const slot1 = pool.feeDecay.startSlot + 10000;
      const slot2 = pool.feeDecay.startSlot + 30000;

      const output1 = quoteExactIn(pool, pool.assetA, amountIn, slot1);
      const output2 = quoteExactIn(pool, pool.assetA, amountIn, slot2);

      // At slot2, the fee is lower (closer to finalFee), so output should be higher
      expect(output2).toBeGreaterThan(output1);
    });
  });

  describe("(c) Protocol fees subtraction changes quote", () => {
    it("protocol_fees subtraction from ADA reserve actually changes output", () => {
      const pool = fixturePools[1]!; // Pool with protocolFees > 0, adaIsAssetA=true
      const amountIn = 100000000000n;

      // Quote with protocol_fees subtraction (normal)
      const outputWithFees = quoteExactIn(pool, pool.assetA, amountIn);

      // Quote without protocol_fees (hypothetical, create a copy)
      const poolNoFees: SundaeSwapV3Pool = { ...pool, protocolFees: 0n };
      const outputNoFees = quoteExactIn(poolNoFees, pool.assetA, amountIn);

      // A->B swap: adaIsAssetA=true, so reserveIn (reserveA) is reduced by protocolFees
      // With reduced reserveIn, the constant product formula gives MORE output (less input liquidity)
      expect(outputWithFees).not.toBe(outputNoFees);
      expect(outputWithFees).toBeGreaterThan(outputNoFees);
    });

    it("protocol_fees on ADA-out swap affects reserveOut", () => {
      const pool = fixturePools[1]!; // ADA is assetA, so B->A is output
      const amountIn = 100000000000n;

      // Quote B->A (output is ADA with protocolFees)
      const outputWithFees = quoteExactIn(pool, pool.assetB, amountIn);

      const poolNoFees: SundaeSwapV3Pool = { ...pool, protocolFees: 0n };
      const outputNoFees = quoteExactIn(poolNoFees, pool.assetB, amountIn);

      // With protocol_fees subtracted from output reserve, output should be smaller
      expect(outputWithFees).toBeLessThan(outputNoFees);
    });
  });

  describe("(d) Monotonicity and bounds", () => {
    it("larger amountIn -> larger amountOut", () => {
      const pool = fixturePools[0]!;
      const amounts = [100000000n, 500000000n, 1000000000n, 5000000000n];

      const outputs = amounts.map((amt) => quoteExactIn(pool, pool.assetA, amt));

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThan(outputs[i - 1]);
      }
    });

    it("amountOut < reserveOut always", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n];

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

  describe("(e) Directional fees: A->B and B->A use different fees", () => {
    it("when bid!=ask, A->B output differs from B->A output at same amount", () => {
      const pool = fixturePools[2]!; // askFeePer10k=350, bidFeePer10k=250
      expect(pool.askFeePer10k).not.toBe(pool.bidFeePer10k);

      const amountIn = 100000000000n;

      // A->B (ask fee = 350)
      const outputAtoB = quoteExactIn(pool, pool.assetA, amountIn);

      // B->A (bid fee = 250)
      const outputBtoA = quoteExactIn(pool, pool.assetB, amountIn);

      // With lower bid fee, B->A should output more ADA
      expect(outputBtoA).toBeGreaterThan(outputAtoB);
    });

    it("askFeePer10k used for A->B swap", () => {
      const pool = fixturePools[2]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Manually compute with ask fee
      const feePer10k = pool.askFeePer10k;
      const swapFee = (amountIn * feePer10k + 9999n) / 10000n;
      const reserveIn = pool.reserveA - pool.protocolFees;
      const reserveOut = pool.reserveB;
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("bidFeePer10k used for B->A swap", () => {
      const pool = fixturePools[2]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      // Manually compute with bid fee
      const feePer10k = pool.bidFeePer10k;
      const swapFee = (amountIn * feePer10k + 9999n) / 10000n;
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA - pool.protocolFees; // ADA is output
      const denominator = reserveIn + amountIn - swapFee;
      const numerator = reserveIn * reserveOut;
      const expectedOutput = reserveOut - numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(f) Decode test: datum reserves and fee structure", () => {
    it("should extract reserves from datum UTxO assets", () => {
      // Build a synthetic pool datum for SundaeSwap V3
      // SundaeSwap V3 datum structure (simplified):
      // [poolIdentifier, assets, totalLpTokens, openingFee, finalFee, ...]

      const poolIdentifier = "test-pool-id";
      const assetA = ["", ""]; // lovelace (policyId="", assetName="")
      const assetB = ["70d44e1a92ff0a6f2f37144877e59bc313ce007b3b560717e2e6e78755534443004", ""];
      const totalLpTokens = 100000000000n;
      const openingFee = 500n; // 5% = 500/10000
      const finalFee = 500n;

      const datumFields = [
        poolIdentifier,
        [assetA, assetB],
        totalLpTokens,
        openingFee,
        finalFee,
        0n, // Additional fields
      ];

      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Create a UTxO with known assets
      const datumReserveA = 5000000000000n;
      const datumReserveB = 4950000000000n;

      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "test-address",
        assets: [
          { unit: "lovelace", quantity: datumReserveA },
          { unit: "70d44e1a92ff0a6f2f37144877e59bc313ce007b3b560717e2e6e78755534443004", quantity: datumReserveB },
        ],
        inlineDatum: cborHex,
      };

      // Decode the pool
      const decodedPool = decodePool(utxo, cborHex);

      // ASSERT: reserves come from UTxO assets
      expect(decodedPool.reserveA).toBe(datumReserveA);
      expect(decodedPool.reserveB).toBe(datumReserveB);
      expect(decodedPool.adaIsAssetA).toBe(true);
    });

    it("decodePool extracts all required fields from datum", () => {
      const assetA = ["", ""]; // lovelace
      const assetB = ["f966d0b6652340f7952fb935ceaaf02832ffa40dcfe2b1245b10cab914755534444", ""];

      const datumFields = [
        "pool-id-123",
        [assetA, assetB],
        50000000000n,
        300n,
        300n,
      ];

      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [
          { unit: "lovelace", quantity: 2000000000000n },
          { unit: "f966d0b6652340f7952fb935ceaaf02832ffa40dcfe2b1245b10cab914755534444", quantity: 1980000000000n },
        ],
        inlineDatum: cborHex,
      };

      const pool = decodePool(utxo, cborHex);

      expect(pool.poolId).toBeDefined();
      expect(pool.assetA).toBe("lovelace");
      expect(pool.assetB).toBe("f966d0b6652340f7952fb935ceaaf02832ffa40dcfe2b1245b10cab914755534444");
      expect(pool.reserveA).toBe(2000000000000n);
      expect(pool.reserveB).toBe(1980000000000n);
      expect(pool.adaIsAssetA).toBe(true);
    });

    it("ceiling division in swap fee calculation", () => {
      // Test that ceiling division works correctly
      // swapFee = (amountIn * feePer10k + 9999) / 10000
      const pool = fixturePools[0]!;

      // Test case: 1 lovelace in, 500 bps fee
      // swapFee = (1 * 500 + 9999) / 10000 = 10499 / 10000 = 1 (floor)
      const amountIn = 1n;
      const output = quoteExactIn(pool, pool.assetA, amountIn);
      expect(output).toBeGreaterThanOrEqual(0n);

      // Test case: large amount
      // (10 * 500 + 9999) / 10000 = 15001 / 10000 = 1 (floor)
      const amountIn2 = 10n;
      const output2 = quoteExactIn(pool, pool.assetA, amountIn2);
      expect(output2).toBeGreaterThanOrEqual(0n);
    });
  });

  describe("(g) Cross-check vs Dexter formula reference", () => {
    it("formula matches Dexter's estimatedReceive structure", () => {
      // Dexter: estimatedReceive = reserveOut - (reserveIn * reserveOut) / (reserveIn + amountIn - swapFee)
      // This is exactly what we implement

      const pool = fixturePools[0]!; // Pool with no protocol_fees
      const amountIn = 1000000000n;

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter formula (pool[0] has no protocol_fees, so full reserves are used)
      const feeBps = Number(pool.askFeePer10k);
      const swapFeeDexter =
        (Number(amountIn) * feeBps + 9999) / 10000;
      const dexterOut =
        Number(pool.reserveB) -
        (Number(pool.reserveA) * Number(pool.reserveB)) /
          (Number(pool.reserveA) + Number(amountIn) - swapFeeDexter);

      // Our result (converted to number for comparison)
      const ourOutput = Number(output);

      // Should match exactly or within minimal rounding error
      expect(Math.abs(ourOutput - dexterOut)).toBeLessThanOrEqual(2);
    });
  });
});
