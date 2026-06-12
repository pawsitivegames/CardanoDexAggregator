import { describe, expect, it, vi } from "vitest";
import { createTxTracker, trackTransaction } from "./txTracker";

vi.mock("../config/networks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/networks")>();
  return {
    ...actual,
    TX_POLL_INTERVAL_MS: 10,
    TX_POLL_TIMEOUT_MS: 500,
    BLOCKFROST_BASE_URLS: {
      preprod: "https://cardano-preprod.blockfrost.io/api/v0",
      preview: "https://cardano-preview.blockfrost.io/api/v0",
      mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
    },
  };
});

describe("createTxTracker", () => {
  it("starts in building state", () => {
    const tracker = createTxTracker();
    expect(tracker.status.status).toBe("building");
    expect(tracker.txHash).toBeNull();
    expect(tracker.error).toBeNull();
  });
});

describe("trackTransaction", () => {
  it("transitions from submitted to confirmed when block_height > 0", async () => {
    const tracker = createTxTracker();
    const txHash = "abcdef1234567890";
    const blockHeight = 12345;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        hash: txHash,
        block: "blockhash123",
        block_height: blockHeight,
        block_time: 1700000000,
        slot: 50000000,
        index: 0,
        output_amount: [{ unit: "lovelace", quantity: "1000000" }],
        fees: "200000",
        deposit: "0",
        size: 250,
        invalid_before: null,
        invalid_hereafter: null,
        utxo_count: 2,
        withdrawal_count: 0,
        mir_cert_count: 0,
        delegation_count: 0,
        stake_cert_count: 0,
        pool_update_count: 0,
        pool_retire_count: 0,
        asset_mint_or_burn_count: 0,
        redeemer_count: 0,
        valid_contract: true,
      }),
    } as Response);

    const callback = vi.fn();
    await trackTransaction(tracker, "preprod", txHash, "test-project-id", callback);

    expect(tracker.status.status).toBe("confirmed");
    if (tracker.status.status !== "confirmed") throw new Error();
    expect(tracker.status.blockHeight).toBe(blockHeight);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("transitions through pending before confirmed when API returns block_height later", async () => {
    const tracker = createTxTracker();
    const txHash = "abcdef";
    const blockHeight = 42;

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      const isConfirmed = callCount >= 2;
      return {
        ok: true,
        json: async () => ({
          hash: txHash,
          block: isConfirmed ? "block" : null,
          block_height: isConfirmed ? blockHeight : null,
          block_time: isConfirmed ? 1700000000 : null,
          slot: isConfirmed ? 100 : null,
          index: 0,
          output_amount: [{ unit: "lovelace", quantity: "1000000" }],
          fees: "200000",
          deposit: "0",
          size: 250,
          invalid_before: null,
          invalid_hereafter: null,
          utxo_count: 2,
          withdrawal_count: 0,
          mir_cert_count: 0,
          delegation_count: 0,
          stake_cert_count: 0,
          pool_update_count: 0,
          pool_retire_count: 0,
          asset_mint_or_burn_count: 0,
          redeemer_count: 0,
          valid_contract: true,
        }),
      } as Response;
    });

    const callback = vi.fn();
    await trackTransaction(tracker, "preprod", txHash, "key", callback);

    expect(tracker.status.status).toBe("confirmed");
    expect(callCount).toBeGreaterThan(1);
    expect(callback).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("expires when Blockfrost returns 404 until timeout", async () => {
    const tracker = createTxTracker();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await trackTransaction(tracker, "preprod", "deadbeef", "key", vi.fn());

    expect(tracker.status.status).toBe("expired");
    expect(tracker.error).toBeTruthy();
    fetchSpy.mockRestore();
  });

  it("uses the correct Blockfrost URL per network", async () => {
    const tracker = createTxTracker();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        hash: "tx",
        block: "block",
        block_height: 1,
        block_time: 1700000000,
        slot: 1,
        index: 0,
        output_amount: [{ unit: "lovelace", quantity: "1000000" }],
        fees: "200000",
        deposit: "0",
        size: 250,
        invalid_before: null,
        invalid_hereafter: null,
        utxo_count: 2,
        withdrawal_count: 0,
        mir_cert_count: 0,
        delegation_count: 0,
        stake_cert_count: 0,
        pool_update_count: 0,
        pool_retire_count: 0,
        asset_mint_or_burn_count: 0,
        redeemer_count: 0,
        valid_contract: true,
      }),
    } as Response);

    await trackTransaction(tracker, "mainnet", "tx", "key", vi.fn());
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://cardano-mainnet.blockfrost.io/api/v0/txs/tx",
      expect.any(Object),
    );
    fetchSpy.mockRestore();
  });
});
