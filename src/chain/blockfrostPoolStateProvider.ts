import type { PoolStateProvider, ChainUtxo, ChainAsset, ChainTip } from "./poolStateProvider";

/**
 * Blockfrost-specific UTxO amount item.
 */
type BlockfrostAmount = {
  unit: string;
  quantity: string;
};

/**
 * Blockfrost UTxO response.
 */
type BlockfrostUtxo = {
  tx_hash: string;
  output_index: number;
  address: string;
  amount: BlockfrostAmount[];
  data_hash?: string;
  inline_datum?: string;
};

/**
 * Blockfrost chain tip response.
 */
type BlockfrostTip = {
  hash: string;
  slot: number;
  height: number;
};

/**
 * Implementation of PoolStateProvider for Blockfrost.
 */
export class BlockfrostPoolStateProvider implements PoolStateProvider {
  private fetchFn: typeof fetch;
  private baseUrl: string;

  constructor(fetchFn: typeof fetch = fetch, baseUrl: string = "/api/blockfrost/mainnet") {
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl;
  }

  async getUtxosAtAddress(address: string): Promise<ChainUtxo[]> {
    const response = await this.fetchFn(`${this.baseUrl}/addresses/${address}/utxos`);
    if (!response.ok) {
      throw new Error(`Blockfrost getUtxosAtAddress failed: ${response.status}`);
    }
    const data = await response.json();
    const utxos: BlockfrostUtxo[] = Array.isArray(data) ? data : [];
    return utxos.map((utxo) => this.normalizeUtxo(utxo));
  }

  async resolveDatum(datumHash: string): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/scripts/datums/${datumHash}`);
    if (!response.ok) {
      throw new Error(`Blockfrost resolveDatum failed: ${response.status}`);
    }
    const data = await response.json();
    return data.cbor || "";
  }

  async getChainTip(): Promise<ChainTip> {
    const response = await this.fetchFn(`${this.baseUrl}/blocks/latest`);
    if (!response.ok) {
      throw new Error(`Blockfrost getChainTip failed: ${response.status}`);
    }
    const data: BlockfrostTip = await response.json();
    return {
      slot: data.slot,
      hash: data.hash,
      height: data.height,
    };
  }

  async submitTx(cborHex: string): Promise<string> {
    const cborBytes = new Uint8Array(cborHex.length / 2);
    for (let i = 0; i < cborHex.length; i += 2) {
      cborBytes[i / 2] = parseInt(cborHex.substr(i, 2), 16);
    }
    const response = await this.fetchFn(`${this.baseUrl}/tx/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: cborBytes,
    });
    if (!response.ok) {
      throw new Error(`Blockfrost submitTx failed: ${response.status}`);
    }
    const data = await response.json();
    return data.tx_hash || "";
  }

  private normalizeUtxo(utxo: BlockfrostUtxo): ChainUtxo {
    const assets: ChainAsset[] = utxo.amount.map((amount) => ({
      unit: amount.unit,
      quantity: BigInt(amount.quantity),
    }));

    return {
      txHash: utxo.tx_hash,
      outputIndex: utxo.output_index,
      address: utxo.address,
      assets,
      datumHash: utxo.data_hash,
      inlineDatum: utxo.inline_datum,
    };
  }
}
