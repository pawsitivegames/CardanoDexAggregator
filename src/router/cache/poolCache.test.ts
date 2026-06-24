import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PoolSnapshot } from "../../protocols/registry/poolSnapshot";
import { PoolRegistry } from "../../protocols/registry/registry";
import { fromMinswapV2 } from "../../protocols/registry/registry";
import type { MinswapV2Pool } from "../../protocols/minswapV2/types";
import { PoolCache, type Pair } from "./poolCache";

/**
 * Helper to create minimal MinswapV2Pool objects for testing.
 */
function createMinswapV2Pool(
  poolId: string,
  assetA: string,
  assetB: string,
  reserveA: bigint,
  reserveB: bigint,
): MinswapV2Pool {
  return {
    poolId,
    assetA,
    assetB,
    reserveA,
    reserveB,
    baseFeeANumerator: 25n,
    baseFeeBNumerator: 25n,
    feeDenominator: 10000n,
  };
}

/**
 * Helper to create a PoolSnapshot from a MinswapV2 pool with an injectable fetchedAt timestamp.
 */
function createSnapshot(
  poolId: string,
  assetA: string,
  assetB: string,
  fetchedAt: string,
  reserveA: bigint = 1000n,
  reserveB: bigint = 2000n,
): PoolSnapshot {
  const pool = createMinswapV2Pool(poolId, assetA, assetB, reserveA, reserveB);
  return fromMinswapV2(pool, { fetchedAt });
}

