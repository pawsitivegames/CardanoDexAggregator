import { EXECUTABLE_NETWORK } from "../config/networks";
import { LOVELACE_ASSET_ID, requireAsset, type AssetId } from "../domain/assets";
import { decode } from "cborg";

export type WalletErrorCode =
  | "unavailable"
  | "rejected"
  | "wrong_network"
  | "balance_read_failed"
  | "malformed_balance";

export type WalletInfo = {
  id: string;
  name: string;
  icon?: string;
  apiVersion?: string;
};

export type Cip30WalletApi = {
  getNetworkId: () => Promise<number>;
  getBalance: () => Promise<string>;
  getUsedAddresses: () => Promise<string[]>;
  getUnusedAddresses: () => Promise<string[]>;
  getChangeAddress: () => Promise<string>;
  getRewardAddresses: () => Promise<string[]>;
  signTx: (tx: string, partialSign: boolean) => Promise<string>;
  submitTx: (tx: string) => Promise<string>;
};

export type Cip30WalletProvider = WalletInfo & {
  enable: () => Promise<Cip30WalletApi>;
  isEnabled?: () => Promise<boolean>;
};

export type WalletBalance = {
  assets: Record<AssetId, bigint>;
};

export type WalletContext =
  | {
      status: "disconnected";
      wallets: WalletInfo[];
      blocker?: string;
    }
  | {
      status: "connected";
      wallet: WalletInfo;
      walletApi: Cip30WalletApi;
      networkId: number;
      networkName: "mainnet" | "testnet";
      balance: WalletBalance;
      inputBalance: bigint;
      requiredInput: bigint;
      address: string;
      blockers: string[];
    }
  | {
      status: "error";
      wallet?: WalletInfo;
      code: WalletErrorCode;
      message: string;
    };

export type WalletCheckRequest = {
  inputAssetId: AssetId;
  amountIn: number;
};

const walletKeys = ["lace", "eternl", "nami", "flint", "gerowallet", "yoroi", "typhon", "nufi", "begin"];

function isProvider(value: unknown): value is Cip30WalletProvider {
  return typeof value === "object" && value !== null && typeof (value as Cip30WalletProvider).enable === "function";
}

export function discoverWallets(cardano: unknown): Cip30WalletProvider[] {
  if (typeof cardano !== "object" || cardano === null) return [];
  const record = cardano as Record<string, unknown>;

  const seen = new Set<string>();
  return walletKeys
    .map((key) => {
      const provider = record[key];
      if (!isProvider(provider)) return undefined;
      const name = provider.name || key;
      if (seen.has(name)) return undefined;
      seen.add(name);
      return {
        ...provider,
        id: key,
        name,
      };
    })
    .filter((wallet): wallet is Cip30WalletProvider => wallet !== undefined);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0) throw new Error("Empty hex string.");
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid CBOR hex.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}


export function parseBalanceCbor(hex: string): WalletBalance {
  const parsed = decode(hexToBytes(hex), { useMaps: true });
  const assets: Record<AssetId, bigint> = {};

  if (typeof parsed === "bigint") {
    assets[LOVELACE_ASSET_ID] = parsed;
    return { assets };
  }

  if (typeof parsed === "number") {
    assets[LOVELACE_ASSET_ID] = BigInt(parsed);
    return { assets };
  }

  if (!Array.isArray(parsed) || parsed.length < 1) {
    throw new Error("Balance CBOR is not a Cardano value.");
  }

  const coin = parsed[0];
  if (typeof coin === "bigint") {
    assets[LOVELACE_ASSET_ID] = coin;
  } else if (typeof coin === "number") {
    assets[LOVELACE_ASSET_ID] = BigInt(coin);
  }

  const multiAsset = parsed[1];
  const multiAssetEntries =
    multiAsset instanceof Map
      ? [...multiAsset.entries()]
      : Array.isArray(multiAsset)
        ? multiAsset
        : null;
  if (multiAssetEntries) {
    for (const [policyBytes, assetMap] of multiAssetEntries) {
      if (!(policyBytes instanceof Uint8Array)) continue;
      const policyId = bytesToHex(policyBytes);
      const innerEntries =
        assetMap instanceof Map
          ? [...assetMap.entries()]
          : Array.isArray(assetMap)
            ? assetMap
            : null;
      if (!innerEntries) continue;
      for (const [assetNameBytes, quantity] of innerEntries) {
        if (!(assetNameBytes instanceof Uint8Array)) continue;
        if (typeof quantity === "bigint") {
          assets[`${policyId}${bytesToHex(assetNameBytes)}`] = quantity;
        } else if (typeof quantity === "number" && Number.isFinite(quantity)) {
          assets[`${policyId}${bytesToHex(assetNameBytes)}`] = BigInt(Math.floor(quantity));
        }
      }
    }
  }

  return { assets };
}

export function requiredInputQuantity(request: WalletCheckRequest): bigint {
  const asset = requireAsset(request.inputAssetId);
  const scaled = request.amountIn * 10 ** asset.decimals;
  return BigInt(Math.ceil(scaled));
}

function networkName(networkId: number): "mainnet" | "testnet" {
  return networkId === 1 ? "mainnet" : "testnet";
}

function firstAddress(addresses: string[]): string | undefined {
  return addresses.find((addr) => addr.startsWith("addr")) ?? addresses[0];
}

export async function connectWallet(
  wallet: Cip30WalletProvider,
  request: WalletCheckRequest,
): Promise<WalletContext> {
  try {
    const api = await wallet.enable();
    const networkId = await api.getNetworkId();
    const balanceHex = await api.getBalance();
    const usedAddresses = await api.getUsedAddresses();
    const address = firstAddress(usedAddresses) ?? "";
    let balance: WalletBalance;

    try {
      balance = parseBalanceCbor(balanceHex);
    } catch {
      return {
        status: "error",
        wallet,
        code: "malformed_balance",
        message: "Wallet returned a balance format that ClearRoute could not parse.",
      };
    }

    const requiredInput = requiredInputQuantity(request);
    const inputBalance = balance.assets[request.inputAssetId] ?? 0n;
    const blockers: string[] = [];

    if (networkName(networkId) !== "testnet") {
      blockers.push(`Wrong network: connected wallet is ${networkName(networkId)}. Switch to testnet (preprod) for executable swaps.`);
    }

    if (inputBalance < requiredInput) {
      blockers.push("Insufficient input asset balance for the current amount.");
    }

    if (!address) {
      blockers.push("Could not retrieve a wallet address.");
    }

    return {
      status: "connected",
      wallet,
      walletApi: api,
      networkId,
      networkName: networkName(networkId),
      balance,
      inputBalance,
      requiredInput,
      address,
      blockers,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet connection was rejected or failed.";
    return {
      status: "error",
      wallet,
      code: message.toLowerCase().includes("balance") ? "balance_read_failed" : "rejected",
      message,
    };
  }
}
