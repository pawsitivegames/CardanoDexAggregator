import type { PoolSnapshot } from "../../protocols/registry/poolSnapshot";
import { PoolRegistry } from "../../protocols/registry/registry";

/**
 * A pair of assets (order-independent for registry lookup).
 */
export type Pair = { a: string; b: string };

/**
 * Options for initializing a PoolCache.
 */
export type PoolCacheOptions = {
  /** Optional existing registry; defaults to a new one. */
  registry?: PoolRegistry;
  /** Async function to refresh pools for a set of pairs. Must not throw; errors are handled. */
  refreshFn: (pairs: Pair[]) => Promise<PoolSnapshot[]>;
  /** Max age of a snapshot before it's considered stale, in milliseconds. Default: 20000 (~1 block). */
  maxAgeMs?: number;
  /** Injectable clock for testing. Default: Date.now. */
  now?: () => number;
};

/**
 * Result of a refresh operation.
 */
export type RefreshResult = {
  /** Number of snapshots successfully refreshed. */
  refreshed: number;
  /** True if the refresh operation encountered an error (old snapshots retained). */
  errored: boolean;
};

/**
 * In-memory pool cache with per-block refresh, staleness stamps, and error resilience.
 * Only refreshes pools for the active pairs that have been explicitly marked.
 */
export class PoolCache {
  private registry: PoolRegistry;
  private refreshFn: (pairs: Pair[]) => Promise<PoolSnapshot[]>;
  private maxAgeMs: number;
  private now: () => number;
  private activePairsSet = new Map<string, Pair>(); // Keyed by canonical pair string for deduplication
  private refreshInFlight = false;
  private autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(opts: PoolCacheOptions) {
    this.registry = opts.registry ?? new PoolRegistry();
    this.refreshFn = opts.refreshFn;
    this.maxAgeMs = opts.maxAgeMs ?? 20000;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Register interest in a pair. Deduplicates internally.
   */
  markPairActive(a: string, b: string): void {
    // Normalize the pair key for consistent deduplication
    const key = [a, b].sort().join("|");
    if (!this.activePairsSet.has(key)) {
      this.activePairsSet.set(key, { a, b });
    }
  }

  /**
   * Return all currently active pairs.
   */
  activePairs(): Pair[] {
    return [...this.activePairsSet.values()];
  }

  /**
   * Refresh the registry from the injected refreshFn with the currently active pairs.
   * If refreshFn throws, the old snapshots are retained and { errored: true } is returned.
   * Never throws out of this method.
   */
  async refresh(): Promise<RefreshResult> {
    // Guard against overlapping refresh operations
    if (this.refreshInFlight) {
      return { refreshed: 0, errored: false };
    }

    this.refreshInFlight = true;
    try {
      const pairs = this.activePairs();
      const snapshots = await this.refreshFn(pairs);
      this.registry.upsertAll(snapshots);
      return { refreshed: snapshots.length, errored: false };
    } catch (err) {
      // Silently retain old snapshots; return error flag
      return { refreshed: 0, errored: true };
    } finally {
      this.refreshInFlight = false;
    }
  }

  /**
   * Retrieve all snapshots for a pair from the registry (all freshness levels).
   */
  getPoolsForPair(a: string, b: string): PoolSnapshot[] {
    return this.registry.poolsForPair(a, b);
  }

  /**
   * Check if a snapshot is stale based on the maxAgeMs threshold and current time.
   */
  isStale(snapshot: PoolSnapshot): boolean {
    const fetchedTime = Date.parse(snapshot.fetchedAt);
    if (!Number.isFinite(fetchedTime)) return true;
    return this.now() - fetchedTime > this.maxAgeMs;
  }

  /**
   * Retrieve only the fresh snapshots for a pair (filtered by staleness).
   */
  freshPoolsForPair(a: string, b: string): PoolSnapshot[] {
    return this.getPoolsForPair(a, b).filter((s) => !this.isStale(s));
  }

  /**
   * Start an automatic refresh loop at the given interval (in milliseconds).
   * Returns a stop function to cancel the loop.
   * Defaults to refreshing every 20000ms (~1 block).
   */
  startAutoRefresh(intervalMs: number = 20000): () => void {
    this.autoRefreshInterval = setInterval(() => {
      this.refresh().catch(() => {
        // Silently ignore promise rejections; refresh() never throws
      });
    }, intervalMs);

    return () => {
      if (this.autoRefreshInterval !== null) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    };
  }
}
