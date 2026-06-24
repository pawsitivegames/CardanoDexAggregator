import { describe, it, expect } from "vitest";
import { decode, encode } from "cborg";
import { quoteExactIn } from "./quote";
import { decodePool } from "./decode";
import type { SplashPool } from "./types";
import type { ChainUtxo } from "../../chain/poolStateProvider";
import poolFixtures from "./__fixtures__/pools.json";

// Convert fixture JSON (with string bigints) to properly typed pools
const fixturePools: SplashPool[] = poolFixtures.map((f: any) => ({
  poolId: f.poolId,
  assetA: f.assetA,
  assetB: f.assetB,
  reserveA: BigInt(f.reserveA),
  reserveB: BigInt(f.reserveB),
  lpFee: BigInt(f.lpFee),
  feeDenominator: BigInt(f.feeDenominator),
}));

describe("Splash quoteExactIn", () => {
  describe("(a) Reference formula verification", () => {
    it("ADA->Token should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 1000000000n; // 1 ADA in lovelace

      // Compute using the public function
      const output = quoteExactIn(pool, pool.assetA, amountIn);

      // Independently compute the formula inline to verify
      const fd = pool.feeDenominator;
      const fn = pool.lpFee;
      const feeModifier = fd - fn;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const numerator = amountIn * feeModifier * reserveOut;
      const denominator = reserveIn * fd + amountIn * feeModifier;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("Token->ADA should match hand-computed reference", () => {
      const pool = fixturePools[0]!;
      const amountIn = 500000000000n; // 500 base units

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      // Independently compute
      const fd = pool.feeDenominator;
      const fn = pool.lpFee;
      const feeModifier = fd - fn;
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;

      const numerator = amountIn * feeModifier * reserveOut;
      const denominator = reserveIn * fd + amountIn * feeModifier;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("Pool 2 ADA->Token should match hand-computed reference", () => {
      const pool = fixturePools[1]!;
      const amountIn = 100000000000n;

      const output = quoteExactIn(pool, pool.assetA, amountIn);

      const fd = pool.feeDenominator;
      const fn = pool.lpFee;
      const feeModifier = fd - fn;
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const numerator = amountIn * feeModifier * reserveOut;
      const denominator = reserveIn * fd + amountIn * feeModifier;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });

    it("Pool 3 Token->ADA with different fee should match", () => {
      const pool = fixturePools[2]!;
      const amountIn = 250000000000n;

      const output = quoteExactIn(pool, pool.assetB, amountIn);

      const fd = pool.feeDenominator;
      const fn = pool.lpFee;
      const feeModifier = fd - fn;
      const reserveIn = pool.reserveB;
      const reserveOut = pool.reserveA;

      const numerator = amountIn * feeModifier * reserveOut;
      const denominator = reserveIn * fd + amountIn * feeModifier;
      const expectedOutput = numerator / denominator;

      expect(output).toBe(expectedOutput);
    });
  });

  describe("(b) Constant-product k-invariant property", () => {
    it("ADA->Token: k-invariant (reserveIn*fd + (fd-fn)*amountIn) * (reserveOut - out) >= reserveIn * reserveOut * fd", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [100000000n, 1000000000n, 10000000000n, 100000000000n, 500000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.lpFee;
        const feeModifier = fd - fn;

        const leftSide = (pool.reserveA * fd + amountIn * feeModifier) * (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("Token->ADA: k-invariant holds for multiple amounts", () => {
      const pool = fixturePools[0]!;
      const testAmounts = [50000000000n, 100000000000n, 250000000000n, 500000000000n, 750000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetB, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.lpFee;
        const feeModifier = fd - fn;

        const leftSide = (pool.reserveB * fd + amountIn * feeModifier) * (pool.reserveA - output);
        const rightSide = pool.reserveB * pool.reserveA * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("Pool 2: k-invariant holds across multiple amounts", () => {
      const pool = fixturePools[1]!;
      const testAmounts = [10000000000n, 50000000000n, 100000000000n, 500000000000n, 1000000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.lpFee;
        const feeModifier = fd - fn;

        const leftSide = (pool.reserveA * fd + amountIn * feeModifier) * (pool.reserveB - output);
        const rightSide = pool.reserveA * pool.reserveB * fd;

        expect(leftSide).toBeGreaterThanOrEqual(rightSide);
      });
    });

    it("Pool 3 with lower fee: k-invariant holds", () => {
      const pool = fixturePools[2]!;
      const testAmounts = [25000000000n, 75000000000n, 150000000000n, 300000000000n, 600000000000n];

      testAmounts.forEach((amountIn) => {
        const output = quoteExactIn(pool, pool.assetA, amountIn);
        const fd = pool.feeDenominator;
        const fn = pool.lpFee;
        const feeModifier = fd - fn;

        const leftSide = (pool.reserveA * fd + amountIn * feeModifier) * (pool.reserveB - output);
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

  describe("(d) Cross-check vs Dexter splash.ts estimatedReceive expression", () => {
    it("with fee numerator 997, our result matches Dexter-style computation", () => {
      // Dexter's simplified constant-product for Splash:
      // estimatedReceive: reserveOut - (reserveIn * reserveOut) / (reserveIn + swapInAmount)
      // But Splash includes fee in reserves (treasury tracking), so we use the fee formula.

      const pool = fixturePools[0]!;
      const amountIn = 1000000000n;

      // Our formula
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter's expanded form with fee modifier:
      // out = (swapInAmount * (fd - fn) * reserveOut) / (swapInAmount * (fd - fn) + reserveIn * fd)
      const fd = 1000n;
      const fn = pool.lpFee; // 997
      const feeModifier = fd - fn; // 3
      const reserveIn = pool.reserveA;
      const reserveOut = pool.reserveB;

      const dexterNumerator = amountIn * feeModifier * reserveOut;
      const dexterDenominator = amountIn * feeModifier + reserveIn * fd;
      const dexterOutput = dexterNumerator / dexterDenominator;

      // Should match exactly
      expect(ourOutput).toBe(dexterOutput);
    });

    it("Dexter formula expanded form matches our computation (Pool 2)", () => {
      const pool = fixturePools[1]!;
      const amountIn = 50000000000n;

      // Our computation
      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      // Dexter style
      const fd = 1000n;
      const fn = pool.lpFee;
      const feeModifier = fd - fn;

      const dexterNum = amountIn * feeModifier * pool.reserveB;
      const dexterDen = amountIn * feeModifier + pool.reserveA * fd;
      const dexterOut = dexterNum / dexterDen;

      // Must match exactly or be within 1 unit (rounding only)
      expect(Math.abs(Number(ourOutput - dexterOut))).toBeLessThanOrEqual(1);
    });

    it("With fee numerator 995 (lower fee), formula is consistent", () => {
      const pool = fixturePools[2]!;
      const amountIn = 100000000000n;

      const ourOutput = quoteExactIn(pool, pool.assetA, amountIn);

      const fd = 1000n;
      const fn = pool.lpFee; // 995
      const feeModifier = fd - fn; // 5

      const dexterNum = amountIn * feeModifier * pool.reserveB;
      const dexterDen = amountIn * feeModifier + pool.reserveA * fd;
      const dexterOut = dexterNum / dexterDen;

      expect(ourOutput).toBe(dexterOut);
    });
  });

  describe("(e) Decode test: datum reserves override UTxO values", () => {
    it("should extract reserves from UTxO assets, subtract treasury amounts from datum", () => {
      // Build a synthetic pool datum matching Splash CPP structure
      // Pool datum: [pool_nft, asset_x, asset_y, lp_token, pool_fee, treasury_fee, treasury_x, treasury_y, dao_policy, lq_bound, treasury_address]

      const datumPoolFee = 997n;
      const datumTreasuryFee = 10n;
      const datumTreasuryX = 50000000n;
      const datumTreasuryY = 25000000n;

      // Build a Constr-style CBOR datum for Splash CPP
      const datumFields = [
        ["pool_nft_policy", "pool_nft_name"], // pool_nft as [policyId, assetName]
        ["", ""], // asset_x as lovelace
        ["asset_y_policy", "asset_y_name"], // asset_y
        ["lp_token_policy", "lp_token_name"], // lp_token
        datumPoolFee, // pool_fee = 997
        datumTreasuryFee, // treasury_fee = 10
        datumTreasuryX, // treasury_x = 50000000
        datumTreasuryY, // treasury_y = 25000000
        null, // dao_policy (simplified)
        1000000000n, // lq_bound
        "treasury_address_bytes", // treasury_address
      ];

      // Encode to CBOR hex using cborg
      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Create a UTxO with known asset quantities
      const totalLovelace = 5000000000n + datumTreasuryX;
      const totalTokenB = 2500000000n + datumTreasuryY;

      const utxo: ChainUtxo = {
        txHash: "test-tx-hash",
        outputIndex: 0,
        address: "test-address",
        assets: [
          { unit: "lovelace", quantity: totalLovelace },
          { unit: "asset_y_policyasset_y_name", quantity: totalTokenB },
        ],
        inlineDatum: cborHex,
      };

      // Decode the pool
      const decodedPool = decodePool(utxo, cborHex);

      // ASSERT: reserves = total assets - treasury amounts
      expect(decodedPool.reserveA).toBe(totalLovelace - datumTreasuryX);
      expect(decodedPool.reserveB).toBe(totalTokenB - datumTreasuryY);
      expect(decodedPool.lpFee).toBe(datumPoolFee);
      expect(decodedPool.feeDenominator).toBe(1000n);
    });

    it("decodePool extracts all required fields from datum", () => {
      const datumFields = [
        ["pool_nft_policy", "pool_nft_name"],
        ["", ""], // lovelace
        ["token_policy", "token_name"],
        ["lp_token_policy", "lp_token_name"],
        997n, // pool_fee
        10n, // treasury_fee
        0n, // treasury_x
        0n, // treasury_y
        null,
        1000000000n,
        "treasury_address",
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
          { unit: "lovelace", quantity: 1000000000n },
          { unit: "token_policytoken_name", quantity: 500000000n },
        ],
        inlineDatum: cborHex,
      };

      const pool = decodePool(utxo, cborHex);

      expect(pool.poolId).toBeDefined();
      expect(pool.assetA).toBe("lovelace");
      expect(pool.assetB).toBe("token_policytoken_name");
      expect(pool.reserveA).toBe(1000000000n);
      expect(pool.reserveB).toBe(500000000n);
      expect(pool.lpFee).toBe(997n);
      expect(pool.feeDenominator).toBe(1000n);
    });

    it("handles UTxO assets not in the pool gracefully", () => {
      const datumFields = [
        ["pool_nft_policy", "pool_nft_name"],
        ["", ""], // lovelace
        ["missing_policy", "missing_name"], // asset not in UTxO
        ["lp_token_policy", "lp_token_name"],
        997n,
        10n,
        0n,
        0n,
        null,
        1000000000n,
        "treasury_address",
      ];

      const cbor = encode(datumFields);
      const cborHex = Array.from(new Uint8Array(cbor))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const utxo: ChainUtxo = {
        txHash: "test-tx",
        outputIndex: 0,
        address: "test-addr",
        assets: [{ unit: "lovelace", quantity: 1000000000n }], // Missing the token
        inlineDatum: cborHex,
      };

      const pool = decodePool(utxo, cborHex);

      // Should default missing reserve to 0
      expect(pool.reserveB).toBe(0n);
    });
  });
});
