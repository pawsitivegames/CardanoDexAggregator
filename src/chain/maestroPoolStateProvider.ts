import type { PoolStateProvider, ChainUtxo, ChainAsset, ChainTip } from "./poolStateProvider";

/**
 * Maestro asset item.
 */
type MaestroAsset = {
  unit: string;
  amount: string;
};

/**
 * Maestro datum information.
 */
type MaestroDatum = {
  type?: string;
  hash?: string;
  bytes?: string;
};

/**
 * Maestro UTxO response item.
 */
type MaestroUtxo = {
  tx_hash: string;
  index: number;
  address: string;
  assets: MaestroAsset[];
  datum?: MaestroDatum;
};

/**
 * Maestro UTxO list response wrapper.
 */
type MaestroUtxoResponse = {
  data: MaestroUtxo[];
};

/**
 * Maestro chain tip response.
 */
type MaestroTip = {
  hash: string;
  height: number;
  slot?: number;
  absolute_slot?: number;
};

/**
 * Maestro tip wrapper response.
 */
type MaestroTipResponse = {
  data: MaestroTip;
};

/**
 * Implementation of PoolStateProvider for Maestro.
 */
export class MaestroPoolStateProvider implements PoolStateProvider {
  private fetchFn: typeof fetch;
  private baseUrl: string;

  constructor(fetchFn: typeof fetch = fetch, baseUrl: string = "/api/maestro/mainnet") {
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl;
  }

  async getUtxosAtAddress(address: string): Promise<ChainUtxo[]> {
    const response = await this.fetchFn(`${this.baseUrl}/addresses/${address}/utxos`);
    if (!response.ok) {
      throw new Error(`Maestro getUtxosAtAddress failed: ${response.status}`);
    }
    const data: MaestroUtxoResponse = await response.json();
    const utxos: MaestroUtxo[] = data.data || [];
    return utxos.map((utxo) => this.normalizeUtxo(utxo));
  }

  async resolveDatum(datumHash: string): Promise<string> {
    // TODO verify-against-live: Maestro datum resolution endpoint
    const response = await this.fetchFn(`${this.baseUrl}/datums/${datumHash}`);
    if (!response.ok) {
      throw new Error(`Maestro resolveDatum failed: ${response.status}`);
    }
    const data = await response.json();
    return data.bytes || "";
  }

  async getChainTip(): Promise<ChainTip> {
    const response = await this.fetchFn(`${this.baseUrl}/blocks/latest`);
    if (!response.ok) {
      throw new Error(`Maestro getChainTip failed: ${response.status}`);
    }
    const wrapper: MaestroTipResponse = await response.json();
    const data = wrapper.data;
    const slot = data.slot ?? data.absolute_slot;
    if (slot === undefined) {
      throw new Error("Maestro getChainTip failed: response missing slot");
    }
    return {
      slot,
      hash: data.hash,
      height: data.height,
    };
  }

  async submitTx(cborHex: string): Promise<string> {
    const cborBytes = new Uint8Array(cborHex.length / 2);
    for (let i = 0; i < cborHex.length; i += 2) {
      cborBytes[i / 2] = parseInt(cborHex.substr(i, 2), 16);
    }
    const response = await this.fetchFn(`${this.baseUrl}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor" },
      body: cborBytes,
    });
    if (!response.ok) {
      throw new Error(`Maestro submitTx failed: ${response.status}`);
    }
    const data = await response.json();
    return data.tx_hash || "";
  }

  private normalizeUtxo(utxo: MaestroUtxo): ChainUtxo {
    const assets: ChainAsset[] = utxo.assets.map((asset) => ({
      unit: asset.unit,
      quantity: BigInt(asset.amount),
    }));

    let datumHash: string | undefined;
    let inlineDatum: string | undefined;

    if (utxo.datum) {
      if (utxo.datum.hash) {
        datumHash = utxo.datum.hash;
      }
      if (utxo.datum.bytes) {
        inlineDatum = utxo.datum.bytes;
      }
    }

    return {
      txHash: utxo.tx_hash,
      outputIndex: utxo.index,
      address: utxo.address,
      assets,
      datumHash,
      inlineDatum,
    };
  }
}
