import { describe, it, expect } from "vitest";
import { BlockfrostPoolStateProvider } from "./blockfrostPoolStateProvider";
import { MaestroPoolStateProvider } from "./maestroPoolStateProvider";
import type { ChainUtxo } from "./poolStateProvider";

// Import fixtures
import blockfrostFixture from "./__fixtures__/blockfrost-utxos.json";
import maestroFixture from "./__fixtures__/maestro-utxos.json";

const TEST_ADDRESS = "addr_test1qr2f5z7yx3n9p2k4m6l8w0v1c3e5g7h9j1a3d5f7h9j1k3m5n7p9r1t3v5x7";
const DATUM_HASH = "hash1234567890abcdef";
const DATUM_CBOR = "d8799f1a001e84801a00989680ff";

describe("BlockfrostPoolStateProvider", () => {
  it("normalizes getUtxosAtAddress response correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => blockfrostFixture,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new BlockfrostPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getUtxosAtAddress(TEST_ADDRESS);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      txHash: "abc123def456",
      outputIndex: 0,
      address: TEST_ADDRESS,
      assets: [
        { unit: "lovelace", quantity: 5000000n },
        { unit: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b", quantity: 1000000n },
      ],
      datumHash: "hash1234567890abcdef",
    });
    expect(result[1]).toEqual({
      txHash: "xyz789uvw012",
      outputIndex: 1,
      address: TEST_ADDRESS,
      assets: [
        { unit: "lovelace", quantity: 3000000n },
        { unit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e", quantity: 2000000n },
      ],
      inlineDatum: "d8799f1a001e84801a00989680ff",
    });
  });

  it("converts quantity strings to bigint correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => [
            {
              tx_hash: "test",
              output_index: 0,
              address: TEST_ADDRESS,
              amount: [{ unit: "lovelace", quantity: "9999999999999999" }],
            },
          ],
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new BlockfrostPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getUtxosAtAddress(TEST_ADDRESS);
    expect(result[0].assets[0].quantity).toBe(9999999999999999n);
  });

  it("handles resolveDatum correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("datums")) {
        return {
          ok: true,
          json: async () => ({ cbor: DATUM_CBOR }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new BlockfrostPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.resolveDatum(DATUM_HASH);
    expect(result).toBe(DATUM_CBOR);
  });

  it("handles getChainTip correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("blocks/latest")) {
        return {
          ok: true,
          json: async () => ({
            hash: "blockHash123",
            slot: 45678,
            height: 1234,
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new BlockfrostPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getChainTip();
    expect(result).toEqual({
      hash: "blockHash123",
      slot: 45678,
      height: 1234,
    });
  });

  it("throws error when getUtxosAtAddress request fails", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: false,
          status: 404,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new BlockfrostPoolStateProvider(mockFetch as typeof fetch);
    await expect(provider.getUtxosAtAddress(TEST_ADDRESS)).rejects.toThrow("Blockfrost getUtxosAtAddress failed");
  });
});

describe("MaestroPoolStateProvider", () => {
  it("normalizes getUtxosAtAddress response correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => maestroFixture,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getUtxosAtAddress(TEST_ADDRESS);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      txHash: "abc123def456",
      outputIndex: 0,
      address: TEST_ADDRESS,
      assets: [
        { unit: "lovelace", quantity: 5000000n },
        { unit: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b", quantity: 1000000n },
      ],
      datumHash: "hash1234567890abcdef",
    });
    expect(result[1]).toEqual({
      txHash: "xyz789uvw012",
      outputIndex: 1,
      address: TEST_ADDRESS,
      assets: [
        { unit: "lovelace", quantity: 3000000n },
        { unit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e", quantity: 2000000n },
      ],
      inlineDatum: "d8799f1a001e84801a00989680ff",
    });
  });

  it("converts amount strings to bigint correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                tx_hash: "test",
                index: 0,
                address: TEST_ADDRESS,
                assets: [{ unit: "lovelace", amount: "8888888888888888" }],
              },
            ],
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getUtxosAtAddress(TEST_ADDRESS);
    expect(result[0].assets[0].quantity).toBe(8888888888888888n);
  });

  it("handles resolveDatum correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("datums")) {
        return {
          ok: true,
          json: async () => ({ bytes: DATUM_CBOR }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.resolveDatum(DATUM_HASH);
    expect(result).toBe(DATUM_CBOR);
  });

  it("handles getChainTip correctly", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("blocks/latest")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              hash: "blockHash456",
              slot: 56789,
              height: 2345,
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getChainTip();
    expect(result).toEqual({
      hash: "blockHash456",
      slot: 56789,
      height: 2345,
    });
  });

  it("handles live Maestro absolute_slot in getChainTip", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("blocks/latest")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              hash: "blockHash789",
              absolute_slot: 67890,
              height: 3456,
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    const result = await provider.getChainTip();
    expect(result).toEqual({
      hash: "blockHash789",
      slot: 67890,
      height: 3456,
    });
  });

  it("throws error when getUtxosAtAddress request fails", async () => {
    const mockFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: false,
          status: 503,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new MaestroPoolStateProvider(mockFetch as typeof fetch);
    await expect(provider.getUtxosAtAddress(TEST_ADDRESS)).rejects.toThrow("Maestro getUtxosAtAddress failed");
  });
});

describe("Cross-provider normalization (deep equality)", () => {
  it("produces identical ChainUtxo[] from Blockfrost and Maestro fixtures", async () => {
    const blockfrostFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => blockfrostFixture,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const maestroFetch = async (url: string) => {
      if (url.includes("utxos")) {
        return {
          ok: true,
          json: async () => maestroFixture,
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const blockfrostProvider = new BlockfrostPoolStateProvider(blockfrostFetch as typeof fetch);
    const maestroProvider = new MaestroPoolStateProvider(maestroFetch as typeof fetch);

    const blockfrostResult = await blockfrostProvider.getUtxosAtAddress(TEST_ADDRESS);
    const maestroResult = await maestroProvider.getUtxosAtAddress(TEST_ADDRESS);

    // Deep equality check: same structure, same bigint values
    expect(blockfrostResult).toEqual(maestroResult);

    // Verify specific properties for robustness
    expect(blockfrostResult).toHaveLength(maestroResult.length);
    for (let i = 0; i < blockfrostResult.length; i++) {
      const bf = blockfrostResult[i];
      const ma = maestroResult[i];

      expect(bf.txHash).toBe(ma.txHash);
      expect(bf.outputIndex).toBe(ma.outputIndex);
      expect(bf.address).toBe(ma.address);
      expect(bf.datumHash).toBe(ma.datumHash);
      expect(bf.inlineDatum).toBe(ma.inlineDatum);

      expect(bf.assets).toHaveLength(ma.assets.length);
      for (let j = 0; j < bf.assets.length; j++) {
        expect(bf.assets[j].unit).toBe(ma.assets[j].unit);
        expect(bf.assets[j].quantity).toBe(ma.assets[j].quantity);
      }
    }
  });
});
