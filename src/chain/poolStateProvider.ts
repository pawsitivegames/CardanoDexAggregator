/**
 * Normalized chain asset representation.
 * unit: "lovelace" for ADA, or policyId+assetNameHex for other tokens.
 * quantity: BigInt for precise token amount handling.
 */
export type ChainAsset = {
  unit: string;
  quantity: bigint;
};

/**
 * Normalized UTxO representation across different chain providers.
 * Uniquely identified by (txHash, outputIndex) pair.
 */
export type ChainUtxo = {
  txHash: string;
  outputIndex: number;
  address: string;
  assets: ChainAsset[];
  datumHash?: string;
  inlineDatum?: string;
};

/**
 * Chain tip information.
 */
export type ChainTip = {
  slot: number;
  hash: string;
  height: number;
};

/**
 * Interface for accessing pool state and chain data.
 * Implementations support different chain data providers (Blockfrost, Maestro, etc).
 */
export interface PoolStateProvider {
  /**
   * Fetch UTxOs at a given address.
   */
  getUtxosAtAddress(address: string): Promise<ChainUtxo[]>;

  /**
   * Resolve a datum by its hash, returning CBOR hex.
   */
  resolveDatum(datumHash: string): Promise<string>;

  /**
   * Get current chain tip information.
   */
  getChainTip(): Promise<ChainTip>;

  /**
   * Submit a signed transaction (CBOR hex). Returns transaction hash.
   */
  submitTx(cborHex: string): Promise<string>;
}