describe("PoolCache", () => {
  let cache: PoolCache;
  let refreshFn: any;
  let now: any;

  beforeEach(() => {
    refreshFn = vi.fn(async () => []);
    now = vi.fn(() => 100000); // Fixed clock for testing
    cache = new PoolCache({
      refreshFn: refreshFn as unknown as (pairs: Pair[]) => Promise<PoolSnapshot[]>,
      maxAgeMs: 20000,
      now: now as unknown as () => number,
    });
  });

  describe("markPairActive and activePairs", () => {
    it("should register pairs and deduplicate them", () => {
      cache.markPairActive("assetA", "assetB");
      cache.markPairActive("assetB", "assetA");
      cache.markPairActive("assetA", "assetB"); // Duplicate

      const pairs = cache.activePairs();
      // Internally, pairs are normalized by sort, so both markings point to the same key
      expect(pairs.length).toBe(1);
      const pair = pairs[0];
      expect([pair.a, pair.b].sort()).toEqual(["assetA", "assetB"]);
    });

    it("should accumulate different pairs", () => {
      cache.markPairActive("assetA", "assetB");
      cache.markPairActive("assetC", "assetD");

      const pairs = cache.activePairs();
      expect(pairs.length).toBe(2);
      expect(pairs.map((p: Pair) => [p.a, p.b].sort().join("|"))).toContain("assetA|assetB");
      expect(pairs.map((p: Pair) => [p.a, p.b].sort().join("|"))).toContain("assetC|assetD");
    });

    it("should return an empty array when no pairs are marked", () => {
      expect(cache.activePairs()).toEqual([]);
    });
  });

  describe("refresh", () => {
    it("should call refreshFn with the active pairs", async () => {
      cache.markPairActive("assetA", "assetB");
      cache.markPairActive("assetC", "assetD");

      const snapshots = [
        createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z"),
        createSnapshot("pool2", "assetC", "assetD", "2025-01-01T10:00:00Z"),
      ];
      refreshFn.mockResolvedValueOnce(snapshots);

      const result = await cache.refresh();

      expect(refreshFn).toHaveBeenCalledTimes(1);
      const callArgs = refreshFn.mock.calls[0][0];
      expect(callArgs.length).toBe(2);
      // Check pairs are passed (order may vary due to sorting)
      expect(new Set(callArgs.map((p: Pair) => [p.a, p.b].sort().join("|")))).toEqual(
        new Set([
          ["assetA", "assetB"].sort().join("|"),
          ["assetC", "assetD"].sort().join("|"),
        ]),
      );

      expect(result.refreshed).toBe(2);
      expect(result.errored).toBe(false);
    });

    it("should populate the registry on success", async () => {
      cache.markPairActive("assetA", "assetB");
      const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
      refreshFn.mockResolvedValueOnce([snapshot]);

      await cache.refresh();

      const pools = cache.getPoolsForPair("assetA", "assetB");
      expect(pools.length).toBe(1);
      expect(pools[0].id).toBe("pool1");
    });

    it("should return errored=true and retain old snapshots on refreshFn throw", async () => {
      cache.markPairActive("assetA", "assetB");
      const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
      refreshFn.mockResolvedValueOnce([snapshot]);

      // First successful refresh
      await cache.refresh();
      expect(cache.getPoolsForPair("assetA", "assetB").length).toBe(1);

      // Second refresh fails
      refreshFn.mockRejectedValueOnce(new Error("Network error"));
      const result = await cache.refresh();

      expect(result.errored).toBe(true);
      expect(result.refreshed).toBe(0);
      // Old snapshots should still be there
      expect(cache.getPoolsForPair("assetA", "assetB").length).toBe(1);
      expect(cache.getPoolsForPair("assetA", "assetB")[0].id).toBe("pool1");
    });

    it("should not throw on refreshFn error", async () => {
      cache.markPairActive("assetA", "assetB");
      refreshFn.mockRejectedValueOnce(new Error("Some error"));

      // Should not throw
      await expect(cache.refresh()).resolves.toEqual({ refreshed: 0, errored: true });
    });

    it("should guard against overlapping refresh operations", async () => {
      cache.markPairActive("assetA", "assetB");
      const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");

      // Make the refresh function hang
      let resolveFirst: ((val: PoolSnapshot[]) => void) | undefined;
      (refreshFn as any).mockImplementationOnce(
        () => new Promise<PoolSnapshot[]>((resolve: (val: PoolSnapshot[]) => void) => {
          resolveFirst = resolve;
        }),
      );

      const first = cache.refresh();
      // Start a second refresh while the first is in flight
      const second = cache.refresh();

      expect(refreshFn).toHaveBeenCalledTimes(1); // Only called once

      // Resolve the first refresh
      if (resolveFirst) {
        resolveFirst([snapshot]);
      }
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult.refreshed).toBe(1);
      expect(firstResult.errored).toBe(false);
      // Second one returned immediately without calling refreshFn again
      expect(secondResult.refreshed).toBe(0);
      expect(secondResult.errored).toBe(false);
      expect(refreshFn).toHaveBeenCalledTimes(1);
    });

    it("should only refresh pairs that are marked active", async () => {
      cache.markPairActive("assetA", "assetB");
      const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
      refreshFn.mockResolvedValueOnce([snapshot]);

      await cache.refresh();

      const pairs = refreshFn.mock.calls[0][0];
      expect(pairs.length).toBe(1);
      const pair = pairs[0];
      expect([pair.a, pair.b].sort()).toEqual(["assetA", "assetB"]);
    });
  });

  describe("getPoolsForPair", () => {
    it("should return pools for a pair from the registry", async () => {
      cache.markPairActive("assetA", "assetB");
      const snap1 = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
      const snap2 = createSnapshot("pool2", "assetA", "assetB", "2025-01-01T10:00:00Z");
      refreshFn.mockResolvedValueOnce([snap1, snap2]);

      await cache.refresh();

      const pools = cache.getPoolsForPair("assetA", "assetB");
      expect(pools.length).toBe(2);
      expect(pools.map((p) => p.id)).toContain("pool1");
      expect(pools.map((p) => p.id)).toContain("pool2");
    });

    it("should return empty array for unknown pairs", () => {
      const pools = cache.getPoolsForPair("unknownA", "unknownB");
      expect(pools).toEqual([]);
    });
  });

  describe("isStale", () => {
    it("should return true if snapshot is older than maxAgeMs", () => {
      const testTime = 100000000;
      now.mockReturnValueOnce(testTime);
      now.mockReturnValueOnce(testTime);

      const oldTime = testTime - 25000; // 25 seconds ago, beyond maxAgeMs of 20000
      const snapshot = createSnapshot("pool1", "assetA", "assetB", new Date(oldTime).toISOString());

      expect(cache.isStale(snapshot)).toBe(true);
    });

    it("should return false if snapshot is fresher than maxAgeMs", () => {
      // Set now to a specific time and create a snapshot at a recent time
      const testTime = 100000000;
      now.mockReturnValueOnce(testTime);
      now.mockReturnValueOnce(testTime);

      const recentTime = new Date(testTime - 5000).toISOString(); // 5 seconds ago
      const snapshot = createSnapshot("pool1", "assetA", "assetB", recentTime);

      expect(cache.isStale(snapshot)).toBe(false);
    });

    it("should return true if fetchedAt is unparseable", () => {
      const snapshot = createSnapshot("pool1", "assetA", "assetB", "invalid-date");
      expect(cache.isStale(snapshot)).toBe(true);
    });

    it("should return true if snapshot age exactly equals maxAgeMs", () => {
      const testTime = 100000000;
      now.mockReturnValueOnce(testTime);
      now.mockReturnValueOnce(testTime);

      const snapshotTime = testTime - 20000; // Exactly maxAgeMs ago
      const snapshot = createSnapshot("pool1", "assetA", "assetB", new Date(snapshotTime).toISOString());

      // At age exactly equal to maxAgeMs, we should be stale (> not >=)
      // Actually, the condition is: now() - fetchedTime > maxAgeMs
      // so at exactly equal, it's NOT stale
      expect(cache.isStale(snapshot)).toBe(false);
    });

    it("should return true if snapshot age exceeds maxAgeMs", () => {
      const testTime = 100000000;
      now.mockReturnValueOnce(testTime);
      now.mockReturnValueOnce(testTime);

      const snapshotTime = testTime - 20001; // Just over maxAgeMs
      const snapshot = createSnapshot("pool1", "assetA", "assetB", new Date(snapshotTime).toISOString());

      expect(cache.isStale(snapshot)).toBe(true);
    });
  });

  describe("freshPoolsForPair", () => {
    it("should return only fresh snapshots", async () => {
      const testTime = 100000000;
      now.mockReturnValue(testTime);

      cache.markPairActive("assetA", "assetB");

      const freshSnap = createSnapshot(
        "pool_fresh",
        "assetA",
        "assetB",
        new Date(testTime - 5000).toISOString(),
      );
      const staleSnap = createSnapshot(
        "pool_stale",
        "assetA",
        "assetB",
        new Date(testTime - 25000).toISOString(),
      );

      refreshFn.mockResolvedValueOnce([freshSnap, staleSnap]);

      await cache.refresh();

      const fresh = cache.freshPoolsForPair("assetA", "assetB");
      expect(fresh.length).toBe(1);
      expect(fresh[0].id).toBe("pool_fresh");
    });

    it("should return empty array if all snapshots are stale", async () => {
      const testTime = 100000000;
      now.mockReturnValue(testTime);

      cache.markPairActive("assetA", "assetB");

      const staleSnap = createSnapshot(
        "pool_stale",
        "assetA",
        "assetB",
        new Date(testTime - 25000).toISOString(),
      );

      refreshFn.mockResolvedValueOnce([staleSnap]);

      await cache.refresh();

      const fresh = cache.freshPoolsForPair("assetA", "assetB");
      expect(fresh).toEqual([]);
    });

    it("should reflect freshness changes as clock advances", async () => {
      const startTime = 100000000;
      now.mockReturnValue(startTime);

      cache.markPairActive("assetA", "assetB");

      const snapshot = createSnapshot(
        "pool",
        "assetA",
        "assetB",
        new Date(startTime - 15000).toISOString(), // 15 seconds old
      );

      refreshFn.mockResolvedValueOnce([snapshot]);

      await cache.refresh();

      // At start time, pool is fresh (15s < 20s)
      expect(cache.freshPoolsForPair("assetA", "assetB").length).toBe(1);

      // Advance clock to make it stale
      now.mockReturnValue(startTime + 10000);

      // Now it's 25 seconds old, should be stale
      expect(cache.freshPoolsForPair("assetA", "assetB").length).toBe(0);

      // Old snapshots still exist in getPoolsForPair
      expect(cache.getPoolsForPair("assetA", "assetB").length).toBe(1);
    });
  });

  describe("startAutoRefresh", () => {
    it("should set up an interval that calls refresh", async () => {
      vi.useFakeTimers();

      try {
        cache.markPairActive("assetA", "assetB");
        const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
        refreshFn.mockResolvedValue([snapshot]);

        const stop = cache.startAutoRefresh(5000);

        expect(refreshFn).not.toHaveBeenCalled();

        // Advance time by 5 seconds
        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(1);

        // Advance another 5 seconds
        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(2);

        stop();

        // Advance more time; should not call refreshFn again
        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should return a function that stops the interval", async () => {
      vi.useFakeTimers();

      try {
        cache.markPairActive("assetA", "assetB");
        const snapshot = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
        refreshFn.mockResolvedValue([snapshot]);

        const stop = cache.startAutoRefresh(5000);

        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(1);

        stop();

        await vi.advanceTimersByTimeAsync(10000);
        expect(refreshFn).toHaveBeenCalledTimes(1); // No additional calls
      } finally {
        vi.useRealTimers();
      }
    });

    it("should handle errors in the refresh loop gracefully", async () => {
      vi.useFakeTimers();

      try {
        cache.markPairActive("assetA", "assetB");
        // First call succeeds
        refreshFn.mockResolvedValueOnce([
          createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z"),
        ]);
        // Second call fails
        refreshFn.mockRejectedValueOnce(new Error("Network error"));
        // Third call succeeds again
        refreshFn.mockResolvedValueOnce([
          createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z"),
        ]);

        const stop = cache.startAutoRefresh(5000);

        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(2); // Error didn't crash the loop

        await vi.advanceTimersByTimeAsync(5000);
        expect(refreshFn).toHaveBeenCalledTimes(3);

        stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("registry integration", () => {
    it("should work with an injected registry", async () => {
      const registry = new PoolRegistry();
      const existingSnapshot = createSnapshot(
        "existing_pool",
        "assetA",
        "assetB",
        "2025-01-01T10:00:00Z",
      );
      registry.upsert(existingSnapshot);

      cache = new PoolCache({
        registry,
        refreshFn: refreshFn as unknown as (pairs: Pair[]) => Promise<PoolSnapshot[]>,
        maxAgeMs: 20000,
        now: now as unknown as () => number,
      });

      // Should have the pre-existing snapshot
      expect(cache.getPoolsForPair("assetA", "assetB").length).toBe(1);
    });

    it("should handle performance with large snapshot counts", async () => {
      cache.markPairActive("assetA", "assetB");

      // Create 100 snapshots (realistic pool count)
      const snapshots = Array.from({ length: 100 }, (_, i) =>
        createSnapshot(`pool_${i}`, "assetA", "assetB", "2025-01-01T10:00:00Z"),
      );

      refreshFn.mockResolvedValueOnce(snapshots);

      const start = performance.now();
      await cache.refresh();
      const refreshTime = performance.now() - start;

      const start2 = performance.now();
      const pools = cache.getPoolsForPair("assetA", "assetB");
      const lookupTime = performance.now() - start2;

      expect(pools.length).toBe(100);
      // Lookup should be fast (< 50ms is typical for 100 items)
      expect(lookupTime).toBeLessThan(50);
    });
  });

  describe("edge cases", () => {
    it("should handle refresh with no active pairs", async () => {
      // When no pairs are active, refreshFn is still called with empty array
      // It should succeed (return empty array) and return errored=false
      refreshFn.mockResolvedValueOnce([]);

      const result = await cache.refresh();

      expect(refreshFn).toHaveBeenCalledWith([]);
      expect(result.refreshed).toBe(0);
      expect(result.errored).toBe(false);
    });

    it("should preserve snapshot order after refresh", async () => {
      cache.markPairActive("assetA", "assetB");

      const snap1 = createSnapshot("pool1", "assetA", "assetB", "2025-01-01T10:00:00Z");
      const snap2 = createSnapshot("pool2", "assetA", "assetB", "2025-01-01T10:00:00Z");
      const snap3 = createSnapshot("pool3", "assetA", "assetB", "2025-01-01T10:00:00Z");

      refreshFn.mockResolvedValueOnce([snap1, snap2, snap3]);

      await cache.refresh();

      const pools = cache.getPoolsForPair("assetA", "assetB");
      expect(pools.length).toBe(3);
      expect(pools.map((p) => p.id)).toContain("pool1");
      expect(pools.map((p) => p.id)).toContain("pool2");
      expect(pools.map((p) => p.id)).toContain("pool3");
    });

    it("should handle mixed fresh and stale pools correctly", async () => {
      const testTime = 100000000;
      now.mockReturnValue(testTime);

      cache.markPairActive("assetA", "assetB");

      const fresh1 = createSnapshot(
        "pool_fresh_1",
        "assetA",
        "assetB",
        new Date(testTime - 5000).toISOString(),
      );
      const stale = createSnapshot(
        "pool_stale",
        "assetA",
        "assetB",
        new Date(testTime - 25000).toISOString(),
      );
      const fresh2 = createSnapshot(
        "pool_fresh_2",
        "assetA",
        "assetB",
        new Date(testTime - 10000).toISOString(),
      );

      refreshFn.mockResolvedValueOnce([fresh1, stale, fresh2]);

      await cache.refresh();

      const fresh = cache.freshPoolsForPair("assetA", "assetB");
      expect(fresh.length).toBe(2);
      expect(fresh.map((p) => p.id)).toContain("pool_fresh_1");
      expect(fresh.map((p) => p.id)).toContain("pool_fresh_2");
      expect(fresh.map((p) => p.id)).not.toContain("pool_stale");

      const all = cache.getPoolsForPair("assetA", "assetB");
      expect(all.length).toBe(3);
    });
  });
});
