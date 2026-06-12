export type AssetId = string;

export type AssetMetadata = {
  id: AssetId;
  symbol: string;
  name: string;
  decimals: number;
  mockPriceAda: number;
};

export const LOVELACE_ASSET_ID = "lovelace";

export const ASSETS: AssetMetadata[] = [
  {
    id: LOVELACE_ASSET_ID,
    symbol: "ADA",
    name: "Cardano",
    decimals: 6,
    mockPriceAda: 1,
  },
  {
    id: "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b",
    symbol: "SNEK",
    name: "Snek",
    decimals: 0,
    mockPriceAda: 0.002133176409662351,
  },
  {
    id: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
    symbol: "MIN",
    name: "Minswap",
    decimals: 6,
    mockPriceAda: 0.018786268639637727,
  },
  {
    id: "asset1hoskyclearrouteplaceholder",
    symbol: "HOSKY",
    name: "Hosky",
    decimals: 0,
    mockPriceAda: 0.000000029,
  },
];

export function getAsset(assetId: AssetId): AssetMetadata | undefined {
  return ASSETS.find((asset) => asset.id === assetId);
}

export function requireAsset(assetId: AssetId): AssetMetadata {
  const asset = getAsset(assetId);
  if (!asset) {
    throw new Error(`Unknown asset ID ${assetId}`);
  }
  return asset;
}

export function assetBySymbol(symbol: string): AssetMetadata | undefined {
  return ASSETS.find((asset) => asset.symbol === symbol);
}
